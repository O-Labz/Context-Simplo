/**
 * WatchReindexQueue Unit Tests
 *
 * Tests the watch queue coalescing behavior:
 * - Enqueue deletes and changes
 * - Drain after delay
 * - Coalesce multiple changes
 * - Fall back to full reindex when threshold exceeded
 * - Process deletes before changes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WatchReindexQueue } from '../../src/core/watch-queue.js';
import { Indexer } from '../../src/core/indexer.js';
import { CodeGraph } from '../../src/core/graph.js';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

describe('WatchReindexQueue', () => {
  let tmpDir: string;
  let storage: SqliteStorageProvider;
  let graph: CodeGraph;
  let indexer: Indexer;
  let queue: WatchReindexQueue;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'watch-queue-test-'));
    storage = new SqliteStorageProvider(':memory:');
    await storage.initialize();
    graph = new CodeGraph(512);
    indexer = new Indexer(storage, graph, tmpDir);
    
    // Create test repository
    storage.upsertRepository({
      id: 'test-repo',
      path: tmpDir,
      name: 'test-repo',
      fileCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      languages: {},
      isWatched: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    queue = new WatchReindexQueue(indexer, {
      drainDelayMs: 100,
      fullReindexThreshold: 3,
    });
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('enqueues changes and reports stats', () => {
    queue.enqueueChange('file1.ts', 'test-repo');
    queue.enqueueChange('file2.ts', 'test-repo');

    const stats = queue.getStats();
    expect(stats['test-repo'].changes).toBe(2);
    expect(stats['test-repo'].deletes).toBe(0);
  });

  it('enqueues deletes and reports stats', () => {
    queue.enqueueDelete('file1.ts', 'test-repo');
    queue.enqueueDelete('file2.ts', 'test-repo');

    const stats = queue.getStats();
    expect(stats['test-repo'].changes).toBe(0);
    expect(stats['test-repo'].deletes).toBe(2);
  });

  it('removes from changes when file is deleted', () => {
    queue.enqueueChange('file1.ts', 'test-repo');
    queue.enqueueDelete('file1.ts', 'test-repo');

    const stats = queue.getStats();
    expect(stats['test-repo'].changes).toBe(0);
    expect(stats['test-repo'].deletes).toBe(1);
  });

  it('does not add to changes if already deleted', () => {
    queue.enqueueDelete('file1.ts', 'test-repo');
    queue.enqueueChange('file1.ts', 'test-repo');

    const stats = queue.getStats();
    expect(stats['test-repo'].changes).toBe(0);
    expect(stats['test-repo'].deletes).toBe(1);
  });

  it('drains after delay', async () => {
    queue.enqueueChange('file1.ts', 'test-repo');
    
    let statsBefore = queue.getStats();
    expect(statsBefore['test-repo'].changes).toBe(1);

    // Wait for drain
    await new Promise(resolve => setTimeout(resolve, 150));

    const statsAfter = queue.getStats();
    expect(statsAfter['test-repo']?.changes || 0).toBe(0);
  });

  it('coalesces multiple changes to same file', () => {
    queue.enqueueChange('file1.ts', 'test-repo');
    queue.enqueueChange('file1.ts', 'test-repo');
    queue.enqueueChange('file1.ts', 'test-repo');

    const stats = queue.getStats();
    // Should only have one entry for file1.ts (Set deduplicates)
    expect(stats['test-repo'].changes).toBe(1);
  });

  it('separates queues by repository', () => {
    storage.upsertRepository({
      id: 'repo2',
      path: tmpDir + '/repo2',
      name: 'repo2',
      fileCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      languages: {},
      isWatched: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    queue.enqueueChange('file1.ts', 'test-repo');
    queue.enqueueChange('file2.ts', 'repo2');

    const stats = queue.getStats();
    expect(stats['test-repo'].changes).toBe(1);
    expect(stats['repo2'].changes).toBe(1);
  });

  it('clears queue after drain', async () => {
    queue.enqueueChange('file1.ts', 'test-repo');
    queue.enqueueChange('file2.ts', 'test-repo');

    await queue.drain('test-repo');

    const stats = queue.getStats();
    expect(stats['test-repo']?.changes || 0).toBe(0);
  });

  it('triggers full reindex when threshold exceeded', async () => {
    // Spy on indexRepository
    const indexRepoSpy = vi.spyOn(indexer, 'indexRepository');
    
    // Enqueue more than threshold (threshold is 3)
    queue.enqueueChange('file1.ts', 'test-repo');
    queue.enqueueChange('file2.ts', 'test-repo');
    queue.enqueueChange('file3.ts', 'test-repo');
    queue.enqueueChange('file4.ts', 'test-repo');

    await queue.drain('test-repo');

    // Should have triggered full reindex
    expect(indexRepoSpy).toHaveBeenCalledWith(tmpDir, { incremental: false });
  });

  it('processes deletes before changes', async () => {
    const operations: string[] = [];
    
    // Spy on graph operations
    vi.spyOn(indexer.graph, 'removeNodesInFile').mockImplementation(async (filePath) => {
      operations.push(`delete:${filePath}`);
    });
    
    vi.spyOn(indexer, 'indexFile').mockImplementation(async (filePath) => {
      operations.push(`index:${filePath}`);
    });

    queue.enqueueDelete('deleted.ts', 'test-repo');
    queue.enqueueChange('changed.ts', 'test-repo');

    await queue.drain('test-repo');

    // Deletes should come before changes
    expect(operations[0]).toContain('delete:deleted.ts');
    expect(operations[1]).toContain('index:changed.ts');
  });

  it('closes and drains all queues', async () => {
    queue.enqueueChange('file1.ts', 'test-repo');
    
    await queue.close();

    const stats = queue.getStats();
    expect(Object.keys(stats).length).toBe(0);
  });
});
