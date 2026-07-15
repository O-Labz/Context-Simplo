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
 * - Optional per-key single-flight coalescing (pass key to run())
 */

import { IndexQueueFullError } from './errors.js';

export interface IndexQueueOptions {
  maxConcurrent: number;
  maxDepth: number;
  memoryGuard?: unknown;
}

interface QueuedJob<T> {
  job: () => Promise<T>;
  // eslint-disable-next-line no-unused-vars
  resolve: (value: T) => void;
  // eslint-disable-next-line no-unused-vars
  reject: (error: Error) => void;
  key?: string;
}

export interface IndexQueueStats {
  inFlight: number;
  queued: number;
}

export class IndexQueue {
  public readonly maxConcurrent: number;
  public readonly maxDepth: number;
  private inFlight = 0;
  private queue: QueuedJob<unknown>[] = [];
  private memoryGuard?: unknown;
  private inFlightKeys = new Map<string, Promise<unknown>>();

  constructor(options: IndexQueueOptions) {
    this.maxConcurrent = options.maxConcurrent;
    this.maxDepth = options.maxDepth;
    this.memoryGuard = options.memoryGuard;
  }

  async run<T>(job: () => Promise<T>, key?: string): Promise<T> {
    // Check memory pressure before admission
    if (this.memoryGuard) {
      (this.memoryGuard as { assertAdmissible: () => void }).assertAdmissible();
    }

    // Single-flight coalescing: if key is in flight, join that execution
    if (key && this.inFlightKeys.has(key)) {
      return this.inFlightKeys.get(key) as Promise<T>;
    }

    // If key is already queued, join that queued job
    if (key) {
      const existingQueued = this.queue.find(q => q.key === key);
      if (existingQueued) {
        // Join the existing queued job by sharing its promise
        return new Promise<T>((resolve, reject) => {
          const originalResolve = existingQueued.resolve;
          const originalReject = existingQueued.reject;
          existingQueued.resolve = (_value: unknown) => {
            originalResolve(_value);
            resolve(_value as T);
          };
          existingQueued.reject = (_error: Error) => {
            originalReject(_error);
            reject(_error);
          };
        });
      }
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
        key,
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
      
      // Execute the job and track for coalescing
      const execution = queuedJob.job();
      
      // Handle result/error for the queued job
      execution
        .then((result) => {
          queuedJob.resolve(result);
        })
        .catch((error) => {
          queuedJob.reject(error);
        })
        .finally(() => {
          this.inFlight--;
          if (queuedJob.key) {
            this.inFlightKeys.delete(queuedJob.key);
          }
          // Process any remaining queue
          this.processQueue();
        });

      // Track the promise for coalescing (with error handler to avoid unhandled rejections)
      if (queuedJob.key) {
        const trackedPromise = execution.catch(() => { /* errors handled above */ });
        this.inFlightKeys.set(queuedJob.key, trackedPromise);
      }
    }
  }

  getStats(): IndexQueueStats {
    return {
      inFlight: this.inFlight,
      queued: this.queue.length,
    };
  }
}