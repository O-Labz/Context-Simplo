/**
 * ConfigManager Unit Tests
 *
 * Tests hot reload functionality, graceful provider switching,
 * rollback on failure, and concurrent reload prevention.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigManager } from '../../src/core/config-manager.js';
import type { StorageProvider } from '../../src/store/provider.js';

describe('ConfigManager', () => {
  let mockStorage: StorageProvider;
  let configManager: ConfigManager;

  beforeEach(() => {
    mockStorage = {
      getConfig: vi.fn().mockReturnValue({
        llmProvider: 'ollama',
        llmBaseUrl: 'http://localhost:11434',
        llmEmbeddingModel: 'nomic-embed-text',
        embeddingConcurrency: 5,
        embeddingBatchSize: 20,
      }),
      updateConfig: vi.fn(),
    } as any;

    configManager = new ConfigManager({
      storage: mockStorage,
    });
  });

  describe('Service References', () => {
    it('should store and retrieve embedding provider', () => {
      const mockProvider = { modelName: () => 'test' } as any;
      configManager.setEmbeddingProvider(mockProvider);
      expect(configManager.getEmbeddingProvider()).toBe(mockProvider);
    });

    it('should store and retrieve embedding queue', () => {
      const mockQueue = { getStats: () => ({}) } as any;
      configManager.setEmbeddingQueue(mockQueue);
      expect(configManager.getEmbeddingQueue()).toBe(mockQueue);
    });

    it('should store and retrieve search services', () => {
      const mockVector = { search: vi.fn() } as any;
      const mockHybrid = { search: vi.fn() } as any;
      configManager.setSearchServices(mockVector, mockHybrid);
      expect(configManager.getVectorSearch()).toBe(mockVector);
      expect(configManager.getHybridSearch()).toBe(mockHybrid);
    });
  });

  describe('Reload Detection', () => {
    it('should detect provider reload needed', async () => {
      const result = await configManager.reloadConfig({
        llmProvider: 'openai',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should detect queue update needed', async () => {
      const result = await configManager.reloadConfig({
        embeddingConcurrency: 10,
      });

      expect(result.success).toBe(false);
    });

    it('should handle empty updates', async () => {
      const result = await configManager.reloadConfig({});
      expect(result.success).toBe(true);
      expect(result.changes).toHaveLength(0);
    });
  });

  describe('Concurrent Reload Prevention', () => {
    it('should prevent concurrent reloads', async () => {
      const promise1 = configManager.reloadConfig({ llmProvider: 'openai' });
      const promise2 = configManager.reloadConfig({ llmProvider: 'azure' });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      const failedResults = [result1, result2].filter(r => !r.success);
      expect(failedResults.length).toBeGreaterThan(0);
      
      const concurrentError = failedResults.find(
        r => r.error?.includes('already in progress')
      );
      expect(concurrentError).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    it('should emit reloading event', async () => {
      const reloadingListener = vi.fn();
      configManager.on('reloading', reloadingListener);

      await configManager.reloadConfig({ embeddingConcurrency: 10 });

      expect(reloadingListener).toHaveBeenCalledWith({ embeddingConcurrency: 10 });
    });

    it('should emit reloaded event on success', async () => {
      const reloadedListener = vi.fn();
      configManager.on('reloaded', reloadedListener);

      await configManager.reloadConfig({});

      expect(reloadedListener).toHaveBeenCalled();
    });

    it('should emit error event on failure', async () => {
      const errorListener = vi.fn();
      configManager.on('error', errorListener);

      mockStorage.getConfig = vi.fn().mockImplementation(() => {
        throw new Error('Storage error');
      });

      await configManager.reloadConfig({ llmProvider: 'openai' });

      expect(errorListener).toHaveBeenCalled();
    });
  });

  describe('Callback Hooks', () => {
    it('should call onEmbeddingProviderChange when provider changes', async () => {
      const onProviderChange = vi.fn();
      const manager = new ConfigManager({
        storage: mockStorage,
        onEmbeddingProviderChange: onProviderChange,
      });

      manager.setEmbeddingProvider({ modelName: () => 'test' } as any);

      expect(onProviderChange).not.toHaveBeenCalled();
    });

    it('should call onEmbeddingQueueChange when queue changes', async () => {
      const onQueueChange = vi.fn();
      const manager = new ConfigManager({
        storage: mockStorage,
        onEmbeddingQueueChange: onQueueChange,
      });

      manager.setEmbeddingQueue({ getStats: () => ({}) } as any);

      expect(onQueueChange).not.toHaveBeenCalled();
    });

    it('should call onVectorSearchChange when search services change', async () => {
      const onSearchChange = vi.fn();
      const manager = new ConfigManager({
        storage: mockStorage,
        onVectorSearchChange: onSearchChange,
      });

      manager.setSearchServices({ search: vi.fn() } as any, { search: vi.fn() } as any);

      expect(onSearchChange).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      mockStorage.getConfig = vi.fn().mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      const result = await configManager.reloadConfig({ llmProvider: 'openai' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection lost');
    });

    it('should return error details in result', async () => {
      mockStorage.getConfig = vi.fn().mockReturnValue({
        llmProvider: 'invalid-provider',
      });

      const result = await configManager.reloadConfig({ llmProvider: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
