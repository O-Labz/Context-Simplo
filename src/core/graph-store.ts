/**
 * StorageBackedGraph - SQLite-backed implementation of CodeGraph API
 * 
 * Implements the read half of CodeGraph over StorageProvider with bounded hot cache.
 * This serves graphs from SQLite so RAM usage is bounded regardless of repo size.
 * 
 * Design:
 * - All graph data lives in SQLite via StorageProvider
 * - Bounded LRU cache for hot nodes (sized by GRAPH_HOT_CACHE_MB)
 * - Read methods delegate to storage with caching
 * - Write methods (Phase 12) invalidate cache on mutations
 * - Traversal uses SQL recursive CTEs and bounded BFS
 */

import type { StorageProvider } from '../store/provider.js';
import type { 
  CodeNode, 
  GraphEdge,
  EdgeKind,
  NodeFilter 
} from './types.js';
import { GraphError, NotFoundError } from './errors.js';

// Traversal limits from EML (reused for consistency)
export const MAX_TRAVERSE_DEPTH = 12;
export const MAX_TRAVERSE_ROWS = 500;

// Cache configuration
const APPROX_BYTES_PER_NODE = 256;
const MIN_CACHE_ENTRIES = 16;

interface CachedNode {
  node: CodeNode;
  cachedAt: number;
}

interface CacheEntry {
  key: string;
  nodes: CodeNode[];
  accessedAt: number;
}

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

export class StorageBackedGraph {
  private readonly storage: StorageProvider;
  private readonly maxCacheEntries: number;
  private readonly nodeCache = new Map<string, CachedNode>();
  private readonly queryCache = new Map<string, CacheEntry>();
  
  constructor(storage: StorageProvider, opts: { hotCacheMb: number }) {
    this.storage = storage;
    
    // Calculate cache capacity from memory budget
    const budgetBytes = Math.max(1, opts.hotCacheMb) * 1024 * 1024;
    this.maxCacheEntries = Math.max(MIN_CACHE_ENTRIES, Math.floor(budgetBytes / APPROX_BYTES_PER_NODE));
  }

  // ============================================================================
  // READ METHODS (Phase 10)
  // ============================================================================

  getNode(nodeId: string): CodeNode | null {
    // Check node cache first
    const cached = this.nodeCache.get(nodeId);
    if (cached) {
      cached.cachedAt = Date.now();
      return cached.node;
    }

    // Load from storage
    const node = this.storage.getNode(nodeId);
    if (node) {
      this.cacheNode(node);
    }
    
    return node;
  }

  findByName(name: string, filter?: NodeFilter): CodeNode[] {
    const cacheKey = `name:${name}:${JSON.stringify(filter || {})}`;
    
    // Check query cache
    const cached = this.getCachedQuery(cacheKey);
    if (cached) {
      return cached;
    }

    // Load from storage using new getNodesByName method
    const nodes = this.storage.getNodesByName(name, filter);
    
    // Cache nodes individually and cache query result
    for (const node of nodes) {
      this.cacheNode(node);
    }
    this.cacheQuery(cacheKey, nodes);
    
    return nodes;
  }

  findByPattern(pattern: string, filter?: NodeFilter): CodeNode[] {
    const cacheKey = `pattern:${pattern}:${JSON.stringify(filter || {})}`;
    
    // Check query cache
    const cached = this.getCachedQuery(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const regex = new RegExp(pattern, 'i');
      
      // Stream all nodes with filter and apply pattern matching
      // Bound result size to prevent loading entire huge repos
      const allNodes = this.storage.getNodes(filter || {});
      const matches: CodeNode[] = [];
      
      for (const node of allNodes) {
        if (matches.length >= MAX_TRAVERSE_ROWS) {
          break; // Bound result size
        }
        
        if (regex.test(node.name) || regex.test(node.qualifiedName)) {
          matches.push(node);
          this.cacheNode(node);
        }
      }
      
      this.cacheQuery(cacheKey, matches);
      return matches;
      
    } catch (error) {
      throw new GraphError('findByPattern', `Invalid regex pattern: ${pattern}`, error as Error);
    }
  }

