/**
 * EML REST API integration tests (Fastify inject, ephemeral SQLite).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { CodeGraph } from '../../src/core/graph.js';
import { createAPIServer } from '../../src/api/server.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { SqliteGraphStore } from '../../src/eml/store/sqlite-graph.js';
import { HotCache } from '../../src/eml/store/hot-cache.js';
import { EventStore } from '../../src/eml/events/store.js';
import type { EmlServices } from '../../src/eml/mcp/handlers.js';

const REPO = 'f00acc4e11a3eac5';

function buildEml(storage: SqliteStorageProvider, enabled: boolean): EmlServices {
  const db = storage.getDatabase();
  return {
    enabled,
    extraction: 'fallback',
    db,
    storage,
    memoryRepo: new MemoryRepo(db),
    graph: new SqliteGraphStore(db, { cache: new HotCache(64) }),
    eventStore: new EventStore(db),
    now: () => new Date(),
  };
}

async function makeServer(enabled: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'eml-api-'));
  const dash = join(dir, 'dash');
  mkdirSync(dash, { recursive: true });
  const storage = new SqliteStorageProvider(join(dir, 'test.db'));
  await storage.initialize();
  const graph = new CodeGraph();
  const server = await createAPIServer({
    storage,
    graph,
    dashboardPath: dash,
    workspaceRoot: dir,
    templatesPath: dir,
    serverHost: 'localhost',
    serverPort: 3001,
    eml: buildEml(storage, enabled),
  });
  return { dir, storage, server };
}

describe('EML API (enabled)', () => {
  let ctx: Awaited<ReturnType<typeof makeServer>>;

  beforeAll(async () => {
    ctx = await makeServer(true);
  });

  afterAll(async () => {
    await ctx.server.fastify.close();
    ctx.storage.close();
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  it('health returns ok + sqlite-native backend', async () => {
    const res = await ctx.server.fastify.inject({ method: 'GET', url: '/api/eml/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.backend).toBe('sqlite-native');
  });

  it('asserts then retrieves a memory', async () => {
    const create = await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/memories',
      payload: { kind: 'decision', title: 'Use SQLite-native graph', summary: 'no second datastore', repositoryId: REPO },
    });
    expect(create.statusCode).toBe(201);
    const { id } = JSON.parse(create.body);
    expect(id).toBeTruthy();
    expect(create.headers.location).toBe(`/api/eml/memories/${id}`);

    const get = await ctx.server.fastify.inject({ method: 'GET', url: `/api/eml/memories/${id}` });
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(get.body).memory.title).toBe('Use SQLite-native graph');
  });

  it('search returns the asserted memory with confidence>0', async () => {
    await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/memories',
      payload: { kind: 'decision', title: 'Adopt event sourcing', summary: 'replayable provenance log', repositoryId: REPO },
    });
    const res = await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/memories/search',
      payload: { query: 'event sourcing', repositoryId: REPO, limit: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].confidence).toBeGreaterThan(0);
  });

  it('returns 400 for a malformed assert body', async () => {
    const res = await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/memories',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('memory_invalid');
  });

  it('returns 409 on idempotency key reuse', async () => {
    const payload = { kind: 'note', title: 'once', repositoryId: REPO, idempotencyKey: 'dup-key-1' };
    const first = await ctx.server.fastify.inject({ method: 'POST', url: '/api/eml/memories', payload });
    expect(first.statusCode).toBe(201);
    const second = await ctx.server.fastify.inject({ method: 'POST', url: '/api/eml/memories', payload });
    expect(second.statusCode).toBe(409);
    expect(JSON.parse(second.body).error).toBe('memory_duplicate');
  });

  it('returns 404 for an unknown memory id', async () => {
    const res = await ctx.server.fastify.inject({ method: 'GET', url: '/api/eml/memories/nope' });
    expect(res.statusCode).toBe(404);
  });
});

describe('EML API (disabled)', () => {
  let ctx: Awaited<ReturnType<typeof makeServer>>;

  beforeAll(async () => {
    ctx = await makeServer(false);
  });

  afterAll(async () => {
    await ctx.server.fastify.close();
    ctx.storage.close();
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  it('health returns 503 when disabled', async () => {
    const res = await ctx.server.fastify.inject({ method: 'GET', url: '/api/eml/health' });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).ok).toBe(false);
  });

  it('assert returns 503 when disabled', async () => {
    const res = await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/memories',
      payload: { kind: 'note', title: 't', repositoryId: REPO },
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toBe('eml_disabled');
  });
});
