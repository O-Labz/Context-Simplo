/**
 * WatchReindexQueue - Coalescing queue for file watcher events
 *
 * What it does:
 * Accumulates file change events per repository and coalesces them before
 * triggering reindexing. Prevents thrashing when many files change at once
 * (e.g., git checkout). Processes deletes before changes.
 *
 * Design:
 * - Per-repository queues track pending deletes and changes
 * - Drain periodically after a configurable delay
 * - If change count exceeds threshold, fall back to full reindex
 * - Processes deletes first, then changes (or full reindex)
 *
 * Performance:
 * - Coalescing reduces redundant indexing operations
 * - Bounded queue prevents memory growth
 * - Batch processing improves throughput
 */

import type { Indexer } from './indexer.js';

export interface WatchQueueOptions {
  drainDelayMs?: number;
  fullReindexThreshold?: number;
}

interface RepositoryQueue {
  deletes: Set<string>;
  changes: Set<string>;
  drainTimer?: ReturnType<typeof setTimeout>;
}

export class WatchReindexQueue {
  private queues = new Map<string, RepositoryQueue>();
  private drainDelayMs: number;
  private fullReindexThreshold: number;
  private indexer: Indexer;

  constructor(indexer: Indexer, options: WatchQueueOptions = {}) {
    this.indexer = indexer;
    this.drainDelayMs = options.drainDelayMs ?? 500;
    this.fullReindexThreshold = options.fullReindexThreshold ?? 50;
  }

  enqueueDelete(filePath: string, repositoryId: string): void {
    const queue = this.getOrCreateQueue(repositoryId);
    queue.deletes.add(filePath);
    // Remove from changes if it was pending
    queue.changes.delete(filePath);
    this.scheduleDrain(repositoryId);
  }

  enqueueChange(filePath: string, repositoryId: string): void {
    const queue = this.getOrCreateQueue(repositoryId);
    // Don't add to changes if it's already marked for deletion
    if (!queue.deletes.has(filePath)) {
      queue.changes.add(filePath);
    }
    this.scheduleDrain(repositoryId);
  }

  private getOrCreateQueue(repositoryId: string): RepositoryQueue {
    let queue = this.queues.get(repositoryId);
    if (!queue) {
      queue = {
        deletes: new Set(),
        changes: new Set(),
      };
      this.queues.set(repositoryId, queue);
    }
    return queue;
  }

  private scheduleDrain(repositoryId: string): void {
    const queue = this.queues.get(repositoryId);
    if (!queue) return;

    // Clear existing timer
    if (queue.drainTimer) {
      clearTimeout(queue.drainTimer);
    }

    // Schedule new drain
    queue.drainTimer = setTimeout(() => {
      this.drain(repositoryId).catch(error => {
        console.error(`Error draining watch queue for ${repositoryId}:`, error);
      });
    }, this.drainDelayMs);
  }

  async drain(repositoryId: string): Promise<void> {
    const queue = this.queues.get(repositoryId);
    if (!queue) return;

    const deletes = Array.from(queue.deletes);
    const changes = Array.from(queue.changes);

    // Clear queue before processing
    queue.deletes.clear();
    queue.changes.clear();
    if (queue.drainTimer) {
      clearTimeout(queue.drainTimer);
      queue.drainTimer = undefined;
    }

    if (deletes.length === 0 && changes.length === 0) {
      return;
    }

    // Process deletes first
    for (const filePath of deletes) {
      try {
        await this.indexer.graph.removeNodesInFile(filePath);
        this.indexer.storage.transaction(() => {
          this.indexer.storage.deleteNodesInFile(filePath);
          this.indexer.storage.deleteFile(filePath);
          this.indexer.storage.deleteCodeReferencesForFile(filePath);
        });
      } catch (error) {
        console.error(`Error deleting ${filePath}:`, error);
      }
    }

    // Check if we should do a full reindex
    if (changes.length > this.fullReindexThreshold) {
      console.warn(`Watch queue: ${changes.length} files changed, triggering full reindex for ${repositoryId}`);
      const repos = this.indexer.storage.listRepositories();
      const repo = repos.find(r => r.id === repositoryId);
      if (repo) {
        try {
          await this.indexer.indexRepository(repo.path, { incremental: false });
        } catch (error) {
          console.error(`Error during full reindex of ${repositoryId}:`, error);
        }
      }
      return;
    }

    // Process incremental changes
    const repos = this.indexer.storage.listRepositories();
    const repo = repos.find(r => r.id === repositoryId);
    if (!repo) {
      console.error(`Repository ${repositoryId} not found for incremental reindex`);
      return;
    }

    for (const filePath of changes) {
      try {
        const absolutePath = `${repo.path}/${filePath}`;
        await this.indexer.indexFile(absolutePath, repositoryId, true);
        // Resolve references for this file
        await this.indexer.resolveReferencesForFiles([filePath], repositoryId);
      } catch (error) {
        console.error(`Error reindexing ${filePath}:`, error);
      }
    }
  }

  getStats(): Record<string, { deletes: number; changes: number }> {
    const stats: Record<string, { deletes: number; changes: number }> = {};
    for (const [repoId, queue] of this.queues.entries()) {
      stats[repoId] = {
        deletes: queue.deletes.size,
        changes: queue.changes.size,
      };
    }
    return stats;
  }

  async close(): Promise<void> {
    // Drain all queues before closing
    for (const repositoryId of this.queues.keys()) {
      await this.drain(repositoryId);
    }
    this.queues.clear();
  }
}
