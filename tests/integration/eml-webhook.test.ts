/**
 * EML webhook integration tests: signature rejection, size cap, host allowlist.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHmac } from 'crypto';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { CodeGraph } from '../../src/core/graph.js';
import { createAPIServer } from '../../src/api/server.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { SqliteGraphStore } from '../../src/eml/store/sqlite-graph.js';
import { HotCache } from '../../src/eml/store/hot-cache.js';
import { EventStore } from '../../src/eml/events/store.js';
import { assertGithubHost } from '../../src/eml/ingest/github.js';
import { assertGitlabHost } from '../../src/eml/ingest/gitlab.js';
import { EventValidationError } from '../../src/core/errors.js';
import type { EmlServices } from '../../src/eml/mcp/handlers.js';

const SECRET = 'super-secret-token';

function buildEml(storage: SqliteStorageProvider): EmlServices {
  const db = storage.getDatabase();
  return {
    enabled: true,
    extraction: 'fallback',
    db,
    storage,
    memoryRepo: new MemoryRepo(db),
    graph: new SqliteGraphStore(db, { cache: new HotCache(64) }),
    eventStore: new EventStore(db),
    vcs: { webhookSecret: SECRET },
    now: () => new Date(),
  };
}

async function makeServer() {
  const dir = mkdtempSync(join(tmpdir(), 'eml-wh-'));
  const dash = join(dir, 'dash');
  mkdirSync(dash, { recursive: true });
  const storage = new SqliteStorageProvider(join(dir, 'test.db'));
  await storage.initialize();
  const server = await createAPIServer({
    storage,
    graph: new CodeGraph(),
    dashboardPath: dash,
    workspaceRoot: dir,
    templatesPath: dir,
    serverHost: 'localhost',
    serverPort: 3001,
    eml: buildEml(storage),
  });
  return { dir, storage, server };
}

function ghSignature(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(Buffer.from(body)).digest('hex');
}

describe('EML webhooks', () => {
  let ctx: Awaited<ReturnType<typeof makeServer>>;

  beforeAll(async () => {
    ctx = await makeServer();
  });

  afterAll(async () => {
    await ctx.server.fastify.close();
    ctx.storage.close();
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  it('rejects GitHub webhook with missing/invalid signature (401)', async () => {
    const res = await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/webhooks/github',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('webhook_bad_signature');
  });

  it('rejects GitHub webhook with a wrong signature (401)', async () => {
    const res = await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/webhooks/github',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a correctly-signed GitHub PR webhook and enqueues an event', async () => {
    const payload = JSON.stringify({
      action: 'opened',
      repository: { full_name: 'acme/widgets' },
      pull_request: { number: 7, title: 'Add cache', body: 'because perf', html_url: 'http://x/7' },
    });
    const res = await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': ghSignature(payload),
        'x-github-event': 'pull_request',
      },
      payload,
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).accepted).toBe(1);

    const store = new EventStore(ctx.storage.getDatabase());
    expect(store.countByStatus('pending')).toBeGreaterThanOrEqual(1);
  });

  it('rejects an over-size webhook body (413)', async () => {
    const big = JSON.stringify({ repository: { full_name: 'a/b' }, blob: 'x'.repeat(1_000_050) });
    const res = await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': ghSignature(big),
        'x-github-event': 'pull_request',
      },
      payload: big,
    });
    expect(res.statusCode).toBe(413);
  });

  it('rejects GitLab webhook with wrong token (401)', async () => {
    const res = await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/webhooks/gitlab',
      headers: { 'content-type': 'application/json', 'x-gitlab-token': 'nope' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a correctly-tokened GitLab MR webhook', async () => {
    const payload = JSON.stringify({
      object_kind: 'merge_request',
      project: { path_with_namespace: 'acme/widgets' },
      object_attributes: { iid: 3, title: 'Fix', description: 'because bug', url: 'http://x/3' },
    });
    const res = await ctx.server.fastify.inject({
      method: 'POST',
      url: '/api/eml/webhooks/gitlab',
      headers: { 'content-type': 'application/json', 'x-gitlab-token': SECRET },
      payload,
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).accepted).toBe(1);
  });

  describe('SSRF host allowlist', () => {
    it('allows api.github.com and rejects others', () => {
      expect(() => assertGithubHost('https://api.github.com')).not.toThrow();
      expect(() => assertGithubHost('https://evil.example.com')).toThrow(EventValidationError);
      expect(() => assertGithubHost('http://api.github.com')).toThrow(EventValidationError);
    });

    it('allows configured GitLab host and rejects others', () => {
      expect(() => assertGitlabHost('https://gitlab.com/api/v4/projects', 'gitlab.com')).not.toThrow();
      expect(() => assertGitlabHost('https://evil.example.com', 'gitlab.com')).toThrow(EventValidationError);
      expect(() => assertGitlabHost('https://gitlab.com', 'gitlab.example.org')).toThrow(EventValidationError);
    });
  });
});
