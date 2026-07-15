/**
 * Durable event store over `eml_events`.
 *
 * Responsibilities:
 * - append: validate + dedup by content_hash (idempotent ingestion)
 * - claimBatch: atomically move pending rows to processing
 * - markDone/markError: terminal/retry transitions
 * - requeueStale: re-claim crashed `processing` rows on boot
 *
 * Security: all SQL is parameterized (prepared statements). Payloads are
 * validated by Zod before persistence.
 */

import { createHash, randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { EventValidationError } from '../../core/errors.js';
import {
  EmlEventInputSchema,
  type EmlEvent,
  type EmlEventInput,
  type EmlEventStatus,
} from './types.js';

export interface AppendResult {
  id: string;
  deduped: boolean;
}

export interface MarkErrorResult {
  attempts: number;
  status: EmlEventStatus;
}

interface EmlEventRow {
  id: string;
  type: string;
  source: string;
  source_ref: string;
  repository_id: string;
  actor: string | null;
  payload: string;
  content_hash: string;
  occurred_at: string;
  ingested_at: string;
  processed_at: string | null;
  status: EmlEventStatus;
  attempts: number;
  last_error: string | null;
}

/**
 * Canonical JSON used for content hashing. Keys are sorted recursively so the
 * same logical event always produces the same hash regardless of key order.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function computeContentHash(input: Pick<EmlEventInput, 'type' | 'sourceRef' | 'payload'>): string {
  const canonical = JSON.stringify(canonicalize({
    type: input.type,
    sourceRef: input.sourceRef,
    payload: input.payload,
  }));
  return createHash('sha256').update(canonical).digest('hex');
}

export class EventStore {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Append an event. Idempotent: a duplicate content_hash is ignored and the
   * existing event id is returned with `deduped: true`.
   */
  append(input: EmlEventInput): AppendResult {
    const parsed = EmlEventInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new EventValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }

    const event = parsed.data;
    const contentHash = computeContentHash(event);
    const id = `evt_${randomUUID()}`;
    const occurredAt = event.occurredAt ?? new Date().toISOString();

    const info = this.db
      .prepare(
        `INSERT INTO eml_events (id, type, source, source_ref, repository_id, actor, payload, content_hash, occurred_at, status, attempts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)
         ON CONFLICT(content_hash) DO NOTHING`
      )
      .run(
        id,
        event.type,
        event.source,
        event.sourceRef,
        event.repositoryId,
        event.actor ?? null,
        JSON.stringify(event.payload),
        contentHash,
        occurredAt
      );

    if (info.changes === 0) {
      const existing = this.db
        .prepare('SELECT id FROM eml_events WHERE content_hash = ?')
        .get(contentHash) as { id: string } | undefined;
      return { id: existing?.id ?? id, deduped: true };
    }

    return { id, deduped: false };
  }

  /**
   * Claim up to `limit` pending events, transitioning them to `processing`
   * atomically so concurrent workers never claim the same row.
   */
  claimBatch(limit: number): EmlEvent[] {
    if (limit <= 0) return [];
    const claim = this.db.transaction((max: number) => {
      const rows = this.db
        .prepare(
          `SELECT id FROM eml_events WHERE status = 'pending'
           ORDER BY occurred_at ASC, ingested_at ASC LIMIT ?`
        )
        .all(max) as Array<{ id: string }>;

      if (rows.length === 0) return [] as EmlEvent[];

      const update = this.db.prepare(
        `UPDATE eml_events SET status = 'processing' WHERE id = ? AND status = 'pending'`
      );
      const claimed: EmlEvent[] = [];
      for (const { id } of rows) {
        const res = update.run(id);
        if (res.changes === 1) {
          const full = this.getById(id);
          if (full) claimed.push(full);
        }
      }
      return claimed;
    });
    return claim(limit);
  }

  markDone(id: string): void {
    this.db
      .prepare(`UPDATE eml_events SET status = 'done', processed_at = datetime('now'), last_error = NULL WHERE id = ?`)
      .run(id);
  }

  /**
   * Record a terminal processing failure after the bus exhausted its in-memory
   * retries. Increments attempts and marks the row `error`. Operators (or a boot
   * requeue) can move it back to `pending` to retry.
   */
  markError(id: string, error: string): MarkErrorResult {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(`UPDATE eml_events SET attempts = attempts + 1, last_error = ?, status = 'error' WHERE id = ?`)
        .run(error.slice(0, 2000), id);
      const row = this.db.prepare('SELECT attempts FROM eml_events WHERE id = ?').get(id) as
        | { attempts: number }
        | undefined;
      return { attempts: row?.attempts ?? 1, status: 'error' as EmlEventStatus };
    });
    return tx();
  }

  /**
   * Move all `error` events back to `pending` so they can be retried.
   */
  requeueErrors(): number {
    const res = this.db.prepare(`UPDATE eml_events SET status = 'pending' WHERE status = 'error'`).run();
    return res.changes;
  }

  /**
   * Reset events stuck in `processing` (e.g. after a crash) back to `pending`
   * so they can be re-claimed. Returns the number requeued.
   */
  requeueStale(): number {
    const res = this.db.prepare(`UPDATE eml_events SET status = 'pending' WHERE status = 'processing'`).run();
    return res.changes;
  }

  countByStatus(status: EmlEventStatus): number {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM eml_events WHERE status = ?').get(status) as {
      c: number;
    };
    return row.c;
  }

  getById(id: string): EmlEvent | null {
    const row = this.db.prepare('SELECT * FROM eml_events WHERE id = ?').get(id) as EmlEventRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  private mapRow(row: EmlEventRow): EmlEvent {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    return {
      id: row.id,
      type: row.type as EmlEvent['type'],
      source: row.source as EmlEvent['source'],
      sourceRef: row.source_ref,
      repositoryId: row.repository_id,
      actor: row.actor,
      payload,
      contentHash: row.content_hash,
      occurredAt: row.occurred_at,
      ingestedAt: row.ingested_at,
      processedAt: row.processed_at,
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error,
    };
  }
}
