/**
 * Graph engine - graphology-based code dependency graph
 *
 * What it does:
 * Manages an in-memory directed graph of code entities and their relationships.
 * Provides queries for call hierarchies, impact analysis, shortest paths, and centrality.
 *
 * Inputs: CodeNode, GraphEdge
 * Outputs: Query results (arrays of nodes/edges), graph statistics
 * Constraints: Graph must fit in memory (see memory budget in plan)
 * Assumptions: graphology handles large graphs efficiently
 * Failure cases: Node not found, circular dependencies, memory overflow
 *
 * Design:
 * - Uses graphology DirectedGraph for efficient traversal
 * - Maintains indexes for fast lookups (name -> nodes, file -> nodes)
 * - Edges store kind + confidence for filtering
 * - Impact analysis uses BFS from a node to find all reachable nodes
 * - Centrality uses graphology-metrics betweenness centrality
 *
 * Performance:
 * - Add node/edge: O(1)
 * - Find by name: O(1) via index
 * - Get callers/callees: O(degree) - typically <100
 * - Shortest path: O(V + E) BFS
 * - Impact analysis: O(V + E) BFS with early termination
 * - Centrality: O(V * E) - expensive, computed once then cached
 *
 * Concurrency: Not thread-safe. All mutations must be serialized.
 */

import DirectedGraph from 'graphology';
import { bidirectional } from 'graphology-shortest-path';
import { GraphError, NotFoundError } from './errors.js';
import type { CodeNode, GraphEdge, EdgeKind, NodeFilter } from './types.js';

export interface ImpactAnalysisResult {
  affectedNodes: CodeNode[];
  affectedFiles: Set<string>;
  depth: number;
  confidence: number;
}

export interface ArchitectureSummary {
  entryPoints: CodeNode[];
  modules: Map<string, CodeNode[]>;
  keyAbstractions: CodeNode[];
  packageStructure: Record<string, number>;
}

export class CodeGraph {
  private graph: DirectedGraph;
  private nameIndex: Map<string, Set<string>>;
  private fileIndex: Map<string, Set<string>>;
  private centralityCache: Map<string, number> | null = null;
  private memoryLimitBytes: number;
  private mutationLock: Promise<void> = Promise.resolve();

  constructor(memoryLimitMb: number = 512) {
    this.graph = new DirectedGraph();
    this.nameIndex = new Map();
    this.fileIndex = new Map();
    const capped = Math.min(memoryLimitMb, 4096);
    this.memoryLimitBytes = capped * 1024 * 1024;
  }

