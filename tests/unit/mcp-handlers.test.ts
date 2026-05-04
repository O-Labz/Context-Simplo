/**
 * MCP Handler Tests
 *
 * Tests MCP tool handlers for validation, error handling, and path security.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { indexRepository, watchDirectory, deleteRepository } from '../../src/mcp/handlers/indexing.js';
import { semanticSearch, hybridSearch, exactSearch } from '../../src/mcp/handlers/search.js';
import {
  ExactSearchInputSchema,
  SemanticSearchInputSchema,
  HybridSearchInputSchema,
  FindSymbolInputSchema,
  FindCallersInputSchema,
  FindCalleesInputSchema,
  TOOL_DEFINITIONS,
  TOOL_DEFINITIONS_COMPACT,
} from '../../src/mcp/tools.js';
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

  // v0.2.0 regression: exactSearch must not attach snippets unless includeSnippets=true
  describe('exactSearch snippet gating', () => {
    it('does not include snippet field when includeSnippets is omitted (default off)', async () => {
      const result = (await exactSearch({ query: 'nonexistent_zzz_xyz' }, context)) as {
        results: Array<Record<string, unknown>>;
      };
      // Empty result set is acceptable; the assertion is "no snippet attached"
      for (const r of result.results) {
        expect(r['snippet']).toBeUndefined();
      }
    });

    it('does not include snippet field when includeSnippets=false', async () => {
      const result = (await exactSearch(
        { query: 'nonexistent_zzz_xyz', includeSnippets: false },
        context
      )) as { results: Array<Record<string, unknown>> };
      for (const r of result.results) {
        expect(r['snippet']).toBeUndefined();
      }
    });
  });
});

// v0.2.0 schema regression tests — guard against silent default reverts
describe('v0.2.0 schema defaults', () => {
  describe('search/query default limit is 10 (was 20 in v0.1.0)', () => {
    it('FindSymbolInputSchema defaults limit to 10', () => {
      const parsed = FindSymbolInputSchema.parse({ name: 'foo' });
      expect(parsed.limit).toBe(10);
    });

    it('FindCallersInputSchema defaults limit to 10', () => {
      const parsed = FindCallersInputSchema.parse({ symbolName: 'foo' });
      expect(parsed.limit).toBe(10);
    });

    it('FindCalleesInputSchema defaults limit to 10', () => {
      const parsed = FindCalleesInputSchema.parse({ symbolName: 'foo' });
      expect(parsed.limit).toBe(10);
    });

    it('ExactSearchInputSchema defaults limit to 10', () => {
      const parsed = ExactSearchInputSchema.parse({ query: 'foo' });
      expect(parsed.limit).toBe(10);
    });

    it('SemanticSearchInputSchema defaults limit to 10', () => {
      const parsed = SemanticSearchInputSchema.parse({ query: 'foo' });
      expect(parsed.limit).toBe(10);
    });

    it('HybridSearchInputSchema defaults limit to 10', () => {
      const parsed = HybridSearchInputSchema.parse({ query: 'foo' });
      expect(parsed.limit).toBe(10);
    });
  });

  describe('includeSnippets defaults to false (was always-on in v0.1.0)', () => {
    it('ExactSearchInputSchema.includeSnippets defaults to false', () => {
      const parsed = ExactSearchInputSchema.parse({ query: 'foo' });
      expect(parsed.includeSnippets).toBe(false);
    });

    it('SemanticSearchInputSchema.includeSnippets defaults to false', () => {
      const parsed = SemanticSearchInputSchema.parse({ query: 'foo' });
      expect(parsed.includeSnippets).toBe(false);
    });

    it('HybridSearchInputSchema.includeSnippets defaults to false', () => {
      const parsed = HybridSearchInputSchema.parse({ query: 'foo' });
      expect(parsed.includeSnippets).toBe(false);
    });

    it('includeSnippets=true is honored when passed explicitly', () => {
      const parsed = ExactSearchInputSchema.parse({ query: 'foo', includeSnippets: true });
      expect(parsed.includeSnippets).toBe(true);
    });
  });
});

// v0.2.0 regression guard: explain_architecture must NOT advertise false token costs
describe('v0.2.0 explain_architecture description', () => {
  const findTool = (defs: ReadonlyArray<{ name: string; inputSchema: unknown }>, name: string) =>
    defs.find((d) => d.name === name);

  const extractDetailLevelDescription = (tool: unknown): string => {
    const t = tool as {
      inputSchema: { properties: { detailLevel?: { description?: string } } };
    };
    return t?.inputSchema?.properties?.detailLevel?.description ?? '';
  };

  it('TOOL_DEFINITIONS explain_architecture does not advertise ~500/2000/5000 token estimates', () => {
    const tool = findTool(TOOL_DEFINITIONS, 'explain_architecture');
    expect(tool).toBeDefined();
    const desc = extractDetailLevelDescription(tool);
    expect(desc).not.toMatch(/~500\s*tokens/);
    expect(desc).not.toMatch(/~2000\s*tokens/);
    expect(desc).not.toMatch(/~5000\s*tokens/);
  });

  it('TOOL_DEFINITIONS_COMPACT explain_architecture does not advertise ~500/2000/5000 token estimates', () => {
    const tool = findTool(TOOL_DEFINITIONS_COMPACT, 'explain_architecture');
    expect(tool).toBeDefined();
    const desc = extractDetailLevelDescription(tool);
    expect(desc).not.toMatch(/~500\s*tokens/);
    expect(desc).not.toMatch(/~2000\s*tokens/);
    expect(desc).not.toMatch(/~5000\s*tokens/);
  });
});

// v0.2.0 regression: TOOL_DEFINITIONS_COMPACT[0] must not carry the long preamble
describe('v0.2.0 compact tool definitions preamble removed', () => {
  it('TOOL_DEFINITIONS_COMPACT[0] description is concise (no inline KEY_MAP duplication)', () => {
    const first = TOOL_DEFINITIONS_COMPACT[0]!;
    expect(first.description).not.toMatch(/COMPACT MODE/);
    expect(first.description).not.toMatch(/Respond terse/);
    expect(first.description.length).toBeLessThan(200);
  });
});
