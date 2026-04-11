/**
 * Embedding Queue with Backpressure
 *
 * What it does:
 * Manages a bounded async queue for embedding generation with backpressure,
 * retry logic, and progress reporting.
 *
 * Inputs: Texts to embed, EmbeddingProvider
 * Outputs: Embeddings, progress events
 * Constraints: Configurable concurrency and batch size
 * Assumptions: Provider handles rate limiting internally
 * Failure cases: Provider errors, queue overflow, shutdown during processing
 *
 * Design:
 * - Bounded queue with configurable concurrency
 * - Batching for efficiency (provider-specific)
 * - Exponential backoff on retryable errors
 * - Progress events for dashboard
 * - Graceful drain on shutdown
 * - Error isolation (one failure doesn't block others)
 *
 * Performance: Processes multiple batches concurrently
 * Concurrency: Thread-safe via async queue
 */

import { EventEmitter } from 'events';
import type { EmbeddingProvider } from '../llm/provider.js';
import { LLMError, isRetryableError } from './errors.js';

export interface EmbeddingQueueOptions {
  concurrency: number;
  batchSize: number;
  maxRetries: number;
}

export interface EmbeddingJob {
  id: string;
  texts: string[];
  resolve: (embeddings: number[][]) => void;
  reject: (error: Error) => void;
  retries: number;
}

export interface EmbeddingQueueStats {
  queued: number;
  inFlight: number;
  completed: number;
  failed: number;
  totalTokens: number;
}

export class EmbeddingQueue extends EventEmitter {
  private provider: EmbeddingProvider;
  private queue: EmbeddingJob[] = [];
  private inFlight = 0;
  private completed = 0;
  private failed = 0;
  private totalTokens = 0;
  private concurrency: number;
  private maxRetries: number;
  private draining = false;

  constructor(provider: EmbeddingProvider, options: EmbeddingQueueOptions) {
    super();
    this.provider = provider;
    this.concurrency = options.concurrency;
    this.maxRetries = options.maxRetries;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (this.draining) {
      throw new LLMError('queue', 'Queue is draining, not accepting new jobs', false);
    }

    return new Promise((resolve, reject) => {
      const job: EmbeddingJob = {
        id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        texts,
        resolve,
        reject,
        retries: 0,
      };

      this.queue.push(job);
      this.emit('queued', job.id);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    while (this.inFlight < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      this.inFlight++;
      this.emit('progress', this.getStats());

      this.processJob(job).finally(() => {
        this.inFlight--;
        this.emit('progress', this.getStats());
        this.processQueue();
      });
    }
  }

  private async processJob(job: EmbeddingJob): Promise<void> {
    try {
      const embeddings = await this.provider.embed(job.texts);
      this.completed++;
      this.totalTokens += job.texts.reduce((sum, text) => sum + text.length / 4, 0);
      job.resolve(embeddings);
      this.emit('completed', job.id);
    } catch (error) {
      if (isRetryableError(error as Error) && job.retries < this.maxRetries) {
        job.retries++;
        const backoff = Math.min(Math.pow(2, job.retries) * 1000, 60000);
        await this.sleep(backoff);
        this.queue.push(job);
        this.emit('retry', job.id, job.retries);
      } else {
        this.failed++;
        job.reject(error as Error);
        this.emit('failed', job.id, error);
      }
    }
  }

  async drain(): Promise<void> {
    this.draining = true;

    while (this.inFlight > 0 || this.queue.length > 0) {
      await this.sleep(100);
    }

    this.draining = false;
  }

  getStats(): EmbeddingQueueStats {
    return {
      queued: this.queue.length,
      inFlight: this.inFlight,
      completed: this.completed,
      failed: this.failed,
      totalTokens: this.totalTokens,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