  /**
   * Acquire mutation lock to serialize graph modifications.
   * Returns a function that must be called to release the lock.
   */
  private async acquireMutationLock(): Promise<() => void> {
    const previousLock = this.mutationLock;
    let releaseFn: (() => void) | undefined;
    
    this.mutationLock = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });
    
    await previousLock;
    return releaseFn!;
  }

  private checkMemoryLimit(): void {
    if (this.memoryLimitBytes <= 0) return;
    const footprint = this.getMemoryFootprint();
    if (footprint > this.memoryLimitBytes) {
      throw new GraphError(
        'addNode',
        `Graph memory limit exceeded: ${Math.round(footprint / 1024 / 1024)}MB > ${Math.round(this.memoryLimitBytes / 1024 / 1024)}MB limit. ` +
        'Increase GRAPH_MEMORY_LIMIT_MB or reduce repository size.'
      );
    }
  }

  async addNode(node: CodeNode): Promise<void> {
    const release = await this.acquireMutationLock();
    try {
      const lean = { ...node, docstring: undefined, snippet: undefined };
      if (this.graph.hasNode(node.id)) {
        this.graph.updateNode(node.id, () => lean);
      } else {
        this.checkMemoryLimit();
        this.graph.addNode(node.id, lean);
      }

      if (!this.nameIndex.has(node.name)) {
        this.nameIndex.set(node.name, new Set());
      }
      this.nameIndex.get(node.name)!.add(node.id);

      if (!this.fileIndex.has(node.filePath)) {
        this.fileIndex.set(node.filePath, new Set());
      }
      this.fileIndex.get(node.filePath)!.add(node.id);

      this.centralityCache = null;
    } finally {
      release();
    }
  }

  async addEdge(edge: GraphEdge): Promise<void> {
    const release = await this.acquireMutationLock();
    try {
      if (!this.graph.hasNode(edge.sourceId)) {
        throw new GraphError('addEdge', `Source node ${edge.sourceId} does not exist`);
      }
      if (!this.graph.hasNode(edge.targetId)) {
        throw new GraphError('addEdge', `Target node ${edge.targetId} does not exist`);
      }

      if (this.graph.hasEdge(edge.id)) {
        this.graph.replaceEdgeAttributes(edge.id, edge);
      } else {
        this.graph.addEdgeWithKey(edge.id, edge.sourceId, edge.targetId, edge);
      }

      this.centralityCache = null;
    } finally {
      release();
    }
  }

  getNode(nodeId: string): CodeNode | null {
    if (!this.graph.hasNode(nodeId)) {
      return null;
    }
    return this.graph.getNodeAttributes(nodeId) as CodeNode;
  }

  findByName(name: string, filter?: NodeFilter): CodeNode[] {
    const nodeIds = this.nameIndex.get(name);
    if (!nodeIds) {
      return [];
    }

    const nodes: CodeNode[] = [];
    for (const nodeId of nodeIds) {
      const node = this.getNode(nodeId);
      if (node && this.matchesFilter(node, filter)) {
        nodes.push(node);
      }
    }

    return nodes;
  }

  findByPattern(pattern: string, filter?: NodeFilter): CodeNode[] {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch (error) {
      console.warn(`Invalid regex pattern: ${pattern}`, error);
      return [];
    }
    
    const results: CodeNode[] = [];

    for (const [name, nodeIds] of this.nameIndex.entries()) {
      if (regex.test(name)) {
        for (const nodeId of nodeIds) {
          const node = this.getNode(nodeId);
          if (node && this.matchesFilter(node, filter)) {
            results.push(node);
          }
        }
      }
    }

    return results;
  }

  getNodesInFile(filePath: string): CodeNode[] {
    const nodeIds = this.fileIndex.get(filePath);
    if (!nodeIds) {
      return [];
    }

    return Array.from(nodeIds)
      .map((id) => this.getNode(id))
      .filter((node): node is CodeNode => node !== null);
  }

  getCallers(nodeId: string, edgeKinds: EdgeKind[] = ['calls']): CodeNode[] {
    if (!this.graph.hasNode(nodeId)) {
      throw new NotFoundError('Node', nodeId);
    }

    const callers: CodeNode[] = [];
    const inEdges = this.graph.inEdges(nodeId);

    for (const edgeId of inEdges) {
      const edge = this.graph.getEdgeAttributes(edgeId) as GraphEdge;
      if (edgeKinds.includes(edge.kind)) {
        const caller = this.getNode(edge.sourceId);
        if (caller) {
          callers.push(caller);
        }
      }
    }

    return callers;
  }

  getCallees(nodeId: string, edgeKinds: EdgeKind[] = ['calls']): CodeNode[] {
    if (!this.graph.hasNode(nodeId)) {
      throw new NotFoundError('Node', nodeId);
    }

    const callees: CodeNode[] = [];
    const outEdges = this.graph.outEdges(nodeId);

    for (const edgeId of outEdges) {
      const edge = this.graph.getEdgeAttributes(edgeId) as GraphEdge;
      if (edgeKinds.includes(edge.kind)) {
        const callee = this.getNode(edge.targetId);
        if (callee) {
          callees.push(callee);
        }
      }
    }

    return callees;
  }

  findShortestPath(sourceId: string, targetId: string): CodeNode[] | null {
    if (!this.graph.hasNode(sourceId)) {
      throw new NotFoundError('Node', sourceId);
    }
    if (!this.graph.hasNode(targetId)) {
      throw new NotFoundError('Node', targetId);
    }

    const path = bidirectional(this.graph, sourceId, targetId);
    if (!path) {
      return null;
    }

    return path.map((nodeId) => this.getNode(nodeId)!);
  }

  analyzeImpact(nodeId: string, maxDepth: number = 10): ImpactAnalysisResult {
    if (!this.graph.hasNode(nodeId)) {
      throw new NotFoundError('Node', nodeId);
    }

    const affected = new Set<string>();
    const affectedFiles = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];
    const visited = new Set<string>();

    let maxDepthReached = 0;
    let totalConfidence = 0;
    let edgeCount = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id) || current.depth > maxDepth) {
        continue;
      }

      visited.add(current.id);
      affected.add(current.id);
      maxDepthReached = Math.max(maxDepthReached, current.depth);

      const node = this.getNode(current.id);
      if (node) {
        affectedFiles.add(node.filePath);
      }

      const inEdges = this.graph.inEdges(current.id);
      for (const edgeId of inEdges) {
        const edge = this.graph.getEdgeAttributes(edgeId) as GraphEdge;
        totalConfidence += edge.confidence;
        edgeCount++;

        if (!visited.has(edge.sourceId)) {
          queue.push({ id: edge.sourceId, depth: current.depth + 1 });
        }
      }
    }

    const affectedNodes = Array.from(affected)
      .map((id) => this.getNode(id))
      .filter((node): node is CodeNode => node !== null);

    const avgConfidence = edgeCount > 0 ? totalConfidence / edgeCount : 1.0;

    return {
      affectedNodes,
      affectedFiles,
      depth: maxDepthReached,
      confidence: avgConfidence,
    };
  }

  computeCentrality(): Map<string, number> {
    if (this.centralityCache) {
      return this.centralityCache;
    }

    try {
      // Simplified degree-based centrality for v1
      const centrality = new Map<string, number>();
      this.graph.forEachNode((nodeId) => {
        const degree = this.graph.degree(nodeId);
        centrality.set(nodeId, degree);
      });
      this.centralityCache = centrality;
      return this.centralityCache;
    } catch (error) {
      throw new GraphError('computeCentrality', 'Failed to compute centrality', error as Error);
    }
  }

  getCentrality(nodeId: string): number {
    if (!this.centralityCache) {
      this.computeCentrality();
    }
    return this.centralityCache!.get(nodeId) || 0;
  }

  findDeadCode(repositoryId?: string): CodeNode[] {
    const deadNodes: CodeNode[] = [];

    for (const nodeId of this.graph.nodes()) {
      const node = this.getNode(nodeId)!;

      if (repositoryId && node.repositoryId !== repositoryId) {
        continue;
      }

      if (node.kind === 'function' || node.kind === 'method' || node.kind === 'class') {
        const inDegree = this.graph.inDegree(nodeId);
        if (inDegree === 0 && !node.isExported) {
          deadNodes.push(node);
        }
      }
    }

    return deadNodes;
  }

  explainArchitecture(repositoryId: string, detailLevel: number = 1): ArchitectureSummary {
    const allNodes = this.getAllNodes({ repositoryId });

    const entryPoints = allNodes.filter(
      (node) => node.isExported && (node.kind === 'function' || node.kind === 'class')
    );

    const modules = new Map<string, CodeNode[]>();
    for (const node of allNodes) {
      const dir = node.filePath.split('/').slice(0, -1).join('/') || '.';
      if (!modules.has(dir)) {
        modules.set(dir, []);
      }
      modules.get(dir)!.push(node);
    }

    const centrality = this.computeCentrality();
    const sortedByCentrality = allNodes
      .map((node) => ({ node, centrality: centrality.get(node.id) || 0 }))
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, 20)
      .map((item) => item.node);

    const keyAbstractions = sortedByCentrality.filter(
      (node) => node.kind === 'class' || node.kind === 'interface'
    );

    const packageStructure: Record<string, number> = {};
    for (const [dir, nodes] of modules.entries()) {
      packageStructure[dir] = nodes.length;
    }

    return {
      entryPoints: detailLevel >= 2 ? entryPoints : entryPoints.slice(0, 10),
      modules: detailLevel >= 3 ? modules : new Map(Array.from(modules.entries()).slice(0, 10)),
      keyAbstractions: detailLevel >= 2 ? keyAbstractions : keyAbstractions.slice(0, 5),
      packageStructure,
    };
  }

  getAllNodes(filter?: NodeFilter): CodeNode[] {
    const results: CodeNode[] = [];

    for (const nodeId of this.graph.nodes()) {
      const node = this.getNode(nodeId)!;
      if (this.matchesFilter(node, filter)) {
        results.push(node);
      }
    }

    return results;
  }

  async removeNode(nodeId: string): Promise<void> {
    const release = await this.acquireMutationLock();
    try {
      if (!this.graph.hasNode(nodeId)) {
        return;
      }

      const node = this.getNode(nodeId)!;

      const nameSet = this.nameIndex.get(node.name);
      if (nameSet) {
        nameSet.delete(nodeId);
        if (nameSet.size === 0) {
          this.nameIndex.delete(node.name);
        }
      }

      const fileSet = this.fileIndex.get(node.filePath);
      if (fileSet) {
        fileSet.delete(nodeId);
        if (fileSet.size === 0) {
          this.fileIndex.delete(node.filePath);
        }
      }

      this.graph.dropNode(nodeId);
      this.centralityCache = null;
    } finally {
      release();
    }
  }

  async removeNodesInFile(filePath: string): Promise<void> {
    const nodeIds = this.fileIndex.get(filePath);
    if (!nodeIds) {
      return;
    }

    for (const nodeId of Array.from(nodeIds)) {
      await this.removeNode(nodeId);
    }
  }

  getStats(): {
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    languageBreakdown: Record<string, number>;
  } {
    const nodeCount = this.graph.order;
    const edgeCount = this.graph.size;
    const fileCount = this.fileIndex.size;

    const languageBreakdown: Record<string, number> = {};
    for (const nodeId of this.graph.nodes()) {
      const node = this.getNode(nodeId)!;
      languageBreakdown[node.language] = (languageBreakdown[node.language] || 0) + 1;
    }

    return {
      nodeCount,
      edgeCount,
      fileCount,
      languageBreakdown,
    };
  }

  getMemoryFootprint(): number {
    const nodeCount = this.graph.order;
    const edgeCount = this.graph.size;
    const NODE_SIZE_ESTIMATE = 200;
    const EDGE_SIZE_ESTIMATE = 100;
    const INDEX_OVERHEAD = 1.2;

    return Math.ceil((nodeCount * NODE_SIZE_ESTIMATE + edgeCount * EDGE_SIZE_ESTIMATE) * INDEX_OVERHEAD);
  }

  getAllEdges(): GraphEdge[] {
    const edges: GraphEdge[] = [];
    for (const edgeId of this.graph.edges()) {
      const edge = this.graph.getEdgeAttributes(edgeId) as GraphEdge;
      edges.push(edge);
    }
    return edges;
  }

  serialize(): string {
    const nodes: CodeNode[] = [];
    const edges: GraphEdge[] = [];

    for (const nodeId of this.graph.nodes()) {
      nodes.push(this.getNode(nodeId)!);
    }

    for (const edgeId of this.graph.edges()) {
      const edge = this.graph.getEdgeAttributes(edgeId) as GraphEdge;
      edges.push(edge);
    }

    return JSON.stringify({ nodes, edges });
  }

  deserialize(data: string): void {
    const { nodes, edges } = JSON.parse(data) as { nodes: CodeNode[]; edges: GraphEdge[] };

    for (const node of nodes) {
      this.addNode(node);
    }

    for (const edge of edges) {
      try {
        this.addEdge(edge);
      } catch (error) {
        console.warn(`Failed to restore edge ${edge.id}: ${(error as Error).message}`);
      }
    }
  }

  static fromSerialized(data: string): CodeGraph {
    const graph = new CodeGraph();
    graph.deserialize(data);
    return graph;
  }

  private matchesFilter(node: CodeNode, filter?: NodeFilter): boolean {
    if (!filter) {
      return true;
    }

    if (filter.kind && node.kind !== filter.kind) {
      return false;
    }

    if (filter.language && node.language !== filter.language) {
      return false;
    }

    if (filter.repositoryId && node.repositoryId !== filter.repositoryId) {
      return false;
    }

    if (filter.filePath && !node.filePath.includes(filter.filePath)) {
      return false;
    }

    if (filter.visibility && node.visibility !== filter.visibility) {
      return false;
    }

    if (filter.namePattern) {
      const regex = new RegExp(filter.namePattern, 'i');
      if (!regex.test(node.name)) {
        return false;
      }
    }

    return true;
  }

  clear(): void {
    this.graph.clear();
    this.nameIndex.clear();
    this.fileIndex.clear();
    this.centralityCache = null;
  }
}
