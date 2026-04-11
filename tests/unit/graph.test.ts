import { describe, it, expect, beforeEach } from 'vitest';
import { CodeGraph } from '../../src/core/graph.js';
import type { CodeNode, GraphEdge } from '../../src/core/types.js';

describe('CodeGraph', () => {
  let graph: CodeGraph;

  beforeEach(() => {
    graph = new CodeGraph();
  });

  const createTestNode = (
    id: string,
    name: string,
    kind: 'function' | 'class' | 'method' = 'function',
    filePath: string = 'test.ts'
  ): CodeNode => ({
    id,
    name,
    qualifiedName: name,
    kind,
    filePath,
    lineStart: 1,
    lineEnd: 10,
    repositoryId: 'test-repo',
    language: 'typescript',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createTestEdge = (
    id: string,
    sourceId: string,
    targetId: string,
    kind: 'calls' | 'extends' = 'calls'
  ): GraphEdge => ({
    id,
    sourceId,
    targetId,
    kind,
    confidence: 1.0,
    createdAt: new Date(),
  });

  describe('addNode', () => {
    it('should add a node to the graph', async () => {
      const node = createTestNode('1', 'testFunc');
      await graph.addNode(node);

      const retrieved = graph.getNode('1');
      expect(retrieved).toEqual(node);
    });

    it('should update existing node', async () => {
      const node1 = createTestNode('1', 'testFunc');
      const node2 = { ...node1, lineEnd: 20 };

      await graph.addNode(node1);
      await graph.addNode(node2);

      const retrieved = graph.getNode('1');
      expect(retrieved?.lineEnd).toBe(20);
    });
  });

  describe('addEdge', () => {
    it('should add an edge between nodes', async () => {
      const node1 = createTestNode('1', 'caller');
      const node2 = createTestNode('2', 'callee');
      const edge = createTestEdge('e1', '1', '2');

      await graph.addNode(node1);
      await graph.addNode(node2);
      await graph.addEdge(edge);

      const callees = graph.getCallees('1');
      expect(callees).toHaveLength(1);
      expect(callees[0]?.id).toBe('2');
    });

    it('should throw error if source node does not exist', async () => {
      const node2 = createTestNode('2', 'callee');
      const edge = createTestEdge('e1', '1', '2');

      await graph.addNode(node2);

      await expect(graph.addEdge(edge)).rejects.toThrow('Source node 1 does not exist');
    });

    it('should throw error if target node does not exist', async () => {
      const node1 = createTestNode('1', 'caller');
      const edge = createTestEdge('e1', '1', '2');

      await graph.addNode(node1);

      await expect(graph.addEdge(edge)).rejects.toThrow('Target node 2 does not exist');
    });
  });

  describe('findByName', () => {
    it('should find nodes by exact name', async () => {
      const node1 = createTestNode('1', 'testFunc');
      const node2 = createTestNode('2', 'testFunc', 'function', 'other.ts');
      const node3 = createTestNode('3', 'otherFunc');

      await graph.addNode(node1);
      await graph.addNode(node2);
      await graph.addNode(node3);

      const results = graph.findByName('testFunc');
      expect(results).toHaveLength(2);
      expect(results.map((n) => n.id).sort()).toEqual(['1', '2']);
    });

    it('should filter by kind', async () => {
      const node1 = createTestNode('1', 'User', 'class');
      const node2 = createTestNode('2', 'User', 'function');

      await graph.addNode(node1);
      await graph.addNode(node2);

      const results = graph.findByName('User', { kind: 'class' });
      expect(results).toHaveLength(1);
      expect(results[0]?.kind).toBe('class');
    });
  });

  describe('getCallers and getCallees', () => {
    it('should return callers of a node', async () => {
      const node1 = createTestNode('1', 'caller1');
      const node2 = createTestNode('2', 'caller2');
      const node3 = createTestNode('3', 'target');

      await graph.addNode(node1);
      await graph.addNode(node2);
      await graph.addNode(node3);

      await graph.addEdge(createTestEdge('e1', '1', '3'));
      await graph.addEdge(createTestEdge('e2', '2', '3'));

      const callers = graph.getCallers('3');
      expect(callers).toHaveLength(2);
      expect(callers.map((n) => n.id).sort()).toEqual(['1', '2']);
    });

    it('should return callees of a node', async () => {
      const node1 = createTestNode('1', 'source');
      const node2 = createTestNode('2', 'target1');
      const node3 = createTestNode('3', 'target2');

      await graph.addNode(node1);
      await graph.addNode(node2);
      await graph.addNode(node3);

      await graph.addEdge(createTestEdge('e1', '1', '2'));
      await graph.addEdge(createTestEdge('e2', '1', '3'));

      const callees = graph.getCallees('1');
      expect(callees).toHaveLength(2);
      expect(callees.map((n) => n.id).sort()).toEqual(['2', '3']);
    });
  });

  describe('findShortestPath', () => {
    it('should find shortest path between nodes', async () => {
      const nodes = [
        createTestNode('1', 'A'),
        createTestNode('2', 'B'),
        createTestNode('3', 'C'),
        createTestNode('4', 'D'),
      ];

      for (const n of nodes) {
        await graph.addNode(n);
      }

      await graph.addEdge(createTestEdge('e1', '1', '2'));
      await graph.addEdge(createTestEdge('e2', '2', '3'));
      await graph.addEdge(createTestEdge('e3', '3', '4'));
      await graph.addEdge(createTestEdge('e4', '1', '4'));

      const path = graph.findShortestPath('1', '4');
      expect(path).toBeTruthy();
      expect(path).toHaveLength(2);
      expect(path?.[0]?.id).toBe('1');
      expect(path?.[1]?.id).toBe('4');
    });

    it('should return null if no path exists', async () => {
      const node1 = createTestNode('1', 'A');
      const node2 = createTestNode('2', 'B');

      await graph.addNode(node1);
      await graph.addNode(node2);

      const path = graph.findShortestPath('1', '2');
      expect(path).toBeNull();
    });
  });

  describe('analyzeImpact', () => {
    it('should find all nodes affected by a change', async () => {
      const nodes = [
        createTestNode('1', 'utility'),
        createTestNode('2', 'service', 'function', 'service.ts'),
        createTestNode('3', 'controller', 'function', 'controller.ts'),
        createTestNode('4', 'handler', 'function', 'handler.ts'),
      ];

      for (const n of nodes) {
        await graph.addNode(n);
      }

      await graph.addEdge(createTestEdge('e1', '2', '1'));
      await graph.addEdge(createTestEdge('e2', '3', '2'));
      await graph.addEdge(createTestEdge('e3', '4', '3'));

      const impact = graph.analyzeImpact('1', 10);

      expect(impact.affectedNodes.length).toBeGreaterThanOrEqual(3);
      expect(impact.affectedFiles.size).toBeGreaterThanOrEqual(3);
      expect(impact.depth).toBeGreaterThan(0);
      expect(impact.confidence).toBeGreaterThan(0);
    });
  });

  describe('findDeadCode', () => {
    it('should find unreferenced non-exported functions', async () => {
      const node1 = createTestNode('1', 'unusedHelper');
      node1.isExported = false;

      const node2 = createTestNode('2', 'exportedFunc');
      node2.isExported = true;

      const node3 = createTestNode('3', 'usedHelper');
      node3.isExported = false;

      const node4 = createTestNode('4', 'caller');
      node4.isExported = true; // Exported so it's not dead code

      await graph.addNode(node1);
      await graph.addNode(node2);
      await graph.addNode(node3);
      await graph.addNode(node4);

      await graph.addEdge(createTestEdge('e1', '4', '3'));

      const deadCode = graph.findDeadCode();

      expect(deadCode).toHaveLength(1);
      expect(deadCode[0]?.id).toBe('1');
    });
  });

  describe('getStats', () => {
    it('should return graph statistics', async () => {
      const node1 = createTestNode('1', 'func1', 'function', 'file1.ts');
      const node2 = createTestNode('2', 'func2', 'function', 'file2.py');
      node2.language = 'python';

      await graph.addNode(node1);
      await graph.addNode(node2);
      await graph.addEdge(createTestEdge('e1', '1', '2'));

      const stats = graph.getStats();

      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
      expect(stats.fileCount).toBe(2);
      expect(stats.languageBreakdown).toEqual({
        typescript: 1,
        python: 1,
      });
    });
  });

  describe('serialize and deserialize', () => {
    it('should serialize and deserialize graph', async () => {
      const node1 = createTestNode('1', 'func1');
      const node2 = createTestNode('2', 'func2');

      await graph.addNode(node1);
      await graph.addNode(node2);
      await graph.addEdge(createTestEdge('e1', '1', '2'));

      const serialized = graph.serialize();
      const deserialized = await CodeGraph.fromSerialized(serialized);

      expect(deserialized.getNode('1')).toBeTruthy();
      expect(deserialized.getNode('2')).toBeTruthy();
      expect(deserialized.getCallees('1')).toHaveLength(1);
    });
  });

  describe('removeNode', () => {
    it('should remove node and clean up indexes', async () => {
      const node = createTestNode('1', 'testFunc');
      await graph.addNode(node);

      await graph.removeNode('1');

      expect(graph.getNode('1')).toBeNull();
      expect(graph.findByName('testFunc')).toHaveLength(0);
    });
  });

  describe('removeNodesInFile', () => {
    it('should remove all nodes in a file', async () => {
      const node1 = createTestNode('1', 'func1', 'function', 'test.ts');
      const node2 = createTestNode('2', 'func2', 'function', 'test.ts');
      const node3 = createTestNode('3', 'func3', 'function', 'other.ts');

      await graph.addNode(node1);
      await graph.addNode(node2);
      await graph.addNode(node3);

      await graph.removeNodesInFile('test.ts');

      expect(graph.getNode('1')).toBeNull();
      expect(graph.getNode('2')).toBeNull();
      expect(graph.getNode('3')).toBeTruthy();
    });
  });
});
