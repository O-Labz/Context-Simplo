/**
 * Ollama Embedding Provider
 *
 * Connects to local Ollama instance for embedding generation.
 *
 * Features:
 * - Auto-detects available models
 * - Handles model pull prompts
 * - Health check via tags endpoint
 * - Single text per request (Ollama limitation)
 */

import type { EmbeddingProvider } from './provider.js';
import { LLMError } from '../core/errors.js';

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private model: string;
  private dims: number;

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.dims = this.getDimensionsForModel(config.model);
  }

  private getDimensionsForModel(model: string): number {
    if (model === 'nomic-embed-text') return 768;
    if (model === 'mxbai-embed-large') return 1024;
    if (model === 'all-minilm') return 384;
    return 768;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      try {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            prompt: text,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new LLMError('ollama', `API error: ${error}`, true);
        }

        const data = (await response.json()) as { embedding: number[] };
        embeddings.push(data.embedding);
      } catch (error) {
        throw new LLMError('ollama', (error as Error).message, true, error as Error);
      }
    }

    return embeddings;
  }

  dimensions(): number {
    return this.dims;
  }

  modelName(): string {
    return this.model;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];

      const data = (await response.json()) as { models: Array<{ name: string }> };
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }
}
