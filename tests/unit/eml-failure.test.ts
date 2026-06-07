import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { SqliteGraphStore } from '../../src/eml/store/sqlite-graph.js';
import { HotCache } from '../../src/eml/store/hot-cache.js';
import { EventStore } from '../../src/eml/events/store.js';
import { FailureEngine } from '../../src/eml/engines/failure.js';
import { haveWeTriedThis, memoryRemember } from '../../src/eml/mcp/handlers.js';
import type { EmlServices } from '../../src/eml/mcp/handlers.js';

const REPO = '0123456789abcdef';

function makeEml(storage: SqliteStorageProvider): EmlServices {
  const db = storage.getDatabase();
  const repo = new MemoryRepo(db);
  return {
    enabled: true,
    extraction: 'fallback',
    db,
    storage,
    memoryRepo: repo,
    graph: new SqliteGraphStore(db, { cache: new HotCache(8) }),
    eventStore: new EventStore(db),
    failures: new FailureEngine(db, repo),
    now: () => new Date(),
  };
}

describe('EML Failure engine', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let eml: EmlServices;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-fail-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    eml = makeEml(storage);
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists and reads back failure fields including lessons JSON', () => {
    const memory = eml.memoryRepo.create({
      kind: 'failure',
      title: 'Tried Redis cache for graph',
      repositoryId: REPO,
      confidence: 0.7,
    });
    eml.failures!.upsert({
      memoryId: memory.id,
      failureType: 'rejected_tech',
      whatFailed: 'Redis cache for graph traversals',
      whyFailed: 'operational overhead outweighed gains',
      lessons: ['prefer in-process LRU', 'measure before adding infra'],
      rootCause: 'premature optimization',
    });
    const record = eml.failures!.get(memory.id);
    expect(record?.failureType).toBe('rejected_tech');
    expect(record?.lessons).toEqual(['prefer in-process LRU', 'measure before adding infra']);
    expect(record?.rootCause).toBe('premature optimization');
  });

  it('defaults invalid/missing failure type to failed_impl', () => {
    const memory = eml.memoryRepo.create({ kind: 'failure', title: 'X', repositoryId: REPO });
    const rec = eml.failures!.fromMemory(memory);
    expect(rec.failureType).toBe('failed_impl');
  });

  it('upsert is idempotent', () => {
    const memory = eml.memoryRepo.create({ kind: 'failure', title: 'Y', repositoryId: REPO });
    eml.failures!.upsert({ memoryId: memory.id, whatFailed: 'a', whyFailed: 'first' });
    eml.failures!.upsert({ memoryId: memory.id, whatFailed: 'a', whyFailed: 'second' });
    expect(eml.failures!.get(memory.id)?.whyFailed).toBe('second');
  });

  it('have_we_tried_this returns similar failures with lessons (BM25 path)', async () => {
    const memory = eml.memoryRepo.create({
      kind: 'failure',
      title: 'Migrating to monorepo build failed',
      summary: 'turborepo migration abandoned due to CI flakiness',
      repositoryId: REPO,
      confidence: 0.8,
    });
    eml.failures!.fromMemory(memory, {
      failureType: 'abandoned_migration',
      lessons: ['pin CI runners first'],
    });

    const res = await haveWeTriedThis({ repositoryId: REPO, description: 'turborepo migration' }, eml);
    expect(res.results.length).toBeGreaterThanOrEqual(1);
    expect(res.results[0].lessons).toEqual(['pin CI runners first']);
    expect(res.results[0].failureType).toBe('abandoned_migration');
  });

  it('have_we_tried_this returns empty list when no failures match', async () => {
    const res = await haveWeTriedThis({ repositoryId: REPO, description: 'totally unrelated xyz' }, eml);
    expect(res.results).toEqual([]);
  });

  it('agent-asserted failure persists a failure side-record', async () => {
    const { id } = await memoryRemember(
      { kind: 'failure', title: 'Tried optimistic locking without version', repositoryId: REPO },
      eml
    );
    expect(eml.failures!.get(id)?.whatFailed).toBe('Tried optimistic locking without version');
  });
});
