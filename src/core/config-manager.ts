/**
 * Configuration Manager with Hot Reload
 *
 * What it does:
 * Orchestrates runtime configuration changes without requiring server restart.
 * Manages graceful service reinitialization when config changes.
 *
 * Inputs: Configuration updates from dashboard
 * Outputs: Reinitialized services, lifecycle events
 * Constraints: Must respect env-locked fields, maintain service availability
 * Assumptions: Services can be safely recreated, queue can be drained
 * Failure cases: Provider health check fails, concurrent reload attempts
 *
 * Design:
 * - Holds references to all hot-reloadable services
 * - Mutex lock prevents concurrent reloads
 * - Graceful draining before provider switches
 * - Rollback on failure (keeps old provider active)
 * - Broadcasts lifecycle events via WebSocket
 *
 * Performance: Reload takes 1-5 seconds depending on queue drain
 * Concurrency: Thread-safe via mutex lock
 */

import { EventEmitter } from 'events';
import type { StorageProvider } from '../store/provider.js';
import type { EmbeddingProvider } from '../llm/provider.js';
import type { EmbeddingQueue } from './embedding-queue.js';
import type { LLMProviderType, AppConfig } from './types.js';
import { loadConfig } from './config.js';
import { createEmbeddingProvider } from '../llm/provider.js';
import type { LanceDBVectorStore } from '../store/lance.js';
import type { VectorSearch } from '../search/vector.js';
import type { HybridSearch } from '../search/hybrid.js';

export interface ConfigManagerOptions {
  storage: StorageProvider;
  vectorStore?: LanceDBVectorStore;
  onEmbeddingProviderChange?: (provider: EmbeddingProvider | undefined) => Promise<void>;
  onEmbeddingQueueChange?: (queue: EmbeddingQueue | undefined) => Promise<void>;
  onVectorSearchChange?: (vectorSearch: VectorSearch | undefined, hybridSearch: HybridSearch | undefined) => Promise<void>;
}

export interface ReloadResult {
  success: boolean;
  changes: string[];
  error?: string;
  warnings?: string[];
}

export class ConfigManager extends EventEmitter {
  private storage: StorageProvider;
  private vectorStore?: LanceDBVectorStore;
  private embeddingProvider?: EmbeddingProvider;
  private embeddingQueue?: EmbeddingQueue;
  private vectorSearch?: VectorSearch;
  private hybridSearch?: HybridSearch;
  private reloading = false;
  private onEmbeddingProviderChange?: (provider: EmbeddingProvider | undefined) => Promise<void>;
  private onEmbeddingQueueChange?: (queue: EmbeddingQueue | undefined) => Promise<void>;
  private onVectorSearchChange?: (vectorSearch: VectorSearch | undefined, hybridSearch: HybridSearch | undefined) => Promise<void>;

  constructor(options: ConfigManagerOptions) {
    super();
    this.storage = options.storage;
    this.vectorStore = options.vectorStore;
    this.onEmbeddingProviderChange = options.onEmbeddingProviderChange;
    this.onEmbeddingQueueChange = options.onEmbeddingQueueChange;
    this.onVectorSearchChange = options.onVectorSearchChange;
  }

  setEmbeddingProvider(provider: EmbeddingProvider | undefined): void {
    this.embeddingProvider = provider;
  }

  setEmbeddingQueue(queue: EmbeddingQueue | undefined): void {
    this.embeddingQueue = queue;
  }

  setSearchServices(vectorSearch: any, hybridSearch: any): void {
    this.vectorSearch = vectorSearch;
    this.hybridSearch = hybridSearch;
  }

  getEmbeddingProvider(): EmbeddingProvider | undefined {
    return this.embeddingProvider;
  }

  getEmbeddingQueue(): EmbeddingQueue | undefined {
    return this.embeddingQueue;
  }

  getVectorSearch(): VectorSearch | undefined {
    return this.vectorSearch;
  }

  getHybridSearch(): HybridSearch | undefined {
    return this.hybridSearch;
  }

  async reloadConfig(updates: Record<string, unknown>): Promise<ReloadResult> {
    if (this.reloading) {
      return {
        success: false,
        changes: [],
        error: 'Configuration reload already in progress',
      };
    }

    this.reloading = true;
    this.emit('reloading', updates);

    const changes: string[] = [];
    const warnings: string[] = [];

    try {
      const dashboardConfig = this.storage.getConfig();
      const newConfig = loadConfig(dashboardConfig);

      const needsProviderReload = this.needsProviderReload(updates);
      const needsQueueUpdate = this.needsQueueUpdate(updates);

      if (needsProviderReload) {
        await this.reloadEmbeddingProvider(newConfig, changes, warnings);
      } else if (needsQueueUpdate) {
        await this.updateQueueSettings(newConfig, changes);
      }

      this.emit('reloaded', { changes, warnings });
      return { success: true, changes, warnings };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (this.listenerCount('error') > 0) {
        this.emit('error', errorMessage);
      }
      return {
        success: false,
        changes,
        error: errorMessage,
      };
    } finally {
      this.reloading = false;
    }
  }

  private needsProviderReload(updates: Record<string, unknown>): boolean {
    return !!(
      updates.llmProvider ||
      updates.llmApiKey ||
      updates.llmBaseUrl ||
      updates.llmEmbeddingModel
    );
  }

  private needsQueueUpdate(updates: Record<string, unknown>): boolean {
    return !!(updates.embeddingConcurrency || updates.embeddingBatchSize);
  }

  private async reloadEmbeddingProvider(
    newConfig: AppConfig,
    changes: string[],
    warnings: string[]
  ): Promise<void> {
    const oldProvider = this.embeddingProvider;
    const oldQueue = this.embeddingQueue;
    const newProviderType = newConfig.llmProvider.value as LLMProviderType;

    if (oldQueue) {
      console.log('Draining embedding queue before provider switch...');
      await oldQueue.drain();
      changes.push('Drained embedding queue');
    }

    let newProvider: EmbeddingProvider | undefined;
    let newQueue: EmbeddingQueue | undefined;

    try {
      if (newProviderType !== 'none') {
        newProvider = await createEmbeddingProvider(newProviderType, {
          apiKey: newConfig.llmApiKey.value,
          baseUrl: newConfig.llmBaseUrl.value,
          model: newConfig.llmEmbeddingModel.value,
        });

        const healthy = await newProvider.healthCheck();
        if (!healthy) {
          throw new Error(`Provider ${newProviderType} failed health check`);
        }

        const { EmbeddingQueue } = await import('./embedding-queue.js');
        newQueue = new EmbeddingQueue(newProvider, {
          concurrency: newConfig.embeddingConcurrency.value,
          batchSize: newConfig.embeddingBatchSize.value,
          maxRetries: 3,
        });

        changes.push(`Switched to ${newProviderType} provider`);
        changes.push(`Model: ${newProvider.modelName()}`);
        changes.push(`Dimensions: ${newProvider.dimensions()}`);

        if (oldProvider && oldProvider.dimensions() !== newProvider.dimensions()) {
          warnings.push(
            `Embedding dimensions changed from ${oldProvider.dimensions()} to ${newProvider.dimensions()}. ` +
            `Existing embeddings may be incompatible. Consider re-indexing.`
          );
        }
      } else {
        changes.push('Disabled embedding provider');
      }

      this.embeddingProvider = newProvider;
      this.embeddingQueue = newQueue;

      if (this.onEmbeddingProviderChange) {
        await this.onEmbeddingProviderChange(newProvider);
      }

      if (this.onEmbeddingQueueChange) {
        await this.onEmbeddingQueueChange(newQueue);
      }

      await this.recreateSearchServices(newProvider, changes);
    } catch (error) {
      this.embeddingProvider = oldProvider;
      this.embeddingQueue = oldQueue;
      throw error;
    }
  }

  private async recreateSearchServices(
    newProvider: EmbeddingProvider | undefined,
    changes: string[]
  ): Promise<void> {
    if (!newProvider) {
      this.vectorSearch = undefined;
      this.hybridSearch = undefined;
      changes.push('Disabled vector and hybrid search');
      
      if (this.onVectorSearchChange) {
        await this.onVectorSearchChange(undefined, undefined);
      }
      return;
    }

    try {
      const { VectorSearch } = await import('../search/vector.js');
      const { HybridSearch } = await import('../search/hybrid.js');
      const { SymbolicSearch } = await import('../search/symbolic.js');

      const symbolicSearch = new SymbolicSearch(this.storage);
      const vectorStore = await this.getVectorStore();

      if (vectorStore) {
        this.vectorSearch = new VectorSearch(vectorStore, newProvider);
        this.hybridSearch = new HybridSearch(symbolicSearch, this.vectorSearch);
        changes.push('Recreated vector and hybrid search services');

        if (this.onVectorSearchChange) {
          await this.onVectorSearchChange(this.vectorSearch, this.hybridSearch);
        }
      }
    } catch (error) {
      console.error('Failed to recreate search services:', error);
      throw error;
    }
  }

  private async getVectorStore(): Promise<LanceDBVectorStore | undefined> {
    return this.vectorStore;
  }

  private async updateQueueSettings(newConfig: AppConfig, changes: string[]): Promise<void> {
    if (!this.embeddingQueue) {
      return;
    }

    const { EmbeddingQueue } = await import('./embedding-queue.js');
    const newQueue = new EmbeddingQueue(this.embeddingProvider!, {
      concurrency: newConfig.embeddingConcurrency.value,
      batchSize: newConfig.embeddingBatchSize.value,
      maxRetries: 3,
    });

    this.embeddingQueue = newQueue;
    changes.push(`Updated queue: concurrency=${newConfig.embeddingConcurrency.value}, batchSize=${newConfig.embeddingBatchSize.value}`);

    if (this.onEmbeddingQueueChange) {
      await this.onEmbeddingQueueChange(newQueue);
    }
  }
}
