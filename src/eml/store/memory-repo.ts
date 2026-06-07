/**
 * Memory repository: CRUD over `memory_objects` + `provenance`.
 *
 * Every EML module reads/writes through this repo. Confidential fields
 * (`summary`, `body`) are scrubbed of secrets before persistence. All SQL is
 * parameterized.
 */

import { randomUUID } from 'crypto';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import {
  ConcurrencyConflictError,
  MemoryNotFoundError,
  MemoryValidationError,
} from '../../core/errors.js';
import { scrubSecrets } from '../../security/scrubber.js';

export const MemoryKindSchema = z.enum(['decision', 'failure', 'intent', 'gap', 'ownership', 'note']);
export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export const MemoryObjectSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  kind: MemoryKindSchema,
  title: z.string().min(1).max(200),
  summary: z.string().max(2000).default(''),
  body: z.string().max(20000).default(''),
  repositoryId: z.string().min(1).max(128),
  confidence: z.number().min(0).max(1).optional(),
  freshness: z.number().min(0).max(1).optional(),
  contradictionScore: z.number().min(0).max(1).optional(),
  sourceCount: z.number().int().positive().optional(),
  lastVerifiedAt: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().nullable().optional(),
  supersededBy: z.string().nullable().optional(),
  embeddingId: z.string().nullable().optional(),
});

export type MemoryObjectInput = z.input<typeof MemoryObjectSchema>;

export interface MemoryObject {
  id: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  body: string;
  repositoryId: string;
  confidence: number;
  freshness: number;
  contradictionScore: number;
  sourceCount: number;
  lastVerifiedAt: string | null;
  validFrom: string;
  validTo: string | null;
  supersededBy: string | null;
  embeddingId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProvenanceInput {
  memoryId: string;
  eventId?: string | null;
  sourceType: 'diff' | 'structural_delta' | 'conversation' | 'pr' | 'issue' | 'commit_message' | 'agent';
  sourceRef: string;
  snippet?: string | null;
  weight: number;
  verifiedAgainstDiff?: boolean;
}

export interface ProvenanceRecord extends Required<Omit<ProvenanceInput, 'verifiedAgainstDiff'>> {
  id: string;
  verifiedAgainstDiff: boolean;
  createdAt: string;
}

export interface MemoryUpdate {
  title?: string;
  summary?: string;
  body?: string;
  confidence?: number;
  freshness?: number;
  contradictionScore?: number;
  sourceCount?: number;
  lastVerifiedAt?: string | null;
  validTo?: string | null;
  supersededBy?: string | null;
  embeddingId?: string | null;
}

interface MemoryRow {
  id: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  body: string;
  repository_id: string;
  confidence: number;
  freshness: number;
  contradiction_score: number;
  source_count: number;
  last_verified_at: string | null;
  valid_from: string;
  valid_to: string | null;
  superseded_by: string | null;
  embedding_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ProvenanceRow {
  id: string;
  memory_id: string;
  event_id: string | null;
  source_type: ProvenanceInput['sourceType'];
  source_ref: string;
  snippet: string | null;
  weight: number;
  verified_against_diff: number;
  created_at: string;
}

export interface MemorySearchHit extends MemoryObject {
  score: number;
}

export class MemoryRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: MemoryObjectInput): MemoryObject {
    const parsed = MemoryObjectSchema.safeParse(input);
    if (!parsed.success) {
      throw new MemoryValidationError(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        parsed.error.issues[0]?.path.join('.')
      );
    }
    const m = parsed.data;
    const id = m.id ?? `mem_${randomUUID()}`;
    const now = new Date().toISOString();
    const summary = scrubSecrets(m.summary).scrubbed;
    const body = scrubSecrets(m.body).scrubbed;

