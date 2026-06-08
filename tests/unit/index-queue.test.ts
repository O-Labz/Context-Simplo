/**
 * IndexQueue Unit Tests
 *
 * Tests the index admission control queue:
 * - Serializes jobs to maxConcurrent
 * - Rejects overflow with IndexQueueFullError beyond maxDepth
 * - Processes jobs in FIFO order
 * - Returns proper stats
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IndexQueue } from '../../src/core/index-queue.js';
import { IndexQueueFullError } from '../../src/core/errors.js';

describe('IndexQueue', () => {
  let indexQueue: IndexQueue;

  beforeEach(() => {
    indexQueue = new IndexQueue({
      maxConcurrent: 1,
      maxDepth: 2,
    });
  });

  it('should run a single job immediately', async () => {
    const result = await indexQueue.run(async () => {
      return 'test-result';
    });

    expect(result).toBe('test-result');
  });

  it('should serialize jobs to maxConcurrent', async () => {
    const executionOrder: number[] = [];
    const delays = [50, 30, 10]; // Jobs with different durations

    const promises = delays.map((delay, index) =>
      indexQueue.run(async () => {
        await new Promise(resolve => setTimeout(resolve, delay));
        executionOrder.push(index);
        return `job-${index}`;
      })
    );

    const results = await Promise.all(promises);

    // All jobs should complete
    expect(results).toEqual(['job-0', 'job-1', 'job-2']);
    // Jobs should execute in FIFO order despite different durations
    expect(executionOrder).toEqual([0, 1, 2]);
  });

  it('should reject jobs beyond maxDepth with IndexQueueFullError', async () => {
    // Start one job that blocks
    let resolveBlockingJob: () => void;
    const blockingPromise = new Promise<void>(resolve => {
      resolveBlockingJob = resolve;
    });

    // Start the blocking job
    const blockedJobPromise = indexQueue.run(async () => {
      await blockingPromise;
      return 'blocked-job';
    });

    // Fill the queue to maxDepth (2)
    const queuedJob1Promise = indexQueue.run(async () => 'queued-1');
    const queuedJob2Promise = indexQueue.run(async () => 'queued-2');

    // The next job should be rejected
    await expect(
      indexQueue.run(async () => 'rejected-job')
    ).rejects.toThrow(IndexQueueFullError);

    // Unblock the original job
    resolveBlockingJob!();
    
    // Wait for all jobs to complete
    await Promise.all([blockedJobPromise, queuedJob1Promise, queuedJob2Promise]);
  });

  it('should return correct stats', () => {
    let resolveJob: () => void;
    const jobPromise = new Promise<void>(resolve => {
      resolveJob = resolve;
    });

    // Start a job that will block
    const runningJobPromise = indexQueue.run(async () => {
      await jobPromise;
      return 'running-job';
    });

    // Add jobs to the queue
    const queuedJob1Promise = indexQueue.run(async () => 'queued-1');
    const queuedJob2Promise = indexQueue.run(async () => 'queued-2');

    const stats = indexQueue.getStats();
    expect(stats.inFlight).toBe(1);
    expect(stats.queued).toBe(2);

    // Clean up
    resolveJob!();
    return Promise.all([runningJobPromise, queuedJob1Promise, queuedJob2Promise]);
  });

  it('should handle job errors without affecting the queue', async () => {
    const results = await Promise.allSettled([
      indexQueue.run(async () => {
        throw new Error('Job 1 failed');
      }),
      indexQueue.run(async () => {
        return 'Job 2 success';
      }),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
    expect((results[1] as PromiseFulfilledResult<string>).value).toBe('Job 2 success');
  });

  it('should process jobs in FIFO order', async () => {
    const executionOrder: string[] = [];

    // Start a blocking job
    let resolveBlocker: () => void;
    const blocker = new Promise<void>(resolve => {
      resolveBlocker = resolve;
    });

    const blockingJobPromise = indexQueue.run(async () => {
      await blocker;
      executionOrder.push('blocking');
      return 'blocking';
    });

    // Queue several jobs
    const job1Promise = indexQueue.run(async () => {
      executionOrder.push('job1');
      return 'job1';
    });

    const job2Promise = indexQueue.run(async () => {
      executionOrder.push('job2');
      return 'job2';
    });

    // Unblock the first job
    resolveBlocker!();

    // Wait for all to complete
    await Promise.all([blockingJobPromise, job1Promise, job2Promise]);

    // Jobs should execute in FIFO order
    expect(executionOrder).toEqual(['blocking', 'job1', 'job2']);
  });
});