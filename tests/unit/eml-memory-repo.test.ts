import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { MemoryVectorStore } from '../../src/eml/store/memory-vectors.js';
import { MemoryNotFoundError, MemoryValidationError } from '../../src/core/errors.js';

const REPO = '0123456789abcdef';

describe('EML MemoryRepo', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let repo: MemoryRepo;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-mem-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    repo = new MemoryRepo(storage.getDatabase());
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates and reads back a memory', () => {
    const created = repo.create({
      kind: 'decision',
      title: 'Use SQLite-native graph',
      summary: 'Avoid a second datastore',
      body: 'Event-sourced rationale',
      repositoryId: REPO,
    });
    expect(created.id).toMatch(/^mem_/);
    const fetched = repo.getById(created.id);
    expect(fetched.title).toBe('Use SQLite-native graph');
    expect(fetched.confidence).toBe(0);
    expect(fetched.freshness).toBe(1);
    expect(fetched.sourceCount).toBe(1);
    expect(fetched.version).toBe(1);
  });

  it('rejects invalid input with MemoryValidationError', () => {
    expect(() => repo.create({ kind: 'decision', title: '', repositoryId: REPO } as never)).toThrow(
      MemoryValidationError
    );
  });

  it('throws MemoryNotFoundError for missing id', () => {
    expect(() => repo.getById('nope')).toThrow(MemoryNotFoundError);
    expect(repo.find('nope')).toBeNull();
  });

  it('scrubs secrets in body and summary before persisting', () => {
    const secret = 'ghp_' + 'a'.repeat(36);
    const created = repo.create({
      kind: 'note',
      title: 'leaky note',
      summary: `token here ${secret}`,
      body: `body token ${secret}`,
      repositoryId: REPO,
    });
    const fetched = repo.getById(created.id);
    expect(fetched.body).not.toContain(secret);
    expect(fetched.summary).not.toContain(secret);
    expect(fetched.body).toContain('[REDACTED:github_token]');
  });

  it('updates fields and bumps version', () => {
    const created = repo.create({ kind: 'note', title: 't', repositoryId: REPO });
    const updated = repo.update(created.id, { confidence: 0.8, sourceCount: 3 });
    expect(updated.confidence).toBe(0.8);
    expect(updated.sourceCount).toBe(3);
    expect(updated.version).toBe(2);
  });

  it('enforces optimistic concurrency when expectedVersion mismatches', () => {
    const created = repo.create({ kind: 'note', title: 't', repositoryId: REPO });
    expect(() => repo.update(created.id, { confidence: 0.5 }, { expectedVersion: 99 })).toThrow(
      /Concurrent update conflict/
    );
  });

  it('adds and lists provenance (scrubbed)', () => {
    const created = repo.create({ kind: 'note', title: 't', repositoryId: REPO });
    repo.addProvenance({
      memoryId: created.id,
      sourceType: 'agent',
      sourceRef: 'agent:1',
      weight: 1,
    });
    const prov = repo.listProvenance(created.id);
    expect(prov).toHaveLength(1);
    expect(prov[0].sourceType).toBe('agent');
  });

  it('finds memories via FTS search', () => {
    repo.create({
      kind: 'decision',
      title: 'Adopt event sourcing',
      summary: 'replayable provenance',
      body: 'append only log',
      repositoryId: REPO,
    });
    const hits = repo.searchFts('event sourcing', REPO, 10);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('lists by kind, excluding superseded', () => {
    const a = repo.create({ kind: 'decision', title: 'A', repositoryId: REPO });
    const b = repo.create({ kind: 'decision', title: 'B', repositoryId: REPO });
    repo.update(a.id, { supersededBy: b.id });
    const list = repo.listByKind('decision', REPO);
    expect(list.map((m) => m.id)).toEqual([b.id]);
  });
});

describe('EML MemoryVectorStore (degraded mode)', () => {
  it('is a no-op when there are no embeddings (no provider)', async () => {
    const store = new MemoryVectorStore('/tmp/eml-vec-noop');
    // No initialize() and no vectors -> must not throw.
    await expect(
      store.upsert([{ id: 'v1', memoryId: 'm1', repositoryId: REPO, kind: 'note', vector: [] }])
    ).resolves.toBeUndefined();
    await expect(store.search(REPO, [])).resolves.toEqual([]);
  });
});
