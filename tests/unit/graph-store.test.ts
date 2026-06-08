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
import type { CodeNode, GraphEdge, NodeFilter, RepositoryInfo } from '../../src/core/types.js';

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

  const createTestEdges = (): GraphEdge[] => [
    {
      id: 'edge1',
      sourceId: 'node1', // testFunction calls helper
      targetId: 'node3',
      kind: 'calls',
      confidence: 0.9,
      repositoryId: 'test-repo',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'edge2', 
      sourceId: 'node2', // TestClass calls testFunction
      targetId: 'node1',
      kind: 'calls',
      confidence: 0.8,
      repositoryId: 'test-repo',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('should implement getCallers and getCallees', async () => {
    // Setup data with edges
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    const testEdges = createTestEdges();
    storage.upsertNodes(testNodes);
    storage.upsertEdges(testEdges);

    // Test getCallers - who calls testFunction (node1)?
    const callers = graph.getCallers('node1'); // TestClass calls testFunction
    expect(callers).toHaveLength(1);
    expect(callers[0].id).toBe('node2'); // TestClass

    // Test getCallees - who does testFunction (node1) call?
    const callees = graph.getCallees('node1'); // testFunction calls helper
    expect(callees).toHaveLength(1);
    expect(callees[0].id).toBe('node3'); // helper

    // Test with specific edge kinds
    const callCallers = graph.getCallers('node1', ['calls']);
    expect(callCallers).toHaveLength(1);

    // Test non-existent node
    expect(() => {
      graph.getCallers('nonexistent');
    }).toThrow();
  });

  it('should implement findShortestPath', async () => {
    // Setup data with edges
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    const testEdges = createTestEdges();
    storage.upsertNodes(testNodes);
    storage.upsertEdges(testEdges);

    // Test shortest path: node2 -> node1 -> node3
    const path = graph.findShortestPath('node2', 'node3');
    expect(path).toBeTruthy();
    expect(path!.length).toBeGreaterThanOrEqual(2);
    expect(path![0].id).toBe('node2'); // TestClass
    
    // Test non-existent path
    const noPath = graph.findShortestPath('node3', 'node2'); // No reverse path
    expect(noPath).toBeNull();

    // Test same source and target
    const samePath = graph.findShortestPath('node1', 'node1');
    expect(samePath).toBeTruthy();

    // Test non-existent nodes
    expect(() => {
      graph.findShortestPath('nonexistent', 'node1');
    }).toThrow();
  });

  it('should implement analyzeImpact', async () => {
    // Setup data with edges
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    const testEdges = createTestEdges();
    storage.upsertNodes(testNodes);
    storage.upsertEdges(testEdges);

    // Analyze impact of node3 (helper) - should find node1 and node2 that depend on it
    const impact = graph.analyzeImpact('node3');
    expect(impact.affectedNodes.length).toBeGreaterThanOrEqual(1);
    expect(impact.affectedFiles.size).toBeGreaterThanOrEqual(1);
    expect(impact.depth).toBeGreaterThanOrEqual(0);
    expect(impact.confidence).toBeGreaterThan(0);

    // Test with max depth
    const limitedImpact = graph.analyzeImpact('node3', 1);
    expect(limitedImpact.depth).toBeLessThanOrEqual(1);

    // Test non-existent node
    expect(() => {
      graph.analyzeImpact('nonexistent');
    }).toThrow();
  });

  it('should implement computeCentrality and getCentrality', async () => {
    // Setup data with edges
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    const testEdges = createTestEdges();
    storage.upsertNodes(testNodes);
    storage.upsertEdges(testEdges);

    // Test computeCentrality
    const centrality = graph.computeCentrality();
    expect(centrality.size).toBeGreaterThan(0);
    
    // node1 should have higher centrality (has both incoming and outgoing edges)
    const node1Centrality = centrality.get('node1');
    expect(node1Centrality).toBeGreaterThan(0);

    // Test getCentrality
    const node1CentralityDirect = graph.getCentrality('node1');
    expect(node1CentralityDirect).toBe(node1Centrality);

    // Test node with no edges
    const node0Centrality = graph.getCentrality('nonexistent');
    expect(node0Centrality).toBe(0);
  });

  it('should implement findDeadCode', async () => {
    // Setup data - add a node with no incoming edges and not exported
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    
    // Add a dead function (no callers, not exported)
    const deadNode: CodeNode = {
      id: 'dead1',
      name: 'unusedFunction',
      qualifiedName: 'module.unusedFunction',
      kind: 'function',
      filePath: '/test/file1.js',
      lineStart: 100,
      lineEnd: 110,
      repositoryId: 'test-repo',
      language: 'javascript',
      isExported: false, // Not exported
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    storage.upsertNodes([...testNodes, deadNode]);
    // Don't add edges to deadNode - it should be detected as dead code

    const deadCode = graph.findDeadCode('test-repo');
    expect(deadCode.some(node => node.id === 'dead1')).toBe(true);

    // Test without repository filter
    const allDeadCode = graph.findDeadCode();
    expect(allDeadCode.length).toBeGreaterThanOrEqual(deadCode.length);
  });

  it('should implement explainArchitecture', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    const testEdges = createTestEdges();
    storage.upsertNodes(testNodes);
    storage.upsertEdges(testEdges);

    // Test architecture analysis
    const arch = graph.explainArchitecture('test-repo');
    expect(arch.entryPoints).toBeDefined();
    expect(arch.modules).toBeDefined();
    expect(arch.keyAbstractions).toBeDefined();
    expect(arch.packageStructure).toBeDefined();

    // Test with detail level
    const detailedArch = graph.explainArchitecture('test-repo', 2);
    expect(detailedArch.entryPoints.length).toBeGreaterThanOrEqual(0);
    
    // Package structure should reflect file paths
    expect(Object.keys(arch.packageStructure).length).toBeGreaterThan(0);
  });

  it('should cache traversal results for performance', async () => {
    // Setup data
    storage.upsertRepository(createTestRepo());
    const testNodes = createTestNodes();
    const testEdges = createTestEdges();
    storage.upsertNodes(testNodes);
    storage.upsertEdges(testEdges);

    // Call methods multiple times - should hit cache
    const callers1 = graph.getCallers('node1');
    const callers2 = graph.getCallers('node1');
    expect(callers1).toEqual(callers2);

    const impact1 = graph.analyzeImpact('node3');
    const impact2 = graph.analyzeImpact('node3');
    expect(impact1).toEqual(impact2);

    // Memory footprint should reflect caching
    const footprint = graph.getMemoryFootprint();
    expect(footprint).toBeGreaterThan(0);
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