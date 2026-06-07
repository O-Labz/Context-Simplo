import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { EventStore } from '../../src/eml/events/store.js';
import { PeopleEngine, maskEmail } from '../../src/eml/engines/people.js';
import { GitIngest } from '../../src/eml/ingest/git.js';
import type { GitDiffRunner } from '../../src/eml/ingest/diff.js';

const REPO = '0123456789abcdef';
const NUL = '\u0000';

describe('EML People + git authorship', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let db: ReturnType<SqliteStorageProvider['getDatabase']>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-people-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    db = storage.getDatabase();
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves identity by email (case-insensitive) and merges aliases', () => {
    const people = new PeopleEngine(db);
    const a = people.resolve({ displayName: 'Jane Doe', email: 'Jane@Example.com' });
    const b = people.resolve({ displayName: 'jdoe', email: 'jane@example.com' });
    expect(b.id).toBe(a.id);
    expect(b.aliases).toContain('Jane Doe');
    expect(b.aliases).toContain('jdoe');
    expect(b.emails).toEqual(['jane@example.com']);
  });

  it('resolves by alias when email is absent', () => {
    const people = new PeopleEngine(db);
    const a = people.resolve({ displayName: 'Sam Smith', email: 'sam@x.com' });
    const b = people.resolve({ displayName: 'Sam Smith' });
    expect(b.id).toBe(a.id);
  });

  it('creates distinct people for different emails', () => {
    const people = new PeopleEngine(db);
    const a = people.resolve({ displayName: 'A', email: 'a@x.com' });
    const b = people.resolve({ displayName: 'B', email: 'b@x.com' });
    expect(a.id).not.toBe(b.id);
  });

  it('maskEmail never reveals the full address', () => {
    expect(maskEmail('jane@example.com')).toBe('j***@e***');
    expect(maskEmail('jane@example.com')).not.toContain('jane');
  });

  it('records ownership signals and emits git.author.observed without raw email', async () => {
    const store = new EventStore(db);
    const ingest = new GitIngest(db, store);
    const runner: GitDiffRunner = {
      async raw(args: string[]): Promise<string> {
        if (args[0] === 'show') return `Jane Doe${NUL}jane@example.com${NUL}2026-01-02T03:04:05Z\n`;
        if (args.includes('--name-status')) return 'M\tsrc/a.ts\nA\tsrc/b.ts\nD\tsrc/c.ts\n';
        return '';
      },
    };

    const result = await ingest.observeAuthorship(runner, REPO, 'HEAD');
    expect(result?.files).toEqual(['src/a.ts', 'src/b.ts']);

    const signals = db
      .prepare('SELECT entity_type, entity_ref, signal FROM ownership_signals ORDER BY entity_ref')
      .all() as Array<{ entity_type: string; entity_ref: string; signal: string }>;
    expect(signals.find((s) => s.entity_ref === 'src/a.ts' && s.signal === 'commit')).toBeTruthy();
    expect(signals.find((s) => s.entity_type === 'repo' && s.signal === 'authorship')).toBeTruthy();
    // deleted file should not get a commit ownership signal
    expect(signals.find((s) => s.entity_ref === 'src/c.ts')).toBeFalsy();

    const eventId = store.claimBatch(10)[0]?.id;
    expect(eventId).toBeTruthy();
    const event = store.getById(eventId!)!;
    expect(event.type).toBe('git.author.observed');
    const payload = JSON.stringify(event.payload);
    expect(payload).not.toContain('jane@example.com');
    expect(event.payload.emailMasked).toBe('j***@e***');
  });
});
