/**
 * Decision Timeline engine.
 *
 * Assembles a chronological "how did we get here" view for a topic or entity by
 * merging decision memories, failure memories, and observed diffs
 * (`code.diff.observed`), ordered by occurrence and paginated.
 */

import type Database from 'better-sqlite3';
import type { MemoryRepo, MemoryObject } from '../store/memory-repo.js';

export const TIMELINE_DEFAULT_LIMIT = 50;
export const TIMELINE_MAX_LIMIT = 200;

export interface TimelineEntry {
  kind: 'decision' | 'failure' | 'diff';
  id: string;
  title: string;
  occurredAt: string;
  details?: Record<string, unknown>;
}

export interface TimelineQuery {
  repositoryId: string;
  entityRef?: string;
  topic?: string;
  limit?: number;
  offset?: number;
}

export class TimelineEngine {
  private readonly db: Database.Database;
  private readonly repo: MemoryRepo;

  constructor(db: Database.Database, repo: MemoryRepo) {
    this.db = db;
    this.repo = repo;
  }

  showEvolution(query: TimelineQuery): { entries: TimelineEntry[]; total: number } {
    const limit = Math.min(Math.max(query.limit ?? TIMELINE_DEFAULT_LIMIT, 1), TIMELINE_MAX_LIMIT);
    const offset = Math.max(query.offset ?? 0, 0);

    const memories = this.collectMemories(query);
    const entries: TimelineEntry[] = [];

    for (const m of memories) {
      if (m.kind !== 'decision' && m.kind !== 'failure') continue;
      entries.push({
        kind: m.kind,
        id: m.id,
        title: m.title,
        occurredAt: m.validFrom ?? m.createdAt,
        details: { confidence: m.confidence, summary: m.summary },
      });
    }

    for (const diff of this.collectDiffs(query)) {
      entries.push(diff);
    }

    entries.sort((a, b) => {
      if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const total = entries.length;
    return { entries: entries.slice(offset, offset + limit), total };
  }

  private collectMemories(query: TimelineQuery): MemoryObject[] {
    if (query.entityRef) {
      const rows = this.db
        .prepare(
          `SELECT DISTINCT m.id FROM entity_links el
           JOIN memory_objects m ON m.id = el.memory_id
           WHERE el.target_ref = ? AND m.repository_id = ? AND m.superseded_by IS NULL
             AND m.kind IN ('decision','failure')`
        )
        .all(query.entityRef, query.repositoryId) as Array<{ id: string }>;
      return rows.map((r) => this.repo.find(r.id)).filter((m): m is MemoryObject => m !== null);
    }
    if (query.topic && query.topic.trim()) {
      return this.repo
        .searchFts(query.topic, query.repositoryId, 200)
        .filter((m) => m.kind === 'decision' || m.kind === 'failure');
    }
    return [
      ...this.repo.listByKind('decision', query.repositoryId, 200),
      ...this.repo.listByKind('failure', query.repositoryId, 200),
    ];
  }

  private collectDiffs(query: TimelineQuery): TimelineEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, payload, occurred_at FROM eml_events
         WHERE repository_id = ? AND type = 'code.diff.observed'
         ORDER BY occurred_at ASC
         LIMIT 1000`
      )
      .all(query.repositoryId) as Array<{ id: string; payload: string; occurred_at: string }>;

    const entries: TimelineEntry[] = [];
    for (const row of rows) {
      if (query.entityRef && !row.payload.includes(query.entityRef)) continue;
      let summary = 'diff observed';
      try {
        const payload = JSON.parse(row.payload) as { from?: string; to?: string };
        if (payload.from && payload.to) summary = `diff ${payload.from}..${payload.to}`;
      } catch {
        // keep default summary
      }
      entries.push({ kind: 'diff', id: row.id, title: summary, occurredAt: row.occurred_at });
    }
    return entries;
  }
}
