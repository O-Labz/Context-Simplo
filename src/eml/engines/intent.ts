/**
 * Intent Tracking engine.
 *
 * Intents are memories of kind 'intent' with a structured `intents` side-row
 * (goal/category/priority/status/target). Active intents feed the retrieval
 * ranker's goal bias so memories advancing current goals surface higher.
 */

import type Database from 'better-sqlite3';
import type { MemoryObject, MemoryRepo } from '../store/memory-repo.js';
import { goalBiasFor, type ActiveGoal } from '../retrieval/rank.js';

export type IntentStatus = 'active' | 'achieved' | 'abandoned';

export interface TrackIntentInput {
  repositoryId: string;
  goal: string;
  category: string;
  priority: number;
  targetDate?: string | null;
}

export interface IntentRecord {
  memoryId: string;
  goal: string;
  category: string;
  status: IntentStatus;
  priority: number;
  targetDate: string | null;
}

interface IntentRow {
  memory_id: string;
  goal: string;
  category: string;
  status: IntentStatus;
  priority: number;
  target_date: string | null;
}

export class IntentEngine {
  private readonly db: Database.Database;
  private readonly repo: MemoryRepo;

  constructor(db: Database.Database, repo: MemoryRepo) {
    this.db = db;
    this.repo = repo;
  }

  /** Create an active intent (memory + intents row). */
  track(input: TrackIntentInput): { memory: MemoryObject; intent: IntentRecord } {
    const priority = Math.max(1, Math.min(5, Math.round(input.priority)));
    const memory = this.repo.create({
      kind: 'intent',
      title: input.goal,
      summary: `${input.category}: ${input.goal}`,
      repositoryId: input.repositoryId,
      confidence: 0.6,
    });
    this.db
      .prepare(
        `INSERT INTO intents (memory_id, goal, category, status, priority, target_date)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .run(memory.id, input.goal, input.category, priority, input.targetDate ?? null);

    return {
      memory,
      intent: {
        memoryId: memory.id,
        goal: input.goal,
        category: input.category,
        status: 'active',
        priority,
        targetDate: input.targetDate ?? null,
      },
    };
  }

  get(memoryId: string): IntentRecord | null {
    const row = this.db.prepare('SELECT * FROM intents WHERE memory_id = ?').get(memoryId) as
      | IntentRow
      | undefined;
    return row ? this.mapRow(row) : null;
  }

  setStatus(memoryId: string, status: IntentStatus): void {
    this.db.prepare('UPDATE intents SET status = ? WHERE memory_id = ?').run(status, memoryId);
  }

  /** Active intents for a repository, highest priority first. */
  listActive(repositoryId: string, limit = 50): IntentRecord[] {
    const rows = this.db
      .prepare(
        `SELECT i.* FROM intents i
         JOIN memory_objects m ON m.id = i.memory_id
         WHERE i.status = 'active' AND m.repository_id = ? AND m.superseded_by IS NULL
         ORDER BY i.priority DESC, m.created_at DESC
         LIMIT ?`
      )
      .all(repositoryId, limit) as IntentRow[];
    return rows.map((r) => this.mapRow(r));
  }

  private activeGoals(repositoryId: string): ActiveGoal[] {
    return this.listActive(repositoryId).map((i) => ({ text: i.goal, priority: i.priority }));
  }

  /** Goal bias for the ranker: how strongly a memory advances active goals. */
  goalBiasOf(memory: MemoryObject): number {
    if (memory.kind === 'intent') return 0; // don't self-bias intents
    return goalBiasFor(memory, this.activeGoals(memory.repositoryId));
  }

  private mapRow(row: IntentRow): IntentRecord {
    return {
      memoryId: row.memory_id,
      goal: row.goal,
      category: row.category,
      status: row.status,
      priority: row.priority,
      targetDate: row.target_date,
    };
  }
}
