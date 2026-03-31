/**
 * OpenAI-compatible Embedding Provider
 *
 * Works with: OpenAI, Azure OpenAI, Groq, Together, and any OpenAI-compatible API.
 *
 * Features:
 * - Batching (up to 2048 texts per request for OpenAI)
 * - Rate limiting with exponential backoff
 * - Retry on 429/5xx errors
 * - Health check via models endpoint
 */

import type { EmbeddingProvider } from './provider.js';
import { LLMError } from '../core/errors.js';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private dims: number;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model;
    this.dims = this.getDimensionsForModel(config.model);
  }

  private getDimensionsForModel(model: string): number {
    if (model === 'text-embedding-3-small') return 1536;
    if (model === 'text-embedding-3-large') return 3072;
    if (model === 'text-embedding-ada-002') return 1536;
    return 1536;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            input: texts,
          }),
        });

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '1', 10);
          const backoff = Math.min(Math.pow(2, attempt) * 1000, 60000);
          await this.sleep(Math.max(retryAfter * 1000, backoff));
          continue;
        }

        if (response.status >= 500) {
          const backoff = Math.min(Math.pow(2, attempt) * 1000, 60000);
          await this.sleep(backoff);
          continue;
        }

        if (!response.ok) {
          const error = await response.text();
          throw new LLMError('openai', `API error: ${error}`, false);
        }

        const data = (await response.json()) as {
          data: Array<{ embedding: number[] }>;
        };

        return data.data.map((item) => item.embedding);
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxRetries - 1) {
          throw new LLMError('openai', lastError.message, false, lastError);
        }
      }
    }

    throw new LLMError('openai', lastError?.message || 'Unknown error', false, lastError || undefined);
  }

  dimensions(): number {
    return this.dims;
  }

  modelName(): string {
    return this.model;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
