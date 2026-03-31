/**
 * Embedding Queue Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { EmbeddingQueue } from '../../src/core/embedding-queue.js';
import type { EmbeddingProvider } from '../../src/llm/provider.js';

const createMockProvider = (embeddings: number[][]): EmbeddingProvider => ({
  async embed(texts: string[]): Promise<number[][]> {
    return embeddings.slice(0, texts.length);
  },
  dimensions(): number {
    return 384;
  },
  modelName(): string {
    return 'mock-model';
  },
  async healthCheck(): Promise<boolean> {
    return true;
  },
});

describe('EmbeddingQueue', () => {
  it('should process single job successfully', async () => {
    const mockEmbeddings = [[0.1, 0.2, 0.3]];
    const provider = createMockProvider(mockEmbeddings);
    const queue = new EmbeddingQueue(provider, {
      concurrency: 1,
      batchSize: 10,
      maxRetries: 3,
    });

    const result = await queue.embed(['hello world']);

    expect(result).toEqual([[0.1, 0.2, 0.3]]);
  });

  it('should process multiple jobs concurrently', async () => {
    const mockEmbeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ];
    const provider = createMockProvider(mockEmbeddings);
    const queue = new EmbeddingQueue(provider, {
      concurrency: 2,
      batchSize: 10,
      maxRetries: 3,
    });

    const results = await Promise.all([
      queue.embed(['text1']),
      queue.embed(['text2']),
      queue.embed(['text3']),
    ]);

    expect(results.length).toBe(3);
    expect(results[0]).toEqual([[0.1, 0.2]]);
    expect(results[1]).toEqual([[0.3, 0.4]]);
    expect(results[2]).toEqual([[0.5, 0.6]]);
  });

  it('should emit progress events', async () => {
    const provider = createMockProvider([[0.1, 0.2]]);
    const queue = new EmbeddingQueue(provider, {
      concurrency: 1,
      batchSize: 10,
      maxRetries: 3,
    });

    const progressEvents: any[] = [];
    queue.on('progress', (stats) => progressEvents.push(stats));

    await queue.embed(['test']);

    expect(progressEvents.length).toBeGreaterThan(0);
  });

  it('should retry on retryable errors', async () => {
    let attempts = 0;
    const provider: EmbeddingProvider = {
      async embed(_texts: string[]): Promise<number[][]> {
        attempts++;
        if (attempts < 2) {
          const error: any = new Error('Rate limit');
          error.retryable = true;
          throw error;
        }
        return [[0.1, 0.2]];
      },
      dimensions: () => 384,
      modelName: () => 'mock',
      healthCheck: async () => true,
    };

    const queue = new EmbeddingQueue(provider, {
      concurrency: 1,
      batchSize: 10,
      maxRetries: 3,
    });

    const result = await queue.embed(['test']);

    expect(attempts).toBe(2);
    expect(result).toEqual([[0.1, 0.2]]);
  });

  it('should fail after max retries', async () => {
    const provider: EmbeddingProvider = {
      async embed(_texts: string[]): Promise<number[][]> {
        const error: any = new Error('Persistent failure');
        error.retryable = true;
        throw error;
      },
      dimensions: () => 384,
      modelName: () => 'mock',
      healthCheck: async () => true,
    };

    const queue = new EmbeddingQueue(provider, {
      concurrency: 1,
      batchSize: 10,
      maxRetries: 2,
    });

    await expect(queue.embed(['test'])).rejects.toThrow('Persistent failure');
  });

  it('should track stats correctly', async () => {
    const provider = createMockProvider([[0.1, 0.2]]);
    const queue = new EmbeddingQueue(provider, {
      concurrency: 1,
      batchSize: 10,
      maxRetries: 3,
    });

    const promise = queue.embed(['test']);
    const statsDuring = queue.getStats();

    expect(statsDuring.queued + statsDuring.inFlight).toBeGreaterThan(0);

    await promise;

    const statsAfter = queue.getStats();
    expect(statsAfter.completed).toBe(1);
    expect(statsAfter.failed).toBe(0);
  });

  it('should drain gracefully', async () => {
    const provider = createMockProvider([[0.1, 0.2], [0.3, 0.4]]);
    const queue = new EmbeddingQueue(provider, {
      concurrency: 1,
      batchSize: 10,
      maxRetries: 3,
    });

    const promise1 = queue.embed(['test1']);
    const promise2 = queue.embed(['test2']);

    await queue.drain();

    const stats = queue.getStats();
    expect(stats.queued).toBe(0);
    expect(stats.inFlight).toBe(0);

    await expect(promise1).resolves.toBeDefined();
    await expect(promise2).resolves.toBeDefined();
  });
});