  getNodesInFile(filePath: string): CodeNode[] {
    const cacheKey = `file:${filePath}`;
    
    // Check query cache
    const cached = this.getCachedQuery(cacheKey);
    if (cached) {
      return cached;
    }

    // Load from storage
    const nodes = this.storage.getNodesInFile(filePath);
    
    // Cache nodes individually and cache query result
    for (const node of nodes) {
      this.cacheNode(node);
    }
    this.cacheQuery(cacheKey, nodes);
    
    return nodes;
  }

  getAllNodes(filter?: NodeFilter): CodeNode[] {
    const cacheKey = `all:${JSON.stringify(filter || {})}`;
    
    // Check query cache
    const cached = this.getCachedQuery(cacheKey);
    if (cached) {
      return cached;
    }

    // Load from storage with bounded result size
    const nodes = filter ? this.storage.getNodes(filter) : this.storage.getAllNodes();
    
    // Bound result size to avoid loading massive repos into arrays
    const boundedNodes = nodes.slice(0, MAX_TRAVERSE_ROWS);
    
    // Cache nodes individually and cache query result
    for (const node of boundedNodes) {
      this.cacheNode(node);
    }
    this.cacheQuery(cacheKey, boundedNodes);
    
    return boundedNodes;
  }

  getStats(): {
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    languageBreakdown: Record<string, number>;
  } {
    // Delegate to storage stats and count methods
    const storageStats = this.storage.getStats();
    const nodeCount = this.storage.countNodes();
    
    // Get language breakdown by querying all nodes (may be expensive for huge repos)
    // For now, use a simple implementation - can be optimized with SQL GROUP BY later
    const languageBreakdown: Record<string, number> = {};
    
    // Use a bounded sample if the repo is huge
    const allNodes = nodeCount > MAX_TRAVERSE_ROWS ? 
      this.storage.getAllNodes().slice(0, MAX_TRAVERSE_ROWS) :
      this.storage.getAllNodes();
      
    for (const node of allNodes) {
      languageBreakdown[node.language] = (languageBreakdown[node.language] || 0) + 1;
    }

    return {
      nodeCount,
      edgeCount: storageStats.edgeCount,
      fileCount: storageStats.fileCount,
      languageBreakdown,
    };
  }

  getMemoryFootprint(): number {
    // Return cache resident size, NOT whole graph size
    const nodeCacheSize = this.nodeCache.size * APPROX_BYTES_PER_NODE;
    const queryCacheSize = this.queryCache.size * 1024; // Rough estimate for query results
    return nodeCacheSize + queryCacheSize;
  }

  // ============================================================================
  // TRAVERSAL AND ANALYSIS METHODS (Phase 11)
  // ============================================================================

  getCallers(nodeId: string, edgeKinds: EdgeKind[] = ['calls']): CodeNode[] {
    const cacheKey = `callers:${nodeId}:${edgeKinds.join(',')}`;
    
    // Check query cache
    const cached = this.getCachedQuery(cacheKey);
    if (cached) {
      return cached;
    }

    // Check if node exists
    if (!this.getNode(nodeId)) {
      throw new NotFoundError('Node', nodeId);
    }

    // Get edges where this node is the target
    const inEdges: GraphEdge[] = this.storage.getEdges(undefined, nodeId);
    const callers: CodeNode[] = [];

    for (const edge of inEdges) {
      if (edgeKinds.includes(edge.kind)) {
        const caller = this.getNode(edge.sourceId);
        if (caller) {
          callers.push(caller);
          this.cacheNode(caller);
        }
      }
    }

    this.cacheQuery(cacheKey, callers);
    return callers;
  }

