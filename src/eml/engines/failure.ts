/**
 * Failure Memory engine.
 *
 * Owns the `failures` side-table (memory kind = 'failure'). Captures what was
 * tried and why it failed so future agents can answer "have we tried this?".
 * Similarity is delegated to the retrieval layer (vector + BM25); this engine
 * only persists/reads the structured failure fields.
 */

import type Database from 'better-sqlite3';
import type { MemoryObject, MemoryRepo } from '../store/memory-repo.js';

export type FailureType = 'failed_impl' | 'abandoned_migration' | 'rejected_tech' | 'pitfall' | 'incident';

const FAILURE_TYPES: readonly FailureType[] = [
  'failed_impl',
  'abandoned_migration',
  'rejected_tech',
  'pitfall',
  'incident',
];

export interface FailureInput {
  memoryId: string;
  failureType?: FailureType;
  whatFailed: string;
  whyFailed: string;
  lessons?: string[];
  rootCause?: string | null;
  incidentRef?: string | null;
}

export interface FailureRecord {
  memoryId: string;
  failureType: FailureType;
  whatFailed: string;
  whyFailed: string;
  lessons: string[];
  rootCause: string | null;
  incidentRef: string | null;
}

export interface FailureWithMemory extends FailureRecord {
  memory: MemoryObject;
  score?: number;
}

interface FailureRow {
  memory_id: string;
  failure_type: FailureType;
  what_failed: string;
  why_failed: string;
  lessons: string;
  root_cause: string | null;
  incident_ref: string | null;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function normalizeType(value: FailureType | undefined): FailureType {
  return value && FAILURE_TYPES.includes(value) ? value : 'failed_impl';
}

export class FailureEngine {
  private readonly db: Database.Database;

  constructor(db: Database.Database, _repo?: MemoryRepo) {
    this.db = db;
  }

  upsert(input: FailureInput): FailureRecord {
    const record: FailureRecord = {
      memoryId: input.memoryId,
      failureType: normalizeType(input.failureType),
      whatFailed: input.whatFailed,
      whyFailed: input.whyFailed,
      lessons: input.lessons ?? [],
      rootCause: input.rootCause ?? null,
      incidentRef: input.incidentRef ?? null,
    };
    this.db
      .prepare(
        `INSERT INTO failures
           (memory_id, failure_type, what_failed, why_failed, lessons, root_cause, incident_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(memory_id) DO UPDATE SET
           failure_type = excluded.failure_type,
           what_failed = excluded.what_failed,
           why_failed = excluded.why_failed,
           lessons = excluded.lessons,
           root_cause = excluded.root_cause,
           incident_ref = excluded.incident_ref`
      )
      .run(
        record.memoryId,
        record.failureType,
        record.whatFailed,
        record.whyFailed,
        JSON.stringify(record.lessons),
        record.rootCause,
        record.incidentRef
      );
    return record;
  }

  get(memoryId: string): FailureRecord | null {
    const row = this.db.prepare('SELECT * FROM failures WHERE memory_id = ?').get(memoryId) as
      | FailureRow
      | undefined;
    return row ? this.mapRow(row) : null;
  }

  /** Derive a failure row from a generic failure memory (extraction/assert path). */
  fromMemory(memory: MemoryObject, extras: Partial<FailureInput> = {}): FailureRecord {
    return this.upsert({
      memoryId: memory.id,
      failureType: extras.failureType,
      whatFailed: extras.whatFailed ?? memory.title,
      whyFailed: extras.whyFailed ?? memory.summary ?? memory.body ?? '',
      lessons: extras.lessons,
      rootCause: extras.rootCause ?? null,
      incidentRef: extras.incidentRef ?? null,
    });
  }

  private mapRow(row: FailureRow): FailureRecord {
    return {
      memoryId: row.memory_id,
      failureType: row.failure_type,
      whatFailed: row.what_failed,
      whyFailed: row.why_failed,
      lessons: parseJsonArray(row.lessons),
      rootCause: row.root_cause,
      incidentRef: row.incident_ref,
    };
  }
}