    this.db
      .prepare(
        `INSERT INTO memory_objects
          (id, kind, title, summary, body, repository_id, confidence, freshness, contradiction_score,
           source_count, last_verified_at, valid_from, valid_to, superseded_by, embedding_id, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        id,
        m.kind,
        m.title,
        summary,
        body,
        m.repositoryId,
        m.confidence ?? 0,
        m.freshness ?? 1,
        m.contradictionScore ?? 0,
        m.sourceCount ?? 1,
        m.lastVerifiedAt ?? null,
        m.validFrom ?? now,
        m.validTo ?? null,
        m.supersededBy ?? null,
        m.embeddingId ?? null,
        now,
        now
      );

    return this.getById(id);
  }

  getById(id: string): MemoryObject {
    const row = this.db.prepare('SELECT * FROM memory_objects WHERE id = ?').get(id) as MemoryRow | undefined;
    if (!row) throw new MemoryNotFoundError(id);
    return this.mapRow(row);
  }

  find(id: string): MemoryObject | null {
    const row = this.db.prepare('SELECT * FROM memory_objects WHERE id = ?').get(id) as MemoryRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  update(id: string, update: MemoryUpdate, opts: { expectedVersion?: number } = {}): MemoryObject {
    const existing = this.getById(id);
    if (opts.expectedVersion !== undefined && opts.expectedVersion !== existing.version) {
      throw new ConcurrencyConflictError(`memory ${id}`);
    }
    const fields: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => {
      fields.push(`${col} = ?`);
      params.push(val);
    };
    if (update.title !== undefined) set('title', update.title);
    if (update.summary !== undefined) set('summary', scrubSecrets(update.summary).scrubbed);
    if (update.body !== undefined) set('body', scrubSecrets(update.body).scrubbed);
    if (update.confidence !== undefined) set('confidence', update.confidence);
    if (update.freshness !== undefined) set('freshness', update.freshness);
    if (update.contradictionScore !== undefined) set('contradiction_score', update.contradictionScore);
    if (update.sourceCount !== undefined) set('source_count', update.sourceCount);
    if (update.lastVerifiedAt !== undefined) set('last_verified_at', update.lastVerifiedAt);
    if (update.validTo !== undefined) set('valid_to', update.validTo);
    if (update.supersededBy !== undefined) set('superseded_by', update.supersededBy);
    if (update.embeddingId !== undefined) set('embedding_id', update.embeddingId);

    set('version', existing.version + 1);
    set('updated_at', new Date().toISOString());

    this.db.prepare(`UPDATE memory_objects SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
    return this.getById(id);
  }

  addProvenance(input: ProvenanceInput): ProvenanceRecord {
    const id = `prov_${randomUUID()}`;
    const now = new Date().toISOString();
    const snippet = input.snippet ? scrubSecrets(input.snippet).scrubbed : null;
    this.db
      .prepare(
        `INSERT INTO provenance (id, memory_id, event_id, source_type, source_ref, snippet, weight, verified_against_diff, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.memoryId,
        input.eventId ?? null,
        input.sourceType,
        input.sourceRef,
        snippet,
        input.weight,
        input.verifiedAgainstDiff ? 1 : 0,
        now
      );
    return {
      id,
      memoryId: input.memoryId,
      eventId: input.eventId ?? null,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      snippet,
      weight: input.weight,
      verifiedAgainstDiff: input.verifiedAgainstDiff ?? false,
      createdAt: now,
    };
  }

  listProvenance(memoryId: string): ProvenanceRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM provenance WHERE memory_id = ? ORDER BY created_at ASC')
      .all(memoryId) as ProvenanceRow[];
    return rows.map((r) => ({
      id: r.id,
      memoryId: r.memory_id,
      eventId: r.event_id,
      sourceType: r.source_type,
      sourceRef: r.source_ref,
      snippet: r.snippet,
      weight: r.weight,
      verifiedAgainstDiff: r.verified_against_diff === 1,
      createdAt: r.created_at,
    }));
  }

  listByKind(kind: MemoryKind, repositoryId: string, limit = 50): MemoryObject[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM memory_objects WHERE kind = ? AND repository_id = ? AND superseded_by IS NULL
         ORDER BY updated_at DESC LIMIT ?`
      )
      .all(kind, repositoryId, limit) as MemoryRow[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * BM25 full-text search over title/summary/body via the FTS5 index.
   */
  searchFts(query: string, repositoryId: string, limit = 20): MemorySearchHit[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const escaped = `"${trimmed.replace(/"/g, '""')}"`;
    const rows = this.db
      .prepare(
        `SELECT m.*, fts.rank AS rank
         FROM eml_memory_fts fts
         JOIN memory_objects m ON m.rowid = fts.rowid
         WHERE eml_memory_fts MATCH ? AND m.repository_id = ? AND m.superseded_by IS NULL
         ORDER BY fts.rank
         LIMIT ?`
      )
      .all(escaped, repositoryId, limit) as Array<MemoryRow & { rank: number }>;
    return rows.map((r) => ({ ...this.mapRow(r), score: 1.0 / (1.0 + Math.abs(r.rank)) }));
  }

  private mapRow(row: MemoryRow): MemoryObject {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      body: row.body,
      repositoryId: row.repository_id,
      confidence: row.confidence,
      freshness: row.freshness,
      contradictionScore: row.contradiction_score,
      sourceCount: row.source_count,
      lastVerifiedAt: row.last_verified_at,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      supersededBy: row.superseded_by,
      embeddingId: row.embedding_id,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
