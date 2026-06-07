import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { SqliteGraphStore } from '../../src/eml/store/sqlite-graph.js';
import { HotCache } from '../../src/eml/store/hot-cache.js';
import { MAX_TRAVERSE_DEPTH } from '../../src/eml/store/graph-store.js';

const REPO = 'repo1';

describe('EML SqliteGraphStore', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let cache: HotCache;
  let g: SqliteGraphStore;

  function node(id: string) {
    g.addNode({ id, label: 'n', ref: id, repositoryId: REPO });
  }
  function edge(src: string, dst: string, label = 'DEP') {
    g.addEdge({ src, dst, label, repositoryId: REPO });
  }

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-graph-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    cache = new HotCache(128);
    g = new SqliteGraphStore(storage.getDatabase(), { cache });
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns reachable nodes within depth', () => {
    ['A', 'B', 'C', 'D'].forEach(node);
    edge('A', 'B');
    edge('B', 'C');
    edge('C', 'D');
    const reached = g.traverse({ rootId: 'A' }).map((n) => n.id);
    expect(reached).toEqual(['B', 'C', 'D']);
  });

  it('honors the depth cap', () => {
    ['A', 'B', 'C', 'D'].forEach(node);
    edge('A', 'B');
    edge('B', 'C');
    edge('C', 'D');
    const reached = g.traverse({ rootId: 'A', maxDepth: 1 }).map((n) => n.id);
    expect(reached).toEqual(['B']);
  });

  it('caps depth at MAX_TRAVERSE_DEPTH even if a larger value is requested', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `N${i}`);
    ids.forEach(node);
    for (let i = 0; i < ids.length - 1; i++) edge(ids[i], ids[i + 1]);
    const reached = g.traverse({ rootId: 'N0', maxDepth: 1000 });
    expect(reached.length).toBeLessThanOrEqual(MAX_TRAVERSE_DEPTH);
  });

  it('honors the row cap (limit)', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `R${i}`);
    ids.forEach(node);
    // Star graph: root connects to all others (all depth 1).
    for (let i = 1; i < ids.length; i++) edge('R0', ids[i]);
    const reached = g.traverse({ rootId: 'R0', limit: 3 });
    expect(reached).toHaveLength(3);
  });

  it('terminates on cycles (cycle guard)', () => {
    ['A', 'B', 'C'].forEach(node);
    edge('A', 'B');
    edge('B', 'C');
    edge('C', 'A');
    // Root is excluded from results; the assertion is that traversal terminates
    // and yields the finite descendant set despite the cycle.
    const reached = g.traverse({ rootId: 'A', maxDepth: 1000 }).map((n) => n.id).sort();
    expect(reached).toEqual(['B', 'C']);
  });

  it('filters by edge label', () => {
    ['A', 'B', 'C'].forEach(node);
    edge('A', 'B', 'CALLS');
    edge('A', 'C', 'OWNS');
    const reached = g.traverse({ rootId: 'A', edgeLabels: ['CALLS'] }).map((n) => n.id);
    expect(reached).toEqual(['B']);
  });

  it('supports in / both directions', () => {
    ['A', 'B', 'C'].forEach(node);
    edge('A', 'B');
    edge('C', 'B');
    expect(g.traverse({ rootId: 'B', direction: 'in' }).map((n) => n.id).sort()).toEqual(['A', 'C']);
    expect(g.traverse({ rootId: 'A', direction: 'both' }).map((n) => n.id).sort()).toEqual(['B', 'C']);
  });

  it('finds the shortest path', () => {
    ['A', 'B', 'C', 'D'].forEach(node);
    edge('A', 'B');
    edge('B', 'D');
    edge('A', 'C');
    edge('C', 'D');
    const path = g.shortestPath('A', 'D');
    expect(path?.[0]).toBe('A');
    expect(path?.[path.length - 1]).toBe('D');
    expect(path).toHaveLength(3);
  });

  it('returns null when no path exists', () => {
    ['A', 'B'].forEach(node);
    expect(g.shortestPath('A', 'B')).toBeNull();
  });

  it('returns [src] when src === dst', () => {
    node('A');
    expect(g.shortestPath('A', 'A')).toEqual(['A']);
  });

  it('lists neighbors in a direction', () => {
    ['A', 'B', 'C'].forEach(node);
    edge('A', 'B');
    edge('A', 'C');
    expect(g.neighbors('A').map((n) => n.id).sort()).toEqual(['B', 'C']);
  });

  it('caches traversals and invalidates on mutation', () => {
    ['A', 'B'].forEach(node);
    edge('A', 'B');
    g.traverse({ rootId: 'A' });
    expect(cache.size).toBe(1);
    node('C');
    edge('A', 'C');
    // Mutation touching A's subgraph should have evicted the cached entry.
    const reached = g.traverse({ rootId: 'A' }).map((n) => n.id).sort();
    expect(reached).toEqual(['B', 'C']);
  });
});
