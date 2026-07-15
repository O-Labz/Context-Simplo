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

  describe('per-key single-flight coalescing', () => {
    it('should coalesce concurrent jobs with the same key', async () => {
      let executionCount = 0;
      let resolveJob: () => void;
      const jobPromise = new Promise<void>(resolve => {
        resolveJob = resolve;
      });

      // First job with key 'repo-1' - will block
      const job1Promise = indexQueue.run(async () => {
        executionCount++;
        await jobPromise;
        return 'job-1';
      }, 'repo-1');

      // Second job with same key 'repo-1' - should coalesce
      const job2Promise = indexQueue.run(async () => {
        executionCount++;
        return 'job-2';
      }, 'repo-1');

      // Third job with different key 'repo-2' - should execute separately
      const job3Promise = indexQueue.run(async () => {
        executionCount++;
        return 'job-3';
      }, 'repo-2');

      // Let them process
      await new Promise(resolve => setTimeout(resolve, 10));

      // Unblock the first job
      resolveJob!();

      // Wait for all to complete
      const results = await Promise.all([job1Promise, job2Promise, job3Promise]);

      // Jobs with key 'repo-1' should have only executed once (job-1)
      // Job with key 'repo-2' should have executed once
      // Total executions should be 2, not 3
      expect(executionCount).toBe(2);
      expect(results[0]).toBe('job-1');
      // job2 coalesced, so job1 ran again when job2 was resubmitted
      expect(results[2]).toBe('job-3');
    });

    it('should allow jobs with different keys to run concurrently', async () => {
      const queue = new IndexQueue({
        maxConcurrent: 2,
        maxDepth: 2,
      });

      const executionOrder: string[] = [];
      let resolveJob1: () => void;
      let resolveJob2: () => void;
      const job1Promise = new Promise<void>(resolve => {
        resolveJob1 = resolve;
      });
      const job2Promise = new Promise<void>(resolve => {
        resolveJob2 = resolve;
      });

      // Start two jobs with different keys - should run concurrently
      const result1Promise = queue.run(async () => {
        executionOrder.push('start-1');
        await job1Promise;
        executionOrder.push('end-1');
        return 'result-1';
      }, 'key-1');

      const result2Promise = queue.run(async () => {
        executionOrder.push('start-2');
        await job2Promise;
        executionOrder.push('end-2');
        return 'result-2';
      }, 'key-2');

      // Wait for both to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Both should have started
      expect(executionOrder).toContain('start-1');
      expect(executionOrder).toContain('start-2');

      // Unblock both
      resolveJob1!();
      resolveJob2!();

      // Wait for both to complete
      const results = await Promise.all([result1Promise, result2Promise]);

      expect(results).toEqual(['result-1', 'result-2']);
      expect(executionOrder).toEqual(['start-1', 'start-2', 'end-1', 'end-2']);
    });

    it('should handle jobs without keys normally', async () => {
      const executionCount: number[] = [];

      // Jobs without keys should all execute
      const promises = [
        indexQueue.run(async () => {
          executionCount.push(1);
          return 'result-1';
        }),
        indexQueue.run(async () => {
          executionCount.push(2);
          return 'result-2';
        }),
        indexQueue.run(async () => {
          executionCount.push(3);
          return 'result-3';
        }),
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual(['result-1', 'result-2', 'result-3']);
      expect(executionCount).toEqual([1, 2, 3]);
    });

    it('should coalesce queued jobs with same key', async () => {
      let executionCount = 0;
      let resolveBlocker: () => void;
      const blocker = new Promise<void>(resolve => {
        resolveBlocker = resolve;
      });

      // Block the queue with a long-running job
      const blockerPromise = indexQueue.run(async () => {
        await blocker;
        return 'blocker';
      });

      // Queue multiple jobs with same key - they should coalesce
      const job1Promise = indexQueue.run(async () => {
        executionCount++;
        return 'coalesced-job';
      }, 'same-key');

      const job2Promise = indexQueue.run(async () => {
        executionCount++;
        return 'coalesced-job';
      }, 'same-key');

      // Unblock the queue
      resolveBlocker!();

      // Wait for all to complete
      await Promise.all([blockerPromise, job1Promise, job2Promise]);

      // The two jobs with same-key should have coalesced into one execution
      expect(executionCount).toBe(1);
    });

    it('should expose maxConcurrent and maxDepth as public readonly', () => {
      expect(indexQueue.maxConcurrent).toBe(1);
      expect(indexQueue.maxDepth).toBe(2);
    });
  });
});