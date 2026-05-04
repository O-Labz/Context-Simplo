/**
 * End-to-End Integration Tests
 *
 * Tests the full pipeline: parse -> graph -> storage -> search
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { CodeGraph } from '../../src/core/graph.js';
import { Indexer } from '../../src/core/indexer.js';
import { SymbolicSearch } from '../../src/search/symbolic.js';
import { formatMCPResponse } from '../../src/mcp/formatter.js';
import { loadConfig } from '../../src/core/config.js';

const TEST_WORKSPACE = resolve(__dirname, '../fixtures/e2e-test');
const TEST_DB = resolve(TEST_WORKSPACE, 'test.db');

describe('End-to-End Pipeline', () => {
  let storage: SqliteStorageProvider;
  let graph: CodeGraph;
  let indexer: Indexer;
  let symbolicSearch: SymbolicSearch;

  beforeAll(async () => {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
    mkdirSync(TEST_WORKSPACE, { recursive: true });

    writeFileSync(
      resolve(TEST_WORKSPACE, 'index.ts'),
      `
export function hello(name: string): string {
  return greet(name);
}

function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class UserService {
  create(data: any) {
    return validate(data);
  }
}

function validate(data: any): boolean {
  return data !== null;
}
    `.trim()
    );

    storage = new SqliteStorageProvider(TEST_DB);
    await storage.initialize();

    graph = new CodeGraph();
    indexer = new Indexer(storage, graph, TEST_WORKSPACE);
    symbolicSearch = new SymbolicSearch(storage);
  });

  afterAll(async () => {
    storage.close();
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it('should index repository and build graph', async () => {
    const job = await indexer.indexRepository(TEST_WORKSPACE, {
      incremental: false,
      respectIgnore: false,
    });

    expect(job.filesProcessed).toBe(1);
    expect(job.nodesCreated).toBeGreaterThan(0);
    expect(job.edgesCreated).toBeGreaterThan(0);
  });

  it('should find symbols by name', async () => {
    const results = graph.findByName('hello');

    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe('hello');
    expect(results[0]?.kind).toBe('function');
  });

  it('should find call hierarchies', async () => {
    const helloNodes = graph.findByName('hello');
    expect(helloNodes.length).toBe(1);

    const callees = graph.getCallees(helloNodes[0]!.id);

    expect(callees.length).toBeGreaterThan(0);
    expect(callees.some((c) => c.name === 'greet')).toBe(true);
  });

  it('should perform BM25 search', () => {
    const result = symbolicSearch.search('UserService', 10, 0);

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]?.name).toBe('UserService');
  });

  it('should detect dead code', () => {
    const deadNodes = graph.findDeadCode('default-repo');

    expect(deadNodes.some((n) => n.name === 'validate')).toBe(true);
  });

  it('should handle incremental updates', async () => {
    writeFileSync(
      resolve(TEST_WORKSPACE, 'index.ts'),
      `
export function hello(name: string): string {
  return greet(name);
}

function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export function newFunction(): void {
  console.log('new');
}
    `.trim()
    );

    const job = await indexer.indexRepository(TEST_WORKSPACE, {
      incremental: true,
      respectIgnore: false,
    });

    expect(job.filesProcessed).toBe(1);

    const newFuncNodes = graph.findByName('newFunction');
    expect(newFuncNodes.length).toBe(1);
  });

  it('should persist and restore graph', () => {
    const serialized = graph.serialize();

    const newGraph = new CodeGraph();
    newGraph.deserialize(serialized);

    const stats = newGraph.getStats();
    expect(stats.nodeCount).toBeGreaterThan(0);
    expect(stats.edgeCount).toBeGreaterThan(0);
  });
});

// v0.2.0 regression: end-to-end MCP wire payload must stay within byte budget.
// Without this guard, accumulated drift across handlers + formatter could re-introduce
// the v0.1.0 bloat that no individual unit test catches.
describe('v0.2.0 MCP payload byte budget', () => {
  // Representative find_symbol result: 5 rows, full handler output shape, repo+lang shared.
  const fiveResultPayload = {
    results: Array.from({ length: 5 }, (_, i) => ({
      id: `hash${i.toString().padStart(12, '0')}`,
      nodeId: `node-${i}`,
      name: `findSymbol${i}`,
      qualifiedName: `src/mcp/handlers/query.findSymbol${i}`,
      kind: 'function',
      filePath: 'src/mcp/handlers/query.ts',
      lineStart: 19 + i * 30,
      lineEnd: 49 + i * 30,
      visibility: 'public',
      isExported: true,
      language: 'typescript',
      repositoryId: 'default-repo',
      docstring: null,
      complexity: null,
      parentSymbol: null,
    })),
    total: 5,
    limit: 10,
    offset: 0,
    hasMore: false,
  };

  it('compact mode: 5-result find_symbol response stays under 1500 bytes', () => {
    const config = loadConfig();
    const wire = formatMCPResponse(fiveResultPayload, config.responseMode.value);
    const byteSize = Buffer.byteLength(wire, 'utf8');
    expect(byteSize).toBeLessThan(1500);
  });

  it('compact mode is materially smaller than full mode for the same payload', () => {
    const compactBytes = Buffer.byteLength(formatMCPResponse(fiveResultPayload, 'compact'), 'utf8');
    const fullBytes = Buffer.byteLength(formatMCPResponse(fiveResultPayload, 'full'), 'utf8');
    // Compact must be at least 40% smaller; loosen only with explicit benchmark evidence.
    expect(compactBytes).toBeLessThan(fullBytes * 0.6);
  });

  it('compact mode default: output is minified (no indentation newlines)', () => {
    const config = loadConfig();
    const wire = formatMCPResponse(fiveResultPayload, config.responseMode.value);
    expect(wire).not.toMatch(/\n\s+"/);
  });
});
