import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { MemoryRepo, type MemoryObject } from '../../src/eml/store/memory-repo.js';
import { freshnessOf, fuseRRF, rankMemories, scoreMemory } from '../../src/eml/retrieval/rank.js';
import { gatherCandidates } from '../../src/eml/retrieval/candidates.js';

const REPO = '0123456789abcdef';
const NOW = new Date('2026-06-01T00:00:00.000Z');

function mem(overrides: Partial<MemoryObject>): MemoryObject {
  return {
    id: 'm',
    kind: 'decision',
    title: 't',
    summary: '',
    body: '',
    repositoryId: REPO,
    confidence: 0,
    freshness: 1,
    contradictionScore: 0,
    sourceCount: 1,
    lastVerifiedAt: null,
    validFrom: NOW.toISOString(),
    validTo: null,
    supersededBy: null,
    embeddingId: null,
    version: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('EML rank', () => {
  it('decays freshness with age', () => {
    const fresh = mem({ id: 'fresh', validFrom: '2026-06-01T00:00:00.000Z' });
    const old = mem({ id: 'old', validFrom: '2025-06-01T00:00:00.000Z' });
    expect(freshnessOf(fresh, NOW)).toBeGreaterThan(freshnessOf(old, NOW));
  });

  it('ranks the fresher memory higher, all else equal', () => {
    const fresh = mem({ id: 'fresh', validFrom: '2026-06-01T00:00:00.000Z' });
    const old = mem({ id: 'old', validFrom: '2024-06-01T00:00:00.000Z' });
    const lists = [{ source: 'bm25' as const, memoryIds: ['fresh', 'old'] }];
    // give them equal relevance by using a list where both share rank via two lists
    const ranked = rankMemories([old, fresh], [{ source: 'bm25', memoryIds: ['old'] }, { source: 'vector', memoryIds: ['fresh'] }], NOW);
    void lists;
    expect(ranked[0].memory.id).toBe('fresh');
  });

  it('applies active-goal bias', () => {
    const a = mem({ id: 'a' });
    const b = mem({ id: 'b' });
    const lists = [{ source: 'bm25' as const, memoryIds: ['a', 'b'] }];
    const withBias = rankMemories([a, b], lists, NOW, {
      goalBiasOf: (m) => (m.id === 'b' ? 1 : 0),
    });
    expect(withBias[0].memory.id).toBe('b');
  });

  it('penalizes contradiction', () => {
    const clean = mem({ id: 'clean', contradictionScore: 0 });
    const conflicted = mem({ id: 'conflicted', contradictionScore: 1 });
    const s1 = scoreMemory(clean, 0.1, NOW);
    const s2 = scoreMemory(conflicted, 0.1, NOW);
    expect(s1).toBeGreaterThan(s2);
  });

  it('fuses lists with RRF (overlap scores higher)', () => {
    const fused = fuseRRF([
      { source: 'bm25', memoryIds: ['x', 'y'] },
      { source: 'vector', memoryIds: ['x', 'z'] },
    ]);
    expect(fused.get('x')!).toBeGreaterThan(fused.get('y')!);
    expect(fused.get('x')!).toBeGreaterThan(fused.get('z')!);
  });

  it('is deterministic across runs (stable order)', () => {
    const items = [mem({ id: 'a' }), mem({ id: 'b' }), mem({ id: 'c' })];
    const lists = [{ source: 'bm25' as const, memoryIds: ['a', 'b', 'c'] }];
    const r1 = rankMemories(items, lists, NOW).map((r) => r.memory.id);
    const r2 = rankMemories([...items].reverse(), lists, NOW).map((r) => r.memory.id);
    expect(r1).toEqual(r2);
  });
});

describe('EML candidate generation (no-LLM degradation)', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let repo: MemoryRepo;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-cand-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    repo = new MemoryRepo(storage.getDatabase());
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns bm25 candidates with no vector provider', async () => {
    repo.create({ kind: 'decision', title: 'Adopt caching', summary: 'redis cache', body: 'use redis', repositoryId: REPO });
    const result = await gatherCandidates({ query: 'caching', repositoryId: REPO, limit: 10, repo });
    expect(result.lists.find((l) => l.source === 'vector')!.memoryIds).toHaveLength(0);
    expect(result.ids.length).toBeGreaterThan(0);
  });
});
