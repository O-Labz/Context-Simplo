/**
 * MCP Handler Tests
 *
 * Tests MCP tool handlers for validation, error handling, and path security.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { indexRepository, watchDirectory, deleteRepository } from '../../src/mcp/handlers/indexing.js';
import { semanticSearch, hybridSearch } from '../../src/mcp/handlers/search.js';
import { CodeGraph } from '../../src/core/graph.js';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { Indexer } from '../../src/core/indexer.js';
import { SymbolicSearch } from '../../src/search/symbolic.js';
import type { HandlerContext } from '../../src/mcp/handlers/indexing.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('MCP Handlers', () => {
  let context: HandlerContext;
  let tempDir: string;
  let workspaceRoot: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    workspaceRoot = tempDir;
    
    const storage = new SqliteStorageProvider(join(tempDir, 'test.db'));
    await storage.initialize();
    
    const graph = new CodeGraph();
    const indexer = new Indexer({
      storage,
      graph,
      workspaceRoot,
      maxConcurrency: 1,
    });
    
    const symbolicSearch = new SymbolicSearch(storage);

    context = {
      storage,
      graph,
      indexer,
      symbolicSearch,
      workspaceRoot,
    };
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('indexRepository', () => {
    it('should reject path traversal attempts', async () => {
      await expect(
        indexRepository({ path: '/etc/passwd' }, context)
      ).rejects.toThrow('Path traversal detected');
    });

    it('should reject paths with .. segments', async () => {
      await expect(
        indexRepository({ path: '../../../etc/passwd' }, context)
      ).rejects.toThrow('Path traversal detected');
    });

    it('should validate input with Zod', async () => {
      await expect(
        indexRepository({ path: 123 }, context)
      ).rejects.toThrow();
    });
  });

  describe('watchDirectory', () => {
    it('should reject path traversal attempts', async () => {
      await expect(
        watchDirectory({ path: '/etc' }, context)
      ).rejects.toThrow('Path traversal detected');
    });

    it('should return error when watcher not available', async () => {
      const result = await watchDirectory({ path: '.' }, context);
      expect(result).toMatchObject({
        success: false,
        message: 'File watcher is not available',
      });
    });
  });

  describe('deleteRepository', () => {
    it('should return success false for non-existent repository', async () => {
      const result = await deleteRepository({ repositoryId: 'non-existent' }, context);
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('not found'),
      });
    });
  });

  describe('semanticSearch', () => {
    it('should return error when vector search not available', async () => {
      const result = await semanticSearch({ query: 'test' }, context);
      expect(result).toMatchObject({
        error: expect.any(String),
        message: expect.stringContaining('not available'),
      });
    });

    it('should validate input with Zod', async () => {
      await expect(
        semanticSearch({ query: 123 }, context)
      ).rejects.toThrow();
    });
  });

  describe('hybridSearch', () => {
    it('should return error when hybrid search not available', async () => {
      const result = await hybridSearch({ query: 'test' }, context);
      expect(result).toMatchObject({
        error: expect.any(String),
        message: expect.stringContaining('not available'),
      });
    });
  });
});
