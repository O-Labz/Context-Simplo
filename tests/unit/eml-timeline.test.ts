import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { EventStore } from '../../src/eml/events/store.js';
import { TimelineEngine, TIMELINE_MAX_LIMIT } from '../../src/eml/engines/timeline.js';

const REPO = '0123456789abcdef';

describe('EML Timeline engine', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let repo: MemoryRepo;
  let store: EventStore;
  let engine: TimelineEngine;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-tl-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    const db = storage.getDatabase();
    repo = new MemoryRepo(db);
    store = new EventStore(db);
    engine = new TimelineEngine(db, repo);
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function linkEntity(memoryId: string, ref: string): void {
    storage
      .getDatabase()
      .prepare(`INSERT OR IGNORE INTO entity_links (memory_id, target_kind, target_ref) VALUES (?, 'symbol', ?)`)
      .run(memoryId, ref);
  }

  it('merges decisions, failures, and diffs ordered chronologically', () => {
    const d = repo.create({
      kind: 'decision',
      title: 'Adopt caching',
      repositoryId: REPO,
      validFrom: '2026-01-01T00:00:00Z',
    });
    linkEntity(d.id, 'CacheService');
    const f = repo.create({
      kind: 'failure',
      title: 'Cache invalidation bug',
      repositoryId: REPO,
      validFrom: '2026-03-01T00:00:00Z',
    });
    linkEntity(f.id, 'CacheService');

    store.append({
      type: 'code.diff.observed',
      source: 'diff_observer',
      sourceRef: 'r1',
      repositoryId: REPO,
      payload: { from: 'HEAD~1', to: 'HEAD', files: ['CacheService.ts'] },
      occurredAt: '2026-02-01T00:00:00Z',
    });

    const { entries, total } = engine.showEvolution({ repositoryId: REPO, entityRef: 'CacheService' });
    expect(total).toBe(3);
    expect(entries.map((e) => e.kind)).toEqual(['decision', 'diff', 'failure']);
    expect(entries[0].occurredAt < entries[1].occurredAt).toBe(true);
    expect(entries[1].occurredAt < entries[2].occurredAt).toBe(true);
  });

  it('paginates with default and bounded limits', () => {
    for (let i = 0; i < 5; i++) {
      const m = repo.create({
        kind: 'decision',
        title: `Decision ${i}`,
        repositoryId: REPO,
        validFrom: `2026-01-0${i + 1}T00:00:00Z`,
      });
      linkEntity(m.id, 'Thing');
    }
    const page1 = engine.showEvolution({ repositoryId: REPO, entityRef: 'Thing', limit: 2, offset: 0 });
    expect(page1.entries).toHaveLength(2);
    expect(page1.total).toBe(5);
    const page2 = engine.showEvolution({ repositoryId: REPO, entityRef: 'Thing', limit: 2, offset: 2 });
    expect(page2.entries[0].id).not.toBe(page1.entries[0].id);

    // limit is clamped to the max
    const clamped = engine.showEvolution({ repositoryId: REPO, entityRef: 'Thing', limit: 100000 });
    expect(clamped.entries.length).toBeLessThanOrEqual(TIMELINE_MAX_LIMIT);
  });

  it('returns empty for an unknown entity', () => {
    const res = engine.showEvolution({ repositoryId: REPO, entityRef: 'Nonexistent' });
    expect(res.entries).toEqual([]);
    expect(res.total).toBe(0);
  });
});
