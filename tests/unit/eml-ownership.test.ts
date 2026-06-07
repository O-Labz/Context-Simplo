import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { EventStore } from '../../src/eml/events/store.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { SqliteGraphStore } from '../../src/eml/store/sqlite-graph.js';
import { HotCache } from '../../src/eml/store/hot-cache.js';
import { PeopleEngine } from '../../src/eml/engines/people.js';
import { OwnershipEngine } from '../../src/eml/engines/ownership.js';
import { GitIngest } from '../../src/eml/ingest/git.js';
import { whoKnows } from '../../src/eml/mcp/handlers.js';
import type { EmlServices } from '../../src/eml/mcp/handlers.js';
import { RepositoryNotIndexedError } from '../../src/core/errors.js';

const REPO = '0123456789abcdef';

describe('EML Ownership engine', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let db: ReturnType<SqliteStorageProvider['getDatabase']>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-own-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    db = storage.getDatabase();
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function seedSignals(now: Date): { recentPerson: string; oldPerson: string } {
    const people = new PeopleEngine(db);
    const ingest = new GitIngest(db, new EventStore(db), people);
    const recent = people.resolve({ displayName: 'Recent Dev', email: 'recent@x.com' });
    const old = people.resolve({ displayName: 'Old Dev', email: 'old@x.com' });

    const recentDate = new Date(now.getTime() - 1 * 86_400_000).toISOString();
    const oldDate = new Date(now.getTime() - 365 * 86_400_000).toISOString();

    // Old dev has many but stale signals; recent dev has fewer but fresh.
    for (let i = 0; i < 5; i++) {
      ingest.addOwnershipSignal({
        personId: old.id,
        entityType: 'file',
        entityRef: 'src/a.ts',
        signal: 'commit',
        weight: 1,
        lastActivityAt: oldDate,
      });
    }
    ingest.addOwnershipSignal({
      personId: recent.id,
      entityType: 'file',
      entityRef: 'src/a.ts',
      signal: 'commit',
      weight: 1,
      lastActivityAt: recentDate,
    });
    return { recentPerson: recent.id, oldPerson: old.id };
  }

  it('ranks owners by recency-weighted signal volume', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const { recentPerson } = seedSignals(now);
    const graph = new SqliteGraphStore(db, { cache: new HotCache(8) });
    const engine = new OwnershipEngine(db, graph, { now: () => now });

    const owners = engine.rankOwners('src/a.ts', { limit: 10 });
    expect(owners.length).toBe(2);
    // The recent single signal outweighs five year-old signals (90d half-life).
    expect(owners[0].personId).toBe(recentPerson);
  });

  it('recompute projects OWNS edges and emits ownership.recomputed', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    seedSignals(now);
    const graph = new SqliteGraphStore(db, { cache: new HotCache(8) });
    const store = new EventStore(db);
    const engine = new OwnershipEngine(db, graph, { eventStore: store, now: () => now });

    const { owners, edges } = engine.recompute(REPO);
    expect(owners).toBe(2);
    expect(edges).toBeGreaterThan(0);

    const ownsEdge = graph.neighbors('src/a.ts', { direction: 'in', edgeLabels: ['OWNS'] });
    expect(ownsEdge.length).toBeGreaterThan(0);

    const pending = store.countByStatus('pending');
    expect(pending).toBeGreaterThanOrEqual(1);
  });

  it('who_knows raises RepositoryNotIndexedError when repo missing', () => {
    const graph = new SqliteGraphStore(db, { cache: new HotCache(8) });
    const eml = {
      enabled: true,
      extraction: 'fallback',
      db,
      storage,
      memoryRepo: new MemoryRepo(db),
      graph,
      eventStore: new EventStore(db),
      ownership: new OwnershipEngine(db, graph),
      now: () => new Date(),
    } as EmlServices;

    expect(() => whoKnows({ repositoryId: REPO, entityRef: 'src/a.ts' }, eml)).toThrow(
      RepositoryNotIndexedError
    );
  });
});
