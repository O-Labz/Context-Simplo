import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { SqliteGraphStore } from '../../src/eml/store/sqlite-graph.js';
import { HotCache } from '../../src/eml/store/hot-cache.js';
import { EventStore } from '../../src/eml/events/store.js';
import { DecisionEngine } from '../../src/eml/engines/decision.js';
import { whyWasThisChosen, memoryRemember } from '../../src/eml/mcp/handlers.js';
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
    decisions: new DecisionEngine(db, repo),
    now: () => new Date(),
  };
}

describe('EML Decision engine', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let eml: EmlServices;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-dec-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    eml = makeEml(storage);
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists and reads back decision fields including alternatives JSON', () => {
    const memory = eml.memoryRepo.create({
      kind: 'decision',
      title: 'Adopt SQLite-native graph',
      summary: 'No second datastore',
      repositoryId: REPO,
      confidence: 0.7,
    });
    eml.decisions!.upsert({
      memoryId: memory.id,
      decision: 'Adopt SQLite-native graph',
      rationale: 'Avoid operational overhead of a separate graph DB',
      alternatives: ['Neo4j', 'in-memory graphology only'],
      tradeoffs: ['recursive CTE depth caps'],
      affectedSystems: ['eml', 'graph'],
    });
    const record = eml.decisions!.get(memory.id);
    expect(record?.alternatives).toEqual(['Neo4j', 'in-memory graphology only']);
    expect(record?.tradeoffs).toEqual(['recursive CTE depth caps']);
    expect(record?.status).toBe('active');
  });

  it('upsert is idempotent (replaces, not duplicates)', () => {
    const memory = eml.memoryRepo.create({ kind: 'decision', title: 'X', repositoryId: REPO });
    eml.decisions!.upsert({ memoryId: memory.id, decision: 'X', rationale: 'first' });
    eml.decisions!.upsert({ memoryId: memory.id, decision: 'X', rationale: 'second' });
    expect(eml.decisions!.get(memory.id)?.rationale).toBe('second');
  });

  it('why_was_this_chosen returns ranked decisions by topic', () => {
    const a = eml.memoryRepo.create({
      kind: 'decision',
      title: 'Use event sourcing',
      summary: 'append-only log',
      repositoryId: REPO,
      confidence: 0.9,
    });
    eml.decisions!.fromMemory(a);
    const b = eml.memoryRepo.create({
      kind: 'decision',
      title: 'Use event log buffering',
      summary: 'buffer events',
      repositoryId: REPO,
      confidence: 0.3,
    });
    eml.decisions!.fromMemory(b);

    const res = whyWasThisChosen({ repositoryId: REPO, topic: 'event' }, eml);
    expect(res.results.length).toBeGreaterThanOrEqual(1);
    expect(res.results[0].decision).toBeDefined();
  });

  it('why_was_this_chosen returns empty list (200 semantics), not error, when none match', () => {
    const res = whyWasThisChosen({ repositoryId: REPO, topic: 'nonexistent topic xyz' }, eml);
    expect(res.results).toEqual([]);
  });

  it('agent-asserted decision persists a decision side-record', async () => {
    const { id } = await memoryRemember(
      {
        kind: 'decision',
        title: 'Prefer RRF fusion',
        summary: 'combine vector + bm25',
        repositoryId: REPO,
      },
      eml
    );
    expect(eml.decisions!.get(id)?.decision).toBe('Prefer RRF fusion');
  });

  it('queries decisions by linked entityRef', () => {
    const memory = eml.memoryRepo.create({
      kind: 'decision',
      title: 'Cap traversal depth',
      repositoryId: REPO,
      confidence: 0.8,
    });
    eml.decisions!.fromMemory(memory);
    eml.db
      .prepare(`INSERT OR IGNORE INTO entity_links (memory_id, target_kind, target_ref) VALUES (?, 'symbol', ?)`)
      .run(memory.id, 'traverse');
    const res = whyWasThisChosen({ repositoryId: REPO, entityRef: 'traverse' }, eml);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].decision).toBe('Cap traversal depth');
  });
});
