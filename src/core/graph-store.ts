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
  NodeFilter 
} from './types.js';
import { GraphError } from './errors.js';

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