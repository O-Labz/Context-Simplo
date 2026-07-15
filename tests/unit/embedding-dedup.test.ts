/**
 * Tests for embedding deduplication via parse cache
 *
 * Verifies that:
 * 1. Backfiller uses cached parse when present (avoids re-read + re-parse)
 * 2. Backfiller still succeeds on cache miss (restart-safe)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCache } from '../../src/core/parse-cache.js';
import { EmbeddingBackfiller } from '../../src/core/embedding-backfill.js';
import type { StorageProvider } from '../../src/store/provider.js';
import type { EmbeddingQueue } from '../../src/core/embedding-queue.js';
import type { LanceDBVectorStore } from '../../src/store/lance.js';
import * as parser from '../../src/core/parser.js';
import * as fsPromises from 'node:fs/promises';

// Mock modules
vi.mock('../../src/core/parser.js', () => ({
  parseFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../../src/security/scrubber.js', () => ({
  scrubSecrets: vi.fn((content: string) => ({
    scrubbed: content,
    secretsFound: 0,
  })),
}));

describe('Embedding deduplication via parse cache', () => {
  let mockStorage: StorageProvider;
  let mockEmbeddingQueue: EmbeddingQueue;
  let mockVectorStore: LanceDBVectorStore;
  let backfiller: EmbeddingBackfiller;

  const mockParsedFile = {
    filePath: 'src/example.ts',
    repositoryId: 'test-repo',
    language: 'typescript',
    hash: 'abc123',
    nodes: [
      {
        id: 'node1',
        name: 'testFunction',
        qualifiedName: 'testFunction',
        kind: 'function' as const,
        language: 'typescript',
        filePath: 'src/example.ts',
        repositoryId: 'test-repo',
        lineStart: 1,
        lineEnd: 5,
        documentation: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    imports: [],
    calls: [],
    inheritance: [],
  };

  beforeEach(() => {
    // Clear cache before each test
    parseCache.clear();

    // Mock storage
    mockStorage = {
      listPendingEmbeddingFiles: vi.fn().mockReturnValue([]),
      updateFileEmbeddingStatus: vi.fn(),
      getFile: vi.fn(),
      transaction: vi.fn((fn) => fn()),
    } as unknown as StorageProvider;

    // Mock embedding queue
    mockEmbeddingQueue = {
      embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    } as unknown as EmbeddingQueue;

    // Mock vector store
    mockVectorStore = {
      upsertChunks: vi.fn().mockResolvedValue(undefined),
    } as unknown as LanceDBVectorStore;

    backfiller = new EmbeddingBackfiller(
      mockStorage,
      mockEmbeddingQueue,
      mockVectorStore,
      {
        concurrency: 1,
        batchSize: 10,
        pollIntervalMs: 100,
        workspaceRoot: '/test/workspace',
      }
    );
  });

  afterEach(() => {
    parseCache.clear();
  });

  it('should use cached parse when present', async () => {
    const fileContent = 'function testFunction() { return 42; }';
    
    // Populate cache (as indexer would)
    parseCache.set('src/example.ts', fileContent, mockParsedFile);

    // Mock storage to return one pending file
    vi.mocked(mockStorage.listPendingEmbeddingFiles).mockReturnValue([
      {
        path: 'src/example.ts',
        repositoryId: 'test-repo',
        hash: 'abc123',
        mtime: Date.now(),
        size: 100,
        nodeCount: 1,
        status: 'indexed',
        embeddingStatus: 'pending',
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Start and stop backfiller (processes one batch)
    await backfiller.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await backfiller.stop();

    // Verify parseFile was NOT called (cache hit)
    expect(parser.parseFile).not.toHaveBeenCalled();

    // Verify readFile was NOT called (cache hit)
    expect(fsPromises.readFile).not.toHaveBeenCalled();

    // Verify embedding queue was called
    expect(mockEmbeddingQueue.embed).toHaveBeenCalledWith([fileContent]);

    // Verify vector store upsert was called
    expect(mockVectorStore.upsertChunks).toHaveBeenCalled();

    // Verify file was marked as done
    expect(mockStorage.updateFileEmbeddingStatus).toHaveBeenCalledWith(
      'src/example.ts',
      'done'
    );
  });

  it('should fallback to read+parse on cache miss', async () => {
    const fileContent = 'function testFunction() { return 42; }';

    // Do NOT populate cache (simulate restart or cache miss)

    // Mock file read
    vi.mocked(fsPromises.readFile).mockResolvedValue(fileContent);

    // Mock parseFile
    vi.mocked(parser.parseFile).mockResolvedValue(mockParsedFile);

    // Mock storage to return one pending file
    vi.mocked(mockStorage.listPendingEmbeddingFiles).mockReturnValue([
      {
        path: 'src/example.ts',
        repositoryId: 'test-repo',
        hash: 'abc123',
        mtime: Date.now(),
        size: 100,
        nodeCount: 1,
        status: 'indexed',
        embeddingStatus: 'pending',
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Start and stop backfiller (processes one batch)
    await backfiller.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await backfiller.stop();

    // Verify readFile WAS called (cache miss)
    expect(fsPromises.readFile).toHaveBeenCalledWith(
      '/test/workspace/src/example.ts',
      'utf-8'
    );

    // Verify parseFile WAS called (cache miss)
    expect(parser.parseFile).toHaveBeenCalledWith(
      'src/example.ts',
      'test-repo',
      '/test/workspace'
    );

    // Verify embedding queue was called
    expect(mockEmbeddingQueue.embed).toHaveBeenCalledWith([fileContent]);

    // Verify vector store upsert was called
    expect(mockVectorStore.upsertChunks).toHaveBeenCalled();

    // Verify file was marked as done
    expect(mockStorage.updateFileEmbeddingStatus).toHaveBeenCalledWith(
      'src/example.ts',
      'done'
    );
  });

  it('should handle cache with correct stats', () => {
    const fileContent = 'function test() {}';
    
    parseCache.set('file1.ts', fileContent, mockParsedFile);
    parseCache.set('file2.ts', fileContent, mockParsedFile);

    const stats = parseCache.stats();
    expect(stats.entries).toBe(2);
    expect(stats.totalSizeBytes).toBeGreaterThan(0);

    parseCache.clear();
    const clearedStats = parseCache.stats();
    expect(clearedStats.entries).toBe(0);
    expect(clearedStats.totalSizeBytes).toBe(0);
  });

  it('should evict LRU entry when cache exceeds max entries', () => {
    // Fill cache to max entries (1000) by creating many small entries
    for (let i = 0; i < 1001; i++) {
      parseCache.set(`file${i}.ts`, 'small content', mockParsedFile);
    }

    const stats = parseCache.stats();
    // Should not exceed max entries
    expect(stats.entries).toBeLessThanOrEqual(1000);
    
    // First file should be evicted (LRU)
    expect(parseCache.get('file0.ts')).toBeUndefined();
    
    // Most recent file should still be present
    expect(parseCache.get('file1000.ts')).toBeDefined();
  });
});
