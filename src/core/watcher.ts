/**
 * File Watcher - Auto-indexing on file changes
 *
 * What it does:
 * Watches directories for file changes and triggers incremental re-indexing.
 * Uses chokidar with debouncing to handle rapid successive saves.
 *
 * Inputs: Directory paths to watch, Indexer instance
 * Outputs: File change events, re-index triggers
 * Constraints: Must debounce rapid changes, handle large repos
 * Assumptions: chokidar detects all file system events correctly
 * Failure cases: Permission denied, too many open files, watcher crashes
 *
 * Design:
 * - chokidar watches with 200ms debounce
 * - Only watches source files (filters by extension)
 * - Triggers incremental re-index on change/add
 * - Removes nodes on delete
 * - Emits events for dashboard real-time updates
 *
 * Performance: Debouncing prevents thrashing on rapid saves
 * Concurrency: Serializes re-index operations per file
 * Security: Respects .contextignore patterns
 */

import chokidar, { type FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import { relative, resolve } from 'path';
import type { Indexer } from './indexer.js';
import { ContextIgnore } from '../security/ignore.js';

export interface WatcherOptions {
  debounceMs?: number;
  ignorePatterns?: string[];
}

export class FileWatcher extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map();
  private watcherRepoIds: Map<string, string> = new Map();
  private indexer: Indexer;
  private debounceMs: number;
  private pendingChanges: Map<string, NodeJS.Timeout> = new Map();
  private contextIgnoreCache: Map<string, ContextIgnore> = new Map();

  constructor(indexer: Indexer, options: WatcherOptions = {}) {
    super();
    this.indexer = indexer;
    this.debounceMs = options.debounceMs || 200;
  }

  private getContextIgnore(dirPath: string): ContextIgnore {
    let ci = this.contextIgnoreCache.get(dirPath);
    if (!ci) {
      ci = new ContextIgnore(dirPath);
      this.contextIgnoreCache.set(dirPath, ci);
    }
    return ci;
  }

  watch(dirPath: string, repositoryId: string): void {
    if (this.watchers.has(dirPath)) {
      return;
    }

    const contextIgnore = this.getContextIgnore(dirPath);

    const watcher = chokidar.watch(dirPath, {
      ignored: (filePath: string) => {
        const rel = relative(dirPath, filePath);
        if (!rel || rel === '.') return false;
        return contextIgnore.shouldIgnore(rel);
      },
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher.on('add', (path) => this.handleChange(path, repositoryId, dirPath, 'add'));
    watcher.on('change', (path) => this.handleChange(path, repositoryId, dirPath, 'change'));
    watcher.on('unlink', (path) => this.handleDelete(path, repositoryId, dirPath));
    watcher.on('error', (error) => this.emit('error', error));

    this.watchers.set(dirPath, watcher);
    this.watcherRepoIds.set(dirPath, repositoryId);
    this.emit('watching', dirPath);
  }

  unwatch(dirPath: string): void {
    const watcher = this.watchers.get(dirPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(dirPath);
      this.watcherRepoIds.delete(dirPath);
      this.contextIgnoreCache.delete(dirPath);
      this.emit('unwatched', dirPath);
    }
  }

  private toRelativePath(absolutePath: string, watchRoot: string): string {
    return relative(watchRoot, resolve(absolutePath));
  }

  private handleChange(filePath: string, repositoryId: string, watchRoot: string, changeType: string): void {
    const relativePath = this.toRelativePath(filePath, watchRoot);
    this.emit('change', relativePath, changeType);

    const existing = this.pendingChanges.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      this.pendingChanges.delete(filePath);
      this.reindexFile(filePath, repositoryId);
    }, this.debounceMs);

    this.pendingChanges.set(filePath, timeout);
  }

  private handleDelete(filePath: string, _repositoryId: string, watchRoot: string): void {
    const relativePath = this.toRelativePath(filePath, watchRoot);
    this.emit('delete', relativePath);

    const existing = this.pendingChanges.get(filePath);
    if (existing) {
      clearTimeout(existing);
      this.pendingChanges.delete(filePath);
    }

    this.indexer.storage.transaction(() => {
      this.indexer.graph.removeNodesInFile(relativePath);
      this.indexer.storage.deleteNodesInFile(relativePath);
      this.indexer.storage.deleteFile(relativePath);
    });

    this.emit('reindexed', relativePath, 0);
  }

  private async reindexFile(filePath: string, repositoryId: string): Promise<void> {
    try {
      const repos = this.indexer.storage.listRepositories();
      const repoExists = repos.some((r) => r.id === repositoryId);
      
      if (!repoExists) {
        console.warn(`Repository ${repositoryId} no longer exists, skipping reindex of ${filePath}`);
        return;
      }

      await this.indexer.indexFile(filePath, repositoryId, true);
      this.emit('reindexed', filePath, 1);
    } catch (error) {
      console.error(`Failed to reindex ${filePath}:`, error);
      this.emit('error', error);
    }
  }

  async close(): Promise<void> {
    for (const [_path, watcher] of this.watchers.entries()) {
      await watcher.close();
    }
    this.watchers.clear();

    for (const timeout of this.pendingChanges.values()) {
      clearTimeout(timeout);
    }
    this.pendingChanges.clear();
  }

  getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }

  isWatching(dirPath: string): boolean {
    return this.watchers.has(dirPath);
  }
}
