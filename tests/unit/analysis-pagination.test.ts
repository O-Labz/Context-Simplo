/**
 * Analysis Pagination Tests
 *
 * Verifies Phase 9 remediation:
 * - SQL-side aggregation (no in-memory counting)
 * - Explicit pagination with limit/offset
 * - Truncated flag when results capped
 * - Real total counts from SQL
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { StorageBackedGraph } from '../../src/core/graph-store.js';
import type { CodeNode } from '../../src/core/types.js';

describe('Analysis Pagination', () => {
  let tempDir: string;
  let storage: SqliteStorageProvider;
  let graph: StorageBackedGraph;
  const repositoryId = 'test-repo-600-nodes';

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'context-simplo-test-'));
    const dbPath = join(tempDir, 'test.db');
    storage = new SqliteStorageProvider(dbPath);
    await storage.initialize();
    graph = new StorageBackedGraph(storage, { hotCacheMb: 1 });

    const repo = {
      id: repositoryId,
      path: '/test/repo',
      name: 'Test Repo',
      fileCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      languages: {},
      isWatched: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    storage.upsertRepository(repo);
  });

  afterEach(() => {
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds a 600-node fixture with unreferenced nodes', () => {
    const nodes: CodeNode[] = [];

    for (let i = 0; i < 600; i++) {
      nodes.push({
        id: `node-${i}`,
        name: `function${i}`,
        qualifiedName: `module.function${i}`,
        kind: 'function',
        filePath: `/test/file${Math.floor(i / 10)}.ts`,
        lineStart: (i % 10) * 10 + 1,
        lineEnd: (i % 10) * 10 + 5,
        visibility: 'private',
        isExported: false,
        repositoryId,
        language: 'typescript',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    storage.transaction(() => {
      storage.upsertNodes(nodes);
    });

    const nodeCount = storage.countNodes({ repositoryId });
    expect(nodeCount).toBe(600);
  });

  it('counts unreferenced nodes via SQL', () => {
    const nodes: CodeNode[] = [];

    for (let i = 0; i < 600; i++) {
      nodes.push({
        id: `node-${i}`,
        name: `function${i}`,
        qualifiedName: `module.function${i}`,
        kind: 'function',
        filePath: `/test/file${Math.floor(i / 10)}.ts`,
        lineStart: (i % 10) * 10 + 1,
        lineEnd: (i % 10) * 10 + 5,
        visibility: 'private',
        isExported: false,
        repositoryId,
        language: 'typescript',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    storage.transaction(() => {
      storage.upsertNodes(nodes);
    });

    const total = storage.countUnreferencedNodes(repositoryId);
    expect(total).toBe(600);
  });

  it('returns truncated flag when results exceed MAX_TRAVERSE_ROWS', () => {
    const nodes: CodeNode[] = [];

    for (let i = 0; i < 600; i++) {
      nodes.push({
        id: `node-${i}`,
        name: `function${i}`,
        qualifiedName: `module.function${i}`,
        kind: 'function',
        filePath: `/test/file${Math.floor(i / 10)}.ts`,
        lineStart: (i % 10) * 10 + 1,
        lineEnd: (i % 10) * 10 + 5,
        visibility: 'private',
        isExported: false,
        repositoryId,
        language: 'typescript',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    storage.transaction(() => {
      storage.upsertNodes(nodes);
    });

    const result = graph.findDeadCode(repositoryId);

    expect(result.total).toBe(600);
    expect(result.results.length).toBe(500);
    expect(result.truncated).toBe(true);
  });

  it('does not set truncated flag when results are below MAX_TRAVERSE_ROWS', () => {
    const nodes: CodeNode[] = [];

    for (let i = 0; i < 100; i++) {
      nodes.push({
        id: `node-${i}`,
        name: `function${i}`,
        qualifiedName: `module.function${i}`,
        kind: 'function',
        filePath: `/test/file${Math.floor(i / 10)}.ts`,
        lineStart: (i % 10) * 10 + 1,
        lineEnd: (i % 10) * 10 + 5,
        visibility: 'private',
        isExported: false,
        repositoryId,
        language: 'typescript',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    storage.transaction(() => {
      storage.upsertNodes(nodes);
    });

    const result = graph.findDeadCode(repositoryId);

    expect(result.total).toBe(100);
    expect(result.results.length).toBe(100);
    expect(result.truncated).toBe(false);
  });

  it('supports SQL-side pagination with limit and offset', () => {
    const nodes: CodeNode[] = [];

    for (let i = 0; i < 150; i++) {
      const fileNum = Math.floor(i / 10).toString().padStart(3, '0');
      nodes.push({
        id: `node-${i}`,
        name: `function${i}`,
        qualifiedName: `module.function${i}`,
        kind: 'function',
        filePath: `/test/file${fileNum}.ts`,
        lineStart: (i % 10) * 10 + 1,
        lineEnd: (i % 10) * 10 + 5,
        visibility: 'private',
        isExported: false,
        repositoryId,
        language: 'typescript',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    storage.transaction(() => {
      storage.upsertNodes(nodes);
    });

    const page1 = storage.findUnreferencedNodes(repositoryId, 50, 0);
    expect(page1.length).toBe(50);
    expect(page1[0]?.id).toBe('node-0');

    const page2 = storage.findUnreferencedNodes(repositoryId, 50, 50);
    expect(page2.length).toBe(50);
    expect(page2[0]?.id).toBe('node-50');

    const page3 = storage.findUnreferencedNodes(repositoryId, 50, 100);
    expect(page3.length).toBe(50);
    expect(page3[0]?.id).toBe('node-100');
  });

  it('uses SQL GROUP BY for language breakdown', () => {
    const nodes: CodeNode[] = [];

    for (let i = 0; i < 100; i++) {
      nodes.push({
        id: `node-${i}`,
        name: `function${i}`,
        qualifiedName: `module.function${i}`,
        kind: 'function',
        filePath: `/test/file${i}.ts`,
        lineStart: 1,
        lineEnd: 5,
        visibility: 'private',
        isExported: false,
        repositoryId,
        language: i < 60 ? 'typescript' : i < 90 ? 'javascript' : 'python',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    storage.transaction(() => {
      storage.upsertNodes(nodes);
    });

    const breakdown = storage.countNodesByLanguage(repositoryId);
    expect(breakdown.typescript).toBe(60);
    expect(breakdown.javascript).toBe(30);
    expect(breakdown.python).toBe(10);
  });

  it('returns real total count from explain_architecture on 600-node fixture', () => {
    const nodes: CodeNode[] = [];

    for (let i = 0; i < 600; i++) {
      nodes.push({
        id: `node-${i}`,
        name: `function${i}`,
        qualifiedName: `module.function${i}`,
        kind: i < 200 ? 'function' : i < 400 ? 'class' : 'interface',
        filePath: `/test/file${Math.floor(i / 10)}.ts`,
        lineStart: (i % 10) * 10 + 1,
        lineEnd: (i % 10) * 10 + 5,
        visibility: 'private',
        isExported: i % 3 === 0,
        repositoryId,
        language: 'typescript',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    storage.transaction(() => {
      storage.upsertNodes(nodes);
    });

    const stats = graph.getStats();
    expect(stats.nodeCount).toBe(600);
    expect(stats.languageBreakdown.typescript).toBe(600);
  });
});