  getCallees(nodeId: string, edgeKinds: EdgeKind[] = ['calls']): CodeNode[] {
    const cacheKey = `callees:${nodeId}:${edgeKinds.join(',')}`;
    
    // Check query cache
    const cached = this.getCachedQuery(cacheKey);
    if (cached) {
      return cached;
    }

    // Check if node exists
    if (!this.getNode(nodeId)) {
      throw new NotFoundError('Node', nodeId);
    }

    // Get edges where this node is the source
    const outEdges = this.storage.getEdges(nodeId);
    const callees: CodeNode[] = [];

    for (const edge of outEdges) {
      if (edgeKinds.includes(edge.kind)) {
        const callee = this.getNode(edge.targetId);
        if (callee) {
          callees.push(callee);
          this.cacheNode(callee);
        }
      }
    }

    this.cacheQuery(cacheKey, callees);
    return callees;
  }

  findShortestPath(sourceId: string, targetId: string): CodeNode[] | null {
    const cacheKey = `path:${sourceId}:${targetId}`;
    
    // Check query cache
    const cached = this.getCachedQuery(cacheKey);
    if (cached) {
      return cached;
    }

    // Check if both nodes exist
    if (!this.getNode(sourceId)) {
      throw new NotFoundError('Node', sourceId);
    }
    if (!this.getNode(targetId)) {
      throw new NotFoundError('Node', targetId);
    }

    // Use SQLite recursive CTE for shortest path (adapted from EML)
    const sql = `
      WITH RECURSIVE paths(id, depth, path) AS (
        SELECT ?, 0, '>' || ? || '>'
        UNION ALL
        SELECT e.target_id, paths.depth + 1, paths.path || e.target_id || '>'
        FROM edges e
        JOIN paths ON e.source_id = paths.id
        WHERE paths.depth < ? AND paths.path NOT LIKE '%>' || e.target_id || '>%'
      )
      SELECT path FROM paths WHERE id = ? ORDER BY depth LIMIT 1`;

    const db = (this.storage as any).db; // Access underlying DB for CTE
    const result = db
      .prepare(sql)
      .get(sourceId, sourceId, MAX_TRAVERSE_DEPTH, targetId) as { path: string } | undefined;

    if (!result) {
      this.cacheQuery(cacheKey, []);
      return null;
    }

    // Parse path string to get node IDs
    const pathIds = result.path
      .split('>')
      .filter(id => id.length > 0);
    
    const pathNodes: CodeNode[] = [];
    for (const nodeId of pathIds) {
      const node = this.getNode(nodeId);
      if (node) {
        pathNodes.push(node);
        this.cacheNode(node);
      }
    }

    this.cacheQuery(cacheKey, pathNodes);
    return pathNodes.length > 0 ? pathNodes : null;
  }

  analyzeImpact(nodeId: string, maxDepth: number = 10): ImpactAnalysisResult {
    const cacheKey = `impact:${nodeId}:${maxDepth}`;
    
    // Check if we have this cached (store in queryCache as JSON)
    const cachedResult = this.queryCache.get(cacheKey);
    if (cachedResult) {
      // For impact analysis, we store the full result object in the cache
      return (cachedResult as any).result as ImpactAnalysisResult;
    }

    // Check if node exists
    if (!this.getNode(nodeId)) {
      throw new NotFoundError('Node', nodeId);
    }

    const affected = new Set<string>();
    const affectedFiles = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];
    const visited = new Set<string>();

    let maxDepthReached = 0;
    let totalConfidence = 0;
    let edgeCount = 0;

