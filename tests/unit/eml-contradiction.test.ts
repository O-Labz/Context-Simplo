import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { SqliteGraphStore } from '../../src/eml/store/sqlite-graph.js';
import { HotCache } from '../../src/eml/store/hot-cache.js';
import { EventStore } from '../../src/eml/events/store.js';
import { ContradictionEngine, polarityOf, subjectOf } from '../../src/eml/engines/contradiction.js';

const REPO = '0123456789abcdef';

describe('EML Contradiction engine', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let repo: MemoryRepo;
  let graph: SqliteGraphStore;
  let store: EventStore;
  let engine: ContradictionEngine;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-contra-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    const db = storage.getDatabase();
    repo = new MemoryRepo(db);
    graph = new SqliteGraphStore(db, { cache: new HotCache(8) });
    store = new EventStore(db);
    engine = new ContradictionEngine(db, graph, repo, { eventStore: store });
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('classifies polarity and extracts subject', () => {
    expect(polarityOf('Added dependency left-pad')).toBe('positive');
    expect(polarityOf('Removed dependency left-pad')).toBe('negative');
    expect(polarityOf('Use SQLite for storage')).toBe('positive');
    expect(subjectOf('Added dependency left-pad')).toBe(subjectOf('Removed dependency left-pad'));
  });

  it('detects opposing claims about the same subject', () => {
    const a = repo.create({ kind: 'decision', title: 'Added dependency left-pad', repositoryId: REPO, confidence: 0.8 });
    const b = repo.create({ kind: 'decision', title: 'Removed dependency left-pad', repositoryId: REPO, confidence: 0.8 });

    const found = engine.detectForMemory(b);
    expect(found).toHaveLength(1);
    expect([found[0].memoryA, found[0].memoryB].sort()).toEqual([a.id, b.id].sort());

    // both memories had confidence lowered + contradiction score raised
    const ra = repo.getById(a.id);
    const rb = repo.getById(b.id);
    expect(ra.contradictionScore).toBeGreaterThan(0);
    expect(rb.contradictionScore).toBeGreaterThan(0);
    expect(ra.confidence).toBeLessThan(0.8);

    // CONTRADICTS edge exists
    const neighbors = graph.neighbors(a.id, { edgeLabels: ['CONTRADICTS'] });
    expect(neighbors.some((n) => n.id === b.id)).toBe(true);

    // event emitted
    expect(store.countByStatus('pending')).toBe(1);
  });

  it('does not flag agreeing claims or neutral statements', () => {
    repo.create({ kind: 'decision', title: 'Added dependency zod', repositoryId: REPO });
    const same = repo.create({ kind: 'decision', title: 'Adopt dependency zod', repositoryId: REPO });
    expect(engine.detectForMemory(same)).toHaveLength(0);

    const neutral = repo.create({ kind: 'note', title: 'Dependency zod notes', repositoryId: REPO });
    expect(engine.detectForMemory(neutral)).toHaveLength(0);
  });

  it('is idempotent: re-detecting the same pair records once', () => {
    repo.create({ kind: 'decision', title: 'Use Redis cache', repositoryId: REPO });
    const b = repo.create({ kind: 'decision', title: 'Avoid Redis cache', repositoryId: REPO });
    expect(engine.detectForMemory(b)).toHaveLength(1);
    expect(engine.detectForMemory(b)).toHaveLength(0);
    const count = storage.getDatabase().prepare('SELECT COUNT(*) AS c FROM contradictions').get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('manual flag records a contradiction between arbitrary memories', () => {
    const a = repo.create({ kind: 'note', title: 'X', repositoryId: REPO });
    const b = repo.create({ kind: 'note', title: 'Y', repositoryId: REPO });
    const rec = engine.flag(a.id, b.id, 'manual');
    expect(rec).not.toBeNull();
    expect(engine.flag(a.id, b.id, 'manual')).toBeNull();
  });
});
