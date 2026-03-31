/**
 * LLM Embedding Provider Interface
 *
 * Abstract interface for embedding generation. Implementations: OpenAI, Ollama.
 *
 * Design:
 * - All providers expose the same interface
 * - Factory function selects provider based on config
 * - Graceful degradation when no provider configured
 * - Health checks before embedding generation
 */

import type { LLMProviderType } from '../core/types.js';
import { LLMError } from '../core/errors.js';

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  dimensions(): number;
  modelName(): string;
  healthCheck(): Promise<boolean>;
}

export class NoOpEmbeddingProvider implements EmbeddingProvider {
  async embed(_texts: string[]): Promise<number[][]> {
    throw new LLMError(
      'none',
      'No LLM provider configured. Configure via dashboard at http://localhost:3001/setup',
      false
    );
  }

  dimensions(): number {
    return 0;
  }

  modelName(): string {
    return 'none';
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }
}

export async function createEmbeddingProvider(
  providerType: LLMProviderType,
  config: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }
): Promise<EmbeddingProvider> {
  if (providerType === 'none') {
    return new NoOpEmbeddingProvider();
  }

  if (providerType === 'openai') {
    const { OpenAIEmbeddingProvider } = await import('./openai.js');
    return new OpenAIEmbeddingProvider({
      apiKey: config.apiKey!,
      baseUrl: config.baseUrl,
      model: config.model || 'text-embedding-3-small',
    });
  }

  if (providerType === 'ollama') {
    const { OllamaEmbeddingProvider } = await import('./ollama.js');
    return new OllamaEmbeddingProvider({
      baseUrl: config.baseUrl || 'http://host.docker.internal:11434',
      model: config.model || 'nomic-embed-text',
    });
  }

  if (providerType === 'azure') {
    const { OpenAIEmbeddingProvider } = await import('./openai.js');
    return new OpenAIEmbeddingProvider({
      apiKey: config.apiKey!,
      baseUrl: config.baseUrl!,
      model: config.model || 'text-embedding-ada-002',
    });
  }

  throw new LLMError('unknown', `Unknown provider type: ${providerType}`, false);
}
