/**
 * Index Queue with Admission Control
 *
 * What it does:
 * Serializes index jobs to INDEX_MAX_CONCURRENT_JOBS and rejects overflow
 * beyond INDEX_QUEUE_MAX_DEPTH with IndexQueueFullError (HTTP 429).
 *
 * Design:
 * - Bounded queue with configurable max concurrent jobs
 * - FIFO processing of queued jobs  
 * - Rejects admission when at capacity (inFlight >= max && queued >= depth)
 * - Single-flight execution prevents concurrent indexing of same repo
 */

import { IndexQueueFullError } from './errors.js';

export interface IndexQueueOptions {
  maxConcurrent: number;
  maxDepth: number;
  memoryGuard?: any;
}

interface QueuedJob<T> {
  job: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export interface IndexQueueStats {
  inFlight: number;
  queued: number;
}

export class IndexQueue {
  private maxConcurrent: number;
  private maxDepth: number;
  private inFlight = 0;
  private queue: QueuedJob<unknown>[] = [];
  private memoryGuard?: any;

  constructor(options: IndexQueueOptions) {
    this.maxConcurrent = options.maxConcurrent;
    this.maxDepth = options.maxDepth;
    this.memoryGuard = options.memoryGuard;
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    // Check memory pressure before admission
    if (this.memoryGuard) {
      this.memoryGuard.assertAdmissible();
    }

    // Check admission: reject if at capacity
    if (this.inFlight >= this.maxConcurrent && this.queue.length >= this.maxDepth) {
      throw new IndexQueueFullError();
    }

    return new Promise<T>((resolve, reject) => {
      const queuedJob: QueuedJob<T> = {
        job,
        resolve,
        reject,
      };

      this.queue.push(queuedJob as QueuedJob<unknown>);
      this.processQueue();
    });
  }

  private processQueue(): void {
    // Start jobs while we have capacity and queued work
    while (this.inFlight < this.maxConcurrent && this.queue.length > 0) {
      const queuedJob = this.queue.shift();
      if (!queuedJob) break;

      this.inFlight++;

      // Execute the job
      queuedJob.job()
        .then((result) => {
          queuedJob.resolve(result);
        })
        .catch((error) => {
          queuedJob.reject(error);
        })
        .finally(() => {
          this.inFlight--;
          // Process any remaining queue
          this.processQueue();
        });
    }
  }

  getStats(): IndexQueueStats {
    return {
      inFlight: this.inFlight,
      queued: this.queue.length,
    };
  }
}