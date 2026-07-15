/**
 * Ollama Embedding Provider
 *
 * Connects to local Ollama instance for embedding generation.
 *
 * Features:
 * - Auto-detects available models
 * - Handles model pull prompts
 * - Health check via tags endpoint
 * - Batch embeddings via /api/embed (with fallback to /api/embeddings for older Ollama)
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
  private detectedDims: number | null = null;

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.dims = this.getDimensionsForModel(config.model);
  }

  private static readonly KNOWN_DIMENSIONS: Record<string, number> = {
    'nomic-embed-text': 768,
    'mxbai-embed-large': 1024,
    'all-minilm': 384,
    'snowflake-arctic-embed': 1024,
    'bge-m3': 1024,
    'bge-large': 1024,
    'llama3.1': 4096,
    'llama3.2': 3072,
    'llama3': 4096,
    'llama2': 4096,
    'mistral': 4096,
    'codellama': 4096,
    'gemma': 2048,
    'gemma2': 2304,
    'phi3': 3072,
    'qwen2': 3584,
    'deepseek-coder': 4096,
  };

  private getDimensionsForModel(model: string): number {
    const base = model.split(':')[0]?.toLowerCase() ?? '';
    return OllamaEmbeddingProvider.KNOWN_DIMENSIONS[base] ?? 0;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Try batch endpoint first (Ollama 0.1.17+)
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
      });

      // Fall back to per-text endpoint for older Ollama versions
      if (response.status === 404) {
        console.log(`Ollama batch endpoint not available, falling back to per-text /api/embeddings`);
        return this.embedPerText(texts);
      }

      if (!response.ok) {
        const error = await response.text();
        throw new LLMError('ollama', `Batch embed API error: ${error}`, true);
      }

      const data = (await response.json()) as { embeddings: number[][] };
      if (!data.embeddings || !Array.isArray(data.embeddings)) {
        throw new LLMError('ollama', `Model "${this.model}" returned no embeddings — it may not support embedding generation`, false);
      }

      if (data.embeddings.length !== texts.length) {
        throw new LLMError('ollama', `Expected ${texts.length} embeddings but got ${data.embeddings.length}`, false);
      }

      // Auto-detect dimensions from first embedding
      if (this.detectedDims === null && data.embeddings.length > 0) {
        this.detectedDims = data.embeddings[0]!.length;
        if (this.dims === 0) {
          this.dims = this.detectedDims;
          console.log(`Auto-detected embedding dimensions for ${this.model}: ${this.dims}`);
        } else if (this.dims !== this.detectedDims) {
          console.warn(`Dimension mismatch for ${this.model}: expected ${this.dims}, got ${this.detectedDims}. Using actual: ${this.detectedDims}`);
          this.dims = this.detectedDims;
        }
      }

      return data.embeddings;
    } catch (error) {
      if (error instanceof LLMError) throw error;
      throw new LLMError('ollama', (error as Error).message, true, error as Error);
    }
  }

  /**
   * Fallback for older Ollama versions without batch endpoint.
   * Makes one HTTP request per text.
   */
  private async embedPerText(texts: string[]): Promise<number[][]> {
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
          throw new LLMError('ollama', `Per-text embed API error: ${error}`, true);
        }

        const data = (await response.json()) as { embedding: number[] };
        if (!data.embedding || !Array.isArray(data.embedding)) {
          throw new LLMError('ollama', `Model "${this.model}" returned no embedding — it may not support embedding generation`, false);
        }
        embeddings.push(data.embedding);

        if (this.detectedDims === null) {
          this.detectedDims = data.embedding.length;
          if (this.dims === 0) {
            this.dims = this.detectedDims;
            console.log(`Auto-detected embedding dimensions for ${this.model}: ${this.dims}`);
          } else if (this.dims !== this.detectedDims) {
            console.warn(`Dimension mismatch for ${this.model}: expected ${this.dims}, got ${this.detectedDims}. Using actual: ${this.detectedDims}`);
            this.dims = this.detectedDims;
          }
        }
      } catch (error) {
        if (error instanceof LLMError) throw error;
        throw new LLMError('ollama', (error as Error).message, true, error as Error);
      }
    }

    return embeddings;
  }

  dimensions(): number {
    return this.detectedDims ?? this.dims;
  }

  modelName(): string {
    return this.model;
  }

  private static readonly EMBEDDING_MODELS = new Set([
    'nomic-embed-text', 'mxbai-embed-large', 'all-minilm',
    'snowflake-arctic-embed', 'bge-m3', 'bge-large',
  ]);

  isEmbeddingModel(): boolean {
    const base = this.model.split(':')[0]?.toLowerCase() ?? '';
    return OllamaEmbeddingProvider.EMBEDDING_MODELS.has(base);
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check if Ollama is running
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (!response.ok) {
        return false;
      }

      // Verify the model exists
      const data = (await response.json()) as { models: Array<{ name: string }> };
      const modelBase = this.model.split(':')[0] || this.model;
      const modelExists = data.models.some(m => m.name.startsWith(modelBase));
      
      if (!modelExists) {
        console.warn(`Ollama model "${this.model}" not found. Available models: ${data.models.map(m => m.name).join(', ')}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Ollama health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
