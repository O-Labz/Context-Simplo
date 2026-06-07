/**
 * Architectural Decision Memory engine.
 *
 * Owns the `decisions` side-table that hangs off `memory_objects` (kind =
 * 'decision'). Stores structured rationale/alternatives/tradeoffs and answers
 * "why was this chosen?" queries by topic or linked entity.
 *
 * Search semantics: an empty result is a valid 200 (empty list), never a 404.
 */

import type Database from 'better-sqlite3';
import type { MemoryObject, MemoryRepo } from '../store/memory-repo.js';

export interface DecisionInput {
  memoryId: string;
  decision: string;
  rationale: string;
  alternatives?: string[];
  tradeoffs?: string[];
  decisionDate?: string;
  author?: string | null;
  affectedSystems?: string[];
  status?: string;
}

export interface DecisionRecord {
  memoryId: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  tradeoffs: string[];
  decisionDate: string;
  author: string | null;
  affectedSystems: string[];
  status: string;
}

export interface DecisionWithMemory extends DecisionRecord {
  memory: MemoryObject;
}

interface DecisionRow {
  memory_id: string;
  decision: string;
  rationale: string;
  alternatives: string;
  tradeoffs: string;
  decision_date: string;
  author: string | null;
  affected_systems: string;
  status: string;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export class DecisionEngine {
  private readonly db: Database.Database;
  private readonly repo: MemoryRepo;
  private readonly now: () => Date;

  constructor(db: Database.Database, repo: MemoryRepo, now: () => Date = () => new Date()) {
    this.db = db;
    this.repo = repo;
    this.now = now;
  }

  /** Idempotent upsert of the decision side-record for a memory. */
  upsert(input: DecisionInput): DecisionRecord {
    const record: DecisionRecord = {
      memoryId: input.memoryId,
      decision: input.decision,
      rationale: input.rationale,
      alternatives: input.alternatives ?? [],
      tradeoffs: input.tradeoffs ?? [],
      decisionDate: input.decisionDate ?? this.now().toISOString(),
      author: input.author ?? null,
      affectedSystems: input.affectedSystems ?? [],
      status: input.status ?? 'active',
    };
    this.db
      .prepare(
        `INSERT INTO decisions
           (memory_id, decision, rationale, alternatives, tradeoffs, decision_date, author, affected_systems, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(memory_id) DO UPDATE SET
           decision = excluded.decision,
           rationale = excluded.rationale,
           alternatives = excluded.alternatives,
           tradeoffs = excluded.tradeoffs,
           decision_date = excluded.decision_date,
           author = excluded.author,
           affected_systems = excluded.affected_systems,
           status = excluded.status`
      )
      .run(
        record.memoryId,
        record.decision,
        record.rationale,
        JSON.stringify(record.alternatives),
        JSON.stringify(record.tradeoffs),
        record.decisionDate,
        record.author,
        JSON.stringify(record.affectedSystems),
        record.status
      );
    return record;
  }

  get(memoryId: string): DecisionRecord | null {
    const row = this.db.prepare('SELECT * FROM decisions WHERE memory_id = ?').get(memoryId) as
      | DecisionRow
      | undefined;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Persist a decision row derived from a generic decision memory. Used by the
   * extraction resolver and the agent-assert path when no structured fields
   * are supplied.
   */
  fromMemory(memory: MemoryObject, extras: Partial<DecisionInput> = {}): DecisionRecord {
    return this.upsert({
      memoryId: memory.id,
      decision: extras.decision ?? memory.title,
      rationale: extras.rationale ?? memory.summary ?? memory.body ?? memory.title,
      alternatives: extras.alternatives,
      tradeoffs: extras.tradeoffs,
      decisionDate: extras.decisionDate ?? memory.validFrom,
      author: extras.author ?? null,
      affectedSystems: extras.affectedSystems,
      status: extras.status,
    });
  }

  /**
   * Answer "why was this chosen?" Returns decisions ranked by the underlying
   * memory's confidence×freshness, scoped to a repository, matched either by a
   * linked entity ref or by full-text topic search. Empty list is valid.
   */
  whyWasThisChosen(params: {
    repositoryId: string;
    topic?: string;
    entityRef?: string;
    limit?: number;
  }): DecisionWithMemory[] {
    const limit = params.limit ?? 10;
    const memories = this.candidateMemories(params);
    const out: DecisionWithMemory[] = [];
    for (const memory of memories) {
      const record = this.get(memory.id);
      if (record) out.push({ ...record, memory });
    }
    out.sort((a, b) => b.memory.confidence * b.memory.freshness - a.memory.confidence * a.memory.freshness);
    return out.slice(0, limit);
  }

  private candidateMemories(params: {
    repositoryId: string;
    topic?: string;
    entityRef?: string;
  }): MemoryObject[] {
    if (params.entityRef) {
      const rows = this.db
        .prepare(
          `SELECT m.id FROM entity_links el
           JOIN memory_objects m ON m.id = el.memory_id
           WHERE el.target_ref = ? AND m.kind = 'decision'
             AND m.repository_id = ? AND m.superseded_by IS NULL
           LIMIT 100`
        )
        .all(params.entityRef, params.repositoryId) as Array<{ id: string }>;
      return rows.map((r) => this.repo.find(r.id)).filter((m): m is MemoryObject => m !== null);
    }
    if (params.topic && params.topic.trim()) {
      return this.repo.searchFts(params.topic, params.repositoryId, 50).filter((m) => m.kind === 'decision');
    }
    return this.repo.listByKind('decision', params.repositoryId, 50);
  }

  private mapRow(row: DecisionRow): DecisionRecord {
    return {
      memoryId: row.memory_id,
      decision: row.decision,
      rationale: row.rationale,
      alternatives: parseJsonArray(row.alternatives),
      tradeoffs: parseJsonArray(row.tradeoffs),
      decisionDate: row.decision_date,
      author: row.author,
      affectedSystems: parseJsonArray(row.affected_systems),
      status: row.status,
    };
  }
}