    // BFS traversal to find all nodes that depend on this node
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
        this.cacheNode(node);
      }

      // Get incoming edges (nodes that depend on current node)
      const inEdges = this.storage.getEdges(undefined, current.id);
      for (const edge of inEdges) {
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

    const result: ImpactAnalysisResult = {
      affectedNodes,
      affectedFiles,
      depth: maxDepthReached,
      confidence: avgConfidence,
    };

    // Cache the result (store as special object)
    this.queryCache.set(cacheKey, {
      key: cacheKey,
      nodes: affectedNodes, // For consistency with cache interface
      accessedAt: Date.now(),
      result, // Store the full result
    } as any);

    return result;
  }

  computeCentrality(): Map<string, number> {
    // Use a simple degree-based centrality implementation
    // For better performance, could use SQL queries for degree calculation
    const centrality = new Map<string, number>();
    
    // Count degree for each node using edge queries
    // This could be optimized with a single SQL GROUP BY query
    const allNodes = this.storage.getAllNodes();
    
    for (const node of allNodes) {
      const inEdges = this.storage.getEdges(undefined, node.id);
      const outEdges = this.storage.getEdges(node.id);
      const degree = inEdges.length + outEdges.length;
      centrality.set(node.id, degree);
    }

    return centrality;
  }

  getCentrality(nodeId: string): number {
    // For StorageBackedGraph, compute on demand rather than caching globally
    const inEdges = this.storage.getEdges(undefined, nodeId);
    const outEdges = this.storage.getEdges(nodeId);
    return inEdges.length + outEdges.length;
  }

  findDeadCode(repositoryId?: string): CodeNode[] {
    const cacheKey = `deadcode:${repositoryId || 'all'}`;
    
    // Check query cache
    const cached = this.getCachedQuery(cacheKey);
    if (cached) {
      return cached;
    }

    // Get nodes with filter, bounded to MAX_TRAVERSE_ROWS
    const filter: NodeFilter = {};
    if (repositoryId) {
      filter.repositoryId = repositoryId;
    }
    
    const allNodes = this.storage.getNodes(filter).slice(0, MAX_TRAVERSE_ROWS);
    const deadNodes: CodeNode[] = [];

    for (const node of allNodes) {
      if (node.kind === 'function' || node.kind === 'method' || node.kind === 'class') {
        // Check if node has any incoming edges (callers)
        const inEdges = this.storage.getEdges(undefined, node.id);
        if (inEdges.length === 0 && !node.isExported) {
          deadNodes.push(node);
          this.cacheNode(node);
        }
      }
    }

    this.cacheQuery(cacheKey, deadNodes);
    return deadNodes;
  }

  explainArchitecture(repositoryId: string, detailLevel: number = 1): ArchitectureSummary {
    // For architecture analysis, we compute fresh since it's complex
    // and not frequently called (no caching for now)
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

    // Get centrality for all nodes (expensive but needed for key abstractions)
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

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  private cacheNode(node: CodeNode): void {
    // Evict oldest if at capacity
    if (this.nodeCache.size >= this.maxCacheEntries) {
      this.evictOldestNode();
    }
    
    this.nodeCache.set(node.id, {
      node,
      cachedAt: Date.now()
    });
  }

  private cacheQuery(key: string, nodes: CodeNode[]): void {
    // Evict oldest query if at capacity
    if (this.queryCache.size >= Math.floor(this.maxCacheEntries / 4)) {
      this.evictOldestQuery();
    }
    
    this.queryCache.set(key, {
      key,
      nodes: [...nodes], // Defensive copy
      accessedAt: Date.now()
    });
  }

  private getCachedQuery(key: string): CodeNode[] | null {
    const cached = this.queryCache.get(key);
    if (!cached) {
      return null;
    }
    
    // Update access time and return
    cached.accessedAt = Date.now();
    return cached.nodes;
  }

  private evictOldestNode(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, cached] of this.nodeCache.entries()) {
      if (cached.cachedAt < oldestTime) {
        oldestTime = cached.cachedAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.nodeCache.delete(oldestKey);
    }
  }

  private evictOldestQuery(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, cached] of this.queryCache.entries()) {
      if (cached.accessedAt < oldestTime) {
        oldestTime = cached.accessedAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.queryCache.delete(oldestKey);
    }
  }

  // Invalidate cache entries (will be used by write methods in Phase 12)
  // private invalidateCache(): void {
  //   this.nodeCache.clear();
  //   this.queryCache.clear();
  // }
}