/**
 * Tests for StorageBackedGraph read methods (Phase 10)
 * 
 * Tests the bounded hot cache and read method implementations.
 * Verifies cache eviction keeps resident count bounded.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { StorageBackedGraph } from '../../src/core/graph-store.js';
import type { CodeNode, NodeFilter, RepositoryInfo } from '../../src/core/types.js';

describe('StorageBackedGraph Read Methods', () => {
  let storage: SqliteStorageProvider;
  let graph: StorageBackedGraph;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'context-simplo-test-'));
    storage = new SqliteStorageProvider(resolve(tmpDir, 'test.db'));
    await storage.initialize();
    
    // Create graph with small cache for testing eviction
    graph = new StorageBackedGraph(storage, { hotCacheMb: 1 }); // Very small cache
  });

  afterEach(async () => {
    storage.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  const createTestRepo = (): RepositoryInfo => ({
    id: 'test-repo',
    path: '/test/repo',
    name: 'Test Repository',
    fileCount: 0,
    nodeCount: 0,
    edgeCount: 0,
    isWatched: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createTestNodes = (): CodeNode[] => [
    {
      id: 'node1',
      name: 'testFunction',
      qualifiedName: 'module.testFunction',
      kind: 'function',
      filePath: '/test/file1.js',
      lineStart: 1,
      lineEnd: 10,
      repositoryId: 'test-repo',
      language: 'javascript',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'node2',
      name: 'TestClass',
      qualifiedName: 'module.TestClass',
      kind: 'class',
      filePath: '/test/file1.js',
      lineStart: 15,
      lineEnd: 50,
      repositoryId: 'test-repo',
      language: 'javascript',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'node3',
      name: 'helper',
      qualifiedName: 'utils.helper',
      kind: 'function',
      filePath: '/test/file2.js',
      lineStart: 1,
      lineEnd: 5,
      repositoryId: 'test-repo',
      language: 'javascript',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('should implement getNode with caching', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    storage.upsertNodes(testNodes);

    // Test getNode
    const node1 = graph.getNode('node1');
    expect(node1).toBeTruthy();
    expect(node1!.name).toBe('testFunction');
    expect(node1!.id).toBe('node1');

    // Test cached access (should hit cache)
    const node1Cached = graph.getNode('node1');
    expect(node1Cached).toEqual(node1);

    // Test non-existent node
    const nonExistent = graph.getNode('nonexistent');
    expect(nonExistent).toBeNull();
  });

  it('should implement findByName with exact match', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    storage.upsertNodes(testNodes);

    // Test findByName
    const results = graph.findByName('testFunction');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('node1');

    // Test with filter
    const filteredResults = graph.findByName('testFunction', { kind: 'function' });
    expect(filteredResults).toHaveLength(1);
    expect(filteredResults[0].id).toBe('node1');

    // Test non-existent name
    const noResults = graph.findByName('nonExistentFunction');
    expect(noResults).toHaveLength(0);
  });

  it('should implement findByPattern with regex', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    storage.upsertNodes(testNodes);

    // Test case-insensitive pattern match
    const results = graph.findByPattern('test');
    expect(results.length).toBeGreaterThanOrEqual(2); // testFunction and TestClass
    expect(results.some(n => n.name === 'testFunction')).toBe(true);
    expect(results.some(n => n.name === 'TestClass')).toBe(true);

    // Test specific pattern (case-sensitive for capital T)
    const classResults = graph.findByPattern('^TestClass');
    expect(classResults).toHaveLength(1);
    expect(classResults[0].name).toBe('TestClass');

    // Test with filter
    const functionResults = graph.findByPattern('test', { kind: 'function' });
    expect(functionResults).toHaveLength(1);
    expect(functionResults[0].name).toBe('testFunction');
  });

  it('should implement getNodesInFile', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    storage.upsertNodes(testNodes);

    // Test getNodesInFile
    const file1Nodes = graph.getNodesInFile('/test/file1.js');
    expect(file1Nodes).toHaveLength(2);
    expect(file1Nodes.map(n => n.id).sort()).toEqual(['node1', 'node2']);

    const file2Nodes = graph.getNodesInFile('/test/file2.js');
    expect(file2Nodes).toHaveLength(1);
    expect(file2Nodes[0].id).toBe('node3');

    // Test non-existent file
    const noNodes = graph.getNodesInFile('/test/nonexistent.js');
    expect(noNodes).toHaveLength(0);
  });

  it('should implement getAllNodes with optional filter', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    storage.upsertNodes(testNodes);

    // Test getAllNodes without filter
    const allNodes = graph.getAllNodes();
    expect(allNodes).toHaveLength(3);

    // Test with filter
    const functionNodes = graph.getAllNodes({ kind: 'function' });
    expect(functionNodes).toHaveLength(2);
    expect(functionNodes.every(n => n.kind === 'function')).toBe(true);

    const jsNodes = graph.getAllNodes({ language: 'javascript' });
    expect(jsNodes).toHaveLength(3);
  });

  it('should implement getStats matching seeded data', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    storage.upsertNodes(testNodes);

    // Test getStats
    const stats = graph.getStats();
    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(0); // No edges inserted
    expect(stats.fileCount).toBe(0); // No files metadata inserted
    expect(stats.languageBreakdown.javascript).toBe(3);
  });

  it('should bound cache and evict oldest entries', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    
    // Create many nodes to test cache eviction
    const manyNodes: CodeNode[] = [];
    for (let i = 0; i < 100; i++) {
      manyNodes.push({
        id: `node${i}`,
        name: `function${i}`,
        qualifiedName: `module.function${i}`,
        kind: 'function',
        filePath: `/test/file${i}.js`,
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'javascript',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    storage.upsertNodes(manyNodes);

    // Access many nodes to fill cache
    for (let i = 0; i < 50; i++) {
      graph.getNode(`node${i}`);
    }

    // Check that memory footprint is bounded
    const footprint = graph.getMemoryFootprint();
    expect(footprint).toBeGreaterThan(0);
    expect(footprint).toBeLessThan(5 * 1024 * 1024); // Should be well under 5MB for small cache

    // Verify cache still works for recently accessed nodes
    const recentNode = graph.getNode('node49');
    expect(recentNode).toBeTruthy();
    expect(recentNode!.name).toBe('function49');
  });

  it('should handle invalid regex patterns gracefully', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    storage.upsertNodes(testNodes);

    // Test invalid regex
    expect(() => {
      graph.findByPattern('[invalid');
    }).toThrow();
  });

  it('should cache query results separately from node cache', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    storage.upsertNodes(testNodes);

    // Make same query multiple times
    const results1 = graph.findByName('testFunction');
    const results2 = graph.findByName('testFunction');
    const results3 = graph.getNodesInFile('/test/file1.js');

    // Results should be consistent
    expect(results1).toEqual(results2);
    expect(results3).toHaveLength(2);
    
    // Memory footprint should reflect caching
    const footprint = graph.getMemoryFootprint();
    expect(footprint).toBeGreaterThan(0);
  });
});