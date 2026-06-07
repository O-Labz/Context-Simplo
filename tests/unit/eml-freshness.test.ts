import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { EventStore } from '../../src/eml/events/store.js';
import { FreshnessEngine, freshnessOf, confidenceOf, FRESHNESS_HALF_LIFE_DAYS } from '../../src/eml/engines/freshness.js';

const REPO = '0123456789abcdef';

describe('EML Freshness engine', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let repo: MemoryRepo;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-fresh-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    repo = new MemoryRepo(storage.getDatabase());
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('freshnessOf decays by half at the half-life', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const halfLifeAgo = new Date(now.getTime() - FRESHNESS_HALF_LIFE_DAYS * 86_400_000).toISOString();
    expect(freshnessOf(now.toISOString(), now)).toBeCloseTo(1, 5);
    expect(freshnessOf(halfLifeAgo, now)).toBeCloseTo(0.5, 2);
  });

  it('confidenceOf is deterministic and rises with source count', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const base = repo.create({ kind: 'decision', title: 'A', repositoryId: REPO, lastVerifiedAt: now.toISOString() });
    const low = confidenceOf({ ...base, sourceCount: 1 }, now);
    const high = confidenceOf({ ...base, sourceCount: 10 }, now);
    expect(high).toBeGreaterThan(low);
    // determinism
    expect(confidenceOf({ ...base, sourceCount: 10 }, now)).toBe(high);
  });

  it('reinforce bumps source count, refreshes recency, recomputes confidence', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const engine = new FreshnessEngine(repo, { now: () => now });
    const m = repo.create({ kind: 'note', title: 'B', repositoryId: REPO });
    const before = repo.getById(m.id);
    const after = engine.reinforce(m.id);
    expect(after.sourceCount).toBe(before.sourceCount + 1);
    expect(after.lastVerifiedAt).toBe(now.toISOString());
    expect(after.confidence).toBeGreaterThan(0);
    expect(after.version).toBe(before.version + 1);
  });

  it('verify refreshes freshness to 1 and updates confidence', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const engine = new FreshnessEngine(repo, { now: () => now });
    const m = repo.create({ kind: 'note', title: 'C', repositoryId: REPO });
    const after = engine.verify(m.id);
    expect(after.freshness).toBe(1);
    expect(after.lastVerifiedAt).toBe(now.toISOString());
  });

  it('recomputeRepository updates all live memories and emits score.recomputed', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const store = new EventStore(storage.getDatabase());
    const engine = new FreshnessEngine(repo, { eventStore: store, now: () => now });
    repo.create({ kind: 'decision', title: 'D1', repositoryId: REPO });
    repo.create({ kind: 'failure', title: 'F1', repositoryId: REPO });
    const updated = engine.recomputeRepository(REPO);
    expect(updated).toBe(2);
    expect(store.countByStatus('pending')).toBe(1);
  });
});
