import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { IntentEngine } from '../../src/eml/engines/intent.js';
import { rankMemories, goalBiasFor, type CandidateList } from '../../src/eml/retrieval/rank.js';

const REPO = '0123456789abcdef';

describe('EML Intent engine', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let repo: MemoryRepo;
  let intents: IntentEngine;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-intent-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    repo = new MemoryRepo(storage.getDatabase());
    intents = new IntentEngine(storage.getDatabase(), repo);
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('tracks an active intent and lists it', () => {
    const { memory, intent } = intents.track({
      repositoryId: REPO,
      goal: 'improve query performance',
      category: 'perf',
      priority: 5,
    });
    expect(intent.status).toBe('active');
    expect(intent.priority).toBe(5);
    const active = intents.listActive(REPO);
    expect(active.map((i) => i.memoryId)).toContain(memory.id);
  });

  it('abandoned intents drop out of the active list', () => {
    const { memory } = intents.track({ repositoryId: REPO, goal: 'migrate to esm', category: 'refactor', priority: 2 });
    intents.setStatus(memory.id, 'abandoned');
    expect(intents.listActive(REPO)).toHaveLength(0);
  });

  it('goalBiasFor rewards token overlap weighted by priority', () => {
    const m = repo.create({
      kind: 'decision',
      title: 'Optimize query performance with index',
      summary: 'add db index',
      repositoryId: REPO,
    });
    const high = goalBiasFor(m, [{ text: 'improve query performance', priority: 5 }]);
    const low = goalBiasFor(m, [{ text: 'improve query performance', priority: 1 }]);
    const none = goalBiasFor(m, [{ text: 'unrelated documentation work', priority: 5 }]);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(none);
    expect(none).toBe(0);
  });

  it('intent goal bias changes ranking order', () => {
    intents.track({ repositoryId: REPO, goal: 'improve query performance', category: 'perf', priority: 5 });

    const onGoal = repo.create({
      kind: 'decision',
      title: 'Improve query performance via caching',
      summary: 'cache hot queries',
      repositoryId: REPO,
      confidence: 0.5,
    });
    const offGoal = repo.create({
      kind: 'decision',
      title: 'Rename internal helper functions',
      summary: 'cosmetic refactor',
      repositoryId: REPO,
      confidence: 0.5,
    });

    const memories = [offGoal, onGoal];
    const lists: CandidateList[] = [{ source: 'bm25', memoryIds: [onGoal.id, offGoal.id] }];
    const now = new Date();

    const biased = rankMemories(memories, lists, now, { goalBiasOf: (m) => intents.goalBiasOf(m) });
    expect(biased[0].memory.id).toBe(onGoal.id);
  });

  it('intents do not self-bias', () => {
    const { memory } = intents.track({ repositoryId: REPO, goal: 'improve query performance', category: 'perf', priority: 5 });
    const full = repo.getById(memory.id);
    expect(intents.goalBiasOf(full)).toBe(0);
  });
});
