/**
 * Bounded hot-subgraph cache for repeated graph traversals.
 *
 * Wraps a graphology DirectedGraph that mirrors the union of all cached
 * traversal results (the "hot subgraph"), plus an LRU of traversal results keyed
 * by `(rootId, spec)`. Any node/edge mutation that touches a cached node evicts
 * the affected entries to prevent staleness.
 */

import DirectedGraph from 'graphology';
import type { TraverseResultNode } from './graph-store.js';

/** Rough bytes-per-cached-node budget used to derive a max entry count. */
const APPROX_BYTES_PER_NODE = 512;
const MIN_ENTRIES = 8;

interface CacheEntry {
  nodes: TraverseResultNode[];
  nodeIds: Set<string>;
}

export class HotCache {
  private readonly maxEntries: number;
  private readonly lru = new Map<string, CacheEntry>();
  private readonly hot: DirectedGraph;

  constructor(cacheMb: number, avgResultSize = 50) {
    const budgetBytes = Math.max(1, cacheMb) * 1024 * 1024;
    const perEntry = APPROX_BYTES_PER_NODE * Math.max(1, avgResultSize);
    this.maxEntries = Math.max(MIN_ENTRIES, Math.floor(budgetBytes / perEntry));
    this.hot = new DirectedGraph({ allowSelfLoops: true, multi: false });
  }

  get(key: string): TraverseResultNode[] | undefined {
    const entry = this.lru.get(key);
    if (!entry) return undefined;
    // Move to most-recently-used position.
    this.lru.delete(key);
    this.lru.set(key, entry);
    return entry.nodes;
  }

  set(key: string, nodes: TraverseResultNode[], extraIds: string[] = []): void {
    const nodeIds = new Set([...nodes.map((n) => n.id), ...extraIds]);
    this.lru.set(key, { nodes, nodeIds });
    for (const n of nodes) {
      if (!this.hot.hasNode(n.id)) {
        this.hot.addNode(n.id, { label: n.label, ref: n.ref });
      }
    }
    while (this.lru.size > this.maxEntries) {
      const oldestKey = this.lru.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.lru.delete(oldestKey);
    }
    this.rebuildHotIfShrunk();
  }

  /**
   * Evict any cached traversal whose result set references one of `nodeIds`.
   * Called on addNode/addEdge so cached subgraphs never go stale.
   */
  invalidateForNodes(nodeIds: string[]): void {
    if (nodeIds.length === 0) return;
    const touched = new Set(nodeIds);
    for (const [key, entry] of this.lru) {
      for (const id of entry.nodeIds) {
        if (touched.has(id)) {
          this.lru.delete(key);
          break;
        }
      }
    }
    for (const id of nodeIds) {
      if (this.hot.hasNode(id) && !this.isStillReferenced(id)) {
        this.hot.dropNode(id);
      }
    }
  }

  clear(): void {
    this.lru.clear();
    this.hot.clear();
  }

  get size(): number {
    return this.lru.size;
  }

  /** Exposed for diagnostics: number of nodes in the hot subgraph. */
  get hotNodeCount(): number {
    return this.hot.order;
  }

  private isStillReferenced(id: string): boolean {
    for (const entry of this.lru.values()) {
      if (entry.nodeIds.has(id)) return true;
    }
    return false;
  }

  private rebuildHotIfShrunk(): void {
    // Drop hot-graph nodes no longer referenced by any cache entry.
    const referenced = new Set<string>();
    for (const entry of this.lru.values()) {
      for (const id of entry.nodeIds) referenced.add(id);
    }
    for (const id of this.hot.nodes()) {
      if (!referenced.has(id)) this.hot.dropNode(id);
    }
  }
}
