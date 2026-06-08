/**
 * Bounded worker thread pool for parsing files with recycling and crash isolation
 *
 * Manages a fixed-size pool of worker threads that parse files in parallel.
 * Features:
 * - Bounded pool size with fixed worker allocation
 * - FIFO request queue when all workers are busy
 * - Worker recycling after N successful parses to prevent memory leaks
 * - Crash isolation: worker exits are handled gracefully, workers are respawned
 * - Memory limits: each worker has capped heap via resourceLimits
 *
 * The pool maintains workers as either free or busy, dispatching to free workers
 * immediately or queueing requests when all workers are busy.
 */

import { Worker } from 'node:worker_threads';
import { IndexWorkerError } from './errors.js';
import type { ParsedFile } from './parser.js';

export interface ParseRequest {
  filePath: string;
  repositoryId: string;
  workspaceRoot: string;
}

interface PoolWorker {
  worker: Worker;
  busy: boolean;
  parsedCount: number;
  workerId: string;
}

interface QueuedRequest {
  request: ParseRequest;
  resolve: (result: ParsedFile | null) => void;
  reject: (error: Error) => void;
}

export interface ParsePoolOptions {
  size: number;
  recycleAfter: number;
  workerHeapMb: number;
  workerPath: string;
}

export class ParsePool {
  private workers: PoolWorker[] = [];
  private queue: QueuedRequest[] = [];
  private isTerminated = false;
  private totalParsedLifetime = 0;

  constructor(private options: ParsePoolOptions) {
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.options.size; i++) {
      this.workers.push(this.createWorker(i));
    }
  }

  private createWorker(index: number): PoolWorker {
    const workerId = `worker-${index}`;
    const worker = new Worker(this.options.workerPath, {
      resourceLimits: {
        maxOldGenerationSizeMb: this.options.workerHeapMb,
      },
    });

    const poolWorker: PoolWorker = {
      worker,
      busy: false,
      parsedCount: 0,
      workerId,
    };

    // Handle worker exit (crash or termination)
    worker.on('exit', (code) => {
      if (code !== 0 && !this.isTerminated) {
        console.warn(`index.worker.crashed`, {
          workerId,
          exitCode: code,
          parsedCount: poolWorker.parsedCount,
        });

        // Find and replace the crashed worker
        const workerIndex = this.workers.findIndex((w) => w.workerId === workerId);
        if (workerIndex >= 0) {
          this.workers[workerIndex] = this.createWorker(workerIndex);
        }
      }
    });

    return poolWorker;
  }

  private getFreeWorker(): PoolWorker | null {
    return this.workers.find((w) => !w.busy) || null;
  }

  private recycleWorkerIfNeeded(poolWorker: PoolWorker): void {
    if (poolWorker.parsedCount >= this.options.recycleAfter) {
      console.debug(`index.worker.recycled`, {
        workerId: poolWorker.workerId,
        parsedCount: poolWorker.parsedCount,
      });

      // Terminate the old worker and create a new one
      poolWorker.worker.terminate();
      const index = this.workers.findIndex((w) => w.workerId === poolWorker.workerId);
      if (index >= 0) {
        this.workers[index] = this.createWorker(index);
      }
    }
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      const freeWorker = this.getFreeWorker();
      if (!freeWorker) break;

      const queuedRequest = this.queue.shift()!;
      this.executeRequest(freeWorker, queuedRequest);
    }
  }

  private executeRequest(poolWorker: PoolWorker, queuedRequest: QueuedRequest): void {
    poolWorker.busy = true;
    const { request, resolve, reject } = queuedRequest;

    // Set up one-time message listener for this request
    const handleMessage = (response: any) => {
      poolWorker.worker.off('message', handleMessage);
      poolWorker.worker.off('exit', handleExit);
      
      poolWorker.busy = false;

      if (response.ok) {
        poolWorker.parsedCount++;
        this.totalParsedLifetime++;
        this.recycleWorkerIfNeeded(poolWorker);
        resolve(response.parsed);
      } else {
        // Worker reported an error (security or parse)
        console.warn(`index.file.skipped`, {
          filePath: request.filePath,
          reason: response.kind,
          message: response.message,
        });
        resolve(null); // Null indicates file should be skipped
      }

      // Process any queued requests
      this.processQueue();
    };

    const handleExit = (code: number) => {
      if (code !== 0) {
        poolWorker.worker.off('message', handleMessage);
        poolWorker.busy = false;
        
        // Worker crashed during this request
        reject(new IndexWorkerError(poolWorker.workerId, `worker exited with code ${code}`));
        
        // Process any queued requests with the respawned worker
        this.processQueue();
      }
    };

    poolWorker.worker.on('message', handleMessage);
    poolWorker.worker.on('exit', handleExit);

    // Send the request to the worker
    poolWorker.worker.postMessage(request);
  }

  public async parse(request: ParseRequest): Promise<ParsedFile | null> {
    if (this.isTerminated) {
      throw new Error('Parse pool is terminated');
    }

    return new Promise<ParsedFile | null>((resolve, reject) => {
      const freeWorker = this.getFreeWorker();
      
      if (freeWorker) {
        // Execute immediately
        this.executeRequest(freeWorker, { request, resolve, reject });
      } else {
        // Queue the request
        this.queue.push({ request, resolve, reject });
      }
    });
  }

  public async terminate(): Promise<void> {
    this.isTerminated = true;

    // Reject all queued requests
    while (this.queue.length > 0) {
      const queuedRequest = this.queue.shift()!;
      queuedRequest.reject(new Error('Parse pool is terminating'));
    }

    // Terminate all workers
    const terminatePromises = this.workers.map(async (poolWorker) => {
      await poolWorker.worker.terminate();
    });

    await Promise.all(terminatePromises);
    this.workers = [];
  }

  public getStats(): { size: number; busy: number; queued: number; totalParsed: number } {
    const busyCount = this.workers.filter((w) => w.busy).length;

    return {
      size: this.workers.length,
      busy: busyCount,
      queued: this.queue.length,
      totalParsed: this.totalParsedLifetime,
    };
  }
}