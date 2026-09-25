/**
 * MCP Handler Tests
 *
 * Tests MCP tool handlers for validation, error handling, and path security.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { indexRepository, watchDirectory, deleteRepository } from '../../src/mcp/handlers/indexing.js';
import { semanticSearch, hybridSearch, exactSearch } from '../../src/mcp/handlers/search.js';
import {
  ExactSearchInputSchema,
  SemanticSearchInputSchema,
  HybridSearchInputSchema,
  FindSymbolInputSchema,
  FindCallersInputSchema,
  FindCalleesInputSchema,
  FindReferencesInputSchema,
} from '../../src/mcp/tools.js';
import { EML_MCP_TOOL_NAMES, resolveToolDefinitions } from '../../src/mcp/tool-catalog.js';
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
    
    const storage = new SqliteStorageProvider(':memory:');
    await storage.initialize();
    
    const graph = new CodeGraph();
    const indexer = new Indexer(
      storage,
      graph,
      workspaceRoot
    );
    
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

    it('accepts an index job without waiting for it to finish', async () => {
      let started = false;
      context.indexer.indexRepository = () => {
        started = true;
        return new Promise(() => {});
      };
      const accepted = await indexRepository({ path: '.' }, context);
      expect(started).toBe(true);
      expect(accepted).toEqual({
        status: 'accepted',
        path: workspaceRoot,
        message:
          'Indexing started. Other tools and the dashboard stay available; list_repositories updates when the job finishes.',
      });
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

    it('enabled=false delegates to unwatch when watcher unavailable', async () => {
      const result = await watchDirectory({ path: '.', enabled: false }, context);
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

    it('FindReferencesInputSchema defaults limit to 10 and direction to both', () => {
      const parsed = FindReferencesInputSchema.parse({ symbolName: 'foo' });
      expect(parsed.limit).toBe(10);
      expect(parsed.direction).toBe('both');
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
  const detailLevelDescription = (mode: 'full' | 'compact'): string => {
    const tool = resolveToolDefinitions(mode, 'full').find((entry) => entry.name === 'explain_architecture');
    const properties = tool?.inputSchema['properties'] as
      | { detailLevel?: { description?: string } }
      | undefined;
    return properties?.detailLevel?.description ?? '';
  };

  it('full explain_architecture schema does not advertise token estimates', () => {
    const desc = detailLevelDescription('full');
    expect(desc).not.toMatch(/~500\s*tokens/);
    expect(desc).not.toMatch(/~2000\s*tokens/);
    expect(desc).not.toMatch(/~5000\s*tokens/);
  });

  it('compact explain_architecture schema does not advertise token estimates', () => {
    const desc = detailLevelDescription('compact');
    expect(desc).not.toMatch(/~500\s*tokens/);
    expect(desc).not.toMatch(/~2000\s*tokens/);
    expect(desc).not.toMatch(/~5000\s*tokens/);
  });
});

describe('compact tool descriptions stay short', () => {
  it('index_repository compact description has no key-map preamble', () => {
    const first = resolveToolDefinitions('compact', 'full')[0]!;
    expect(first.description).not.toMatch(/COMPACT MODE/);
    expect(first.description).not.toMatch(/Respond terse/);
    expect(first.description.length).toBeLessThan(200);
  });
});

const REMOVED_V030_TOOLS = [
  'unwatch_directory',
  'get_stats',
  'find_callers',
  'find_callees',
  'calculate_complexity',
  'lint_context',
  'query_graph',
  'verify_memory',
  'reinforce_memory',
  'flag_contradiction',
] as const;

describe('v0.3.0 MCP tool surface', () => {
  const names = (defs: ReadonlyArray<{ name: string }>) => defs.map((d) => d.name);

  it('advertises 27 tools in full and compact modes', () => {
    expect(resolveToolDefinitions('full', 'full')).toHaveLength(27);
    expect(resolveToolDefinitions('compact', 'full')).toHaveLength(27);
  });

  it('removed tools are absent', () => {
    const advertised = names(resolveToolDefinitions('full', 'full'));
    for (const removed of REMOVED_V030_TOOLS) {
      expect(advertised).not.toContain(removed);
    }
  });

  it('find_references and memory_update are registered', () => {
    const advertised = names(resolveToolDefinitions('full', 'full'));
    expect(advertised).toContain('find_references');
    expect(advertised).toContain('memory_update');
  });

  it('find_symbol input schema names its arguments', () => {
    const tool = resolveToolDefinitions('compact', 'core').find((entry) => entry.name === 'find_symbol');
    const properties = tool?.inputSchema['properties'] as Record<string, unknown> | undefined;
    expect(properties).toHaveProperty('name');
    expect(properties).toHaveProperty('kind');
    const outputProperties = tool?.outputSchema['properties'] as Record<string, unknown> | undefined;
    expect(outputProperties).toHaveProperty('results');
    expect(outputProperties).toHaveProperty('total');
  });

  it('resolveToolDefinitions(core) exposes 14 structural tools only', () => {
    const core = resolveToolDefinitions('full', 'core');
    expect(core.length).toBe(14);
    expect(core.every((t) => !EML_MCP_TOOL_NAMES.has(t.name))).toBe(true);
  });

  it('resolveToolDefinitions(full) exposes all 27 tools', () => {
    expect(resolveToolDefinitions('full', 'full').length).toBe(27);
    expect(resolveToolDefinitions('compact', 'full').length).toBe(27);
  });
});
