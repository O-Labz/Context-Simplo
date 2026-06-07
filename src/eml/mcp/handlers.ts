/**
 * EML MCP/REST handlers + the shared `EmlServices` container.
 *
 * Handlers are transport-agnostic: they validate input (Zod), enforce the
 * `EML_ENABLED` flag, and either return plain data or throw an `EmlError`
 * subclass. MCP and REST surfaces translate those errors to their own codes.
 *
 * The `EmlServices` interface is the single dependency bundle threaded through
 * every EML surface. Later phases extend it with engine instances.
 */

import { randomUUID } from 'crypto';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { StorageProvider } from '../../store/provider.js';
import type { EmlExtractionMode } from '../../core/types.js';
import { DuplicateMemoryError, EmlDisabledError, MemoryValidationError } from '../../core/errors.js';
import {
  MemoryRememberInputSchema,
  MemoryRecallInputSchema,
  MemorySearchInputSchema,
} from '../../mcp/tools.js';
import type { MemoryObject, MemoryRepo } from '../store/memory-repo.js';
import type { MemoryVectorStore } from '../store/memory-vectors.js';
import type { GraphStore } from '../store/graph-store.js';
import type { EventStore } from '../events/store.js';
import type { EventBus } from '../events/bus.js';
import { gatherCandidates, type QueryEmbedder } from '../retrieval/candidates.js';
import { rankMemories, type RankOptions } from '../retrieval/rank.js';

export interface EmlServices {
  enabled: boolean;
  extraction: EmlExtractionMode;
  db: Database.Database;
  storage: StorageProvider;
  memoryRepo: MemoryRepo;
  memoryVectors?: MemoryVectorStore;
  graph: GraphStore;
  eventStore: EventStore;
  eventBus?: EventBus;
  embedQuery?: QueryEmbedder;
  now: () => Date;
  /** Returns a 0..1 goal bias for a memory (wired by the intent engine). */
  goalBiasOf?: (memory: MemoryObject) => number;
}

function requireEnabled(eml: EmlServices): void {
  if (!eml.enabled) throw new EmlDisabledError();
}

function validationFrom(error: z.ZodError): MemoryValidationError {
  return new MemoryValidationError(
    error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    error.issues[0]?.path.join('.')
  );
}

/** Compact-friendly memory shape returned by recall/search. */
export function toMemoryView(memory: MemoryObject, score?: number): Record<string, unknown> {
  return {
    id: memory.id,
    kind: memory.kind,
    title: memory.title,
    summary: memory.summary,
    confidence: memory.confidence,
    freshness: memory.freshness,
    contradictionScore: memory.contradictionScore,
    sourceCount: memory.sourceCount,
    ...(score !== undefined ? { score } : {}),
  };
}

export interface MemoryRememberResult {
  id: string;
}

export async function memoryRemember(args: unknown, eml: EmlServices): Promise<MemoryRememberResult> {
  requireEnabled(eml);
  const parsed = MemoryRememberInputSchema.safeParse(args);
  if (!parsed.success) throw validationFrom(parsed.error);
  const input = parsed.data;

  // Idempotency: reuse of a key surfaces as a conflict.
  if (input.idempotencyKey) {
    const existing = eml.db
      .prepare(`SELECT id FROM eml_events WHERE type = 'memory.asserted' AND source_ref = ? LIMIT 1`)
      .get(input.idempotencyKey) as { id: string } | undefined;
    if (existing) throw new DuplicateMemoryError(input.idempotencyKey);
  }

  const memory = eml.memoryRepo.create({
    kind: input.kind,
    title: input.title,
    summary: input.summary ?? '',
    body: input.body ?? '',
    repositoryId: input.repositoryId,
    confidence: 0.5,
  });

  eml.memoryRepo.addProvenance({
    memoryId: memory.id,
    sourceType: 'agent',
    sourceRef: input.idempotencyKey ?? `agent:${memory.id}`,
    weight: 1,
  });

  // Link entities (entity_links) when provided.
  if (input.entityRefs && input.entityRefs.length > 0) {
    const stmt = eml.db.prepare(
      `INSERT OR IGNORE INTO entity_links (memory_id, target_kind, target_ref) VALUES (?, ?, ?)`
    );
    for (const e of input.entityRefs) stmt.run(memory.id, e.kind, e.ref);
  }

  // Append the audit/source event (drives extraction reinforcement downstream).
  eml.eventStore.append({
    type: 'memory.asserted',
    source: 'agent',
    sourceRef: input.idempotencyKey ?? memory.id,
    repositoryId: input.repositoryId,
    payload: { memoryId: memory.id, kind: input.kind, title: input.title },
    occurredAt: eml.now().toISOString(),
  });

  // Best-effort embedding (degrades to no-op without a provider).
  if (eml.embedQuery && eml.memoryVectors) {
    try {
      const text = [memory.title, memory.summary, memory.body].filter(Boolean).join('\n');
      const vector = await eml.embedQuery(text);
      if (vector && vector.length > 0) {
        const embeddingId = `emb_${randomUUID()}`;
        await eml.memoryVectors.upsert([
          { id: embeddingId, memoryId: memory.id, repositoryId: memory.repositoryId, kind: memory.kind, vector },
        ]);
        eml.memoryRepo.update(memory.id, { embeddingId });
      }
    } catch {
      // embedding is best-effort; never block the write
    }
  }

  return { id: memory.id };
}

export interface MemoryRecallResult {
  memory: Record<string, unknown> | null;
  provenance?: unknown[];
  results?: Record<string, unknown>[];
}

export function memoryRecall(args: unknown, eml: EmlServices): MemoryRecallResult {
  requireEnabled(eml);
  const parsed = MemoryRecallInputSchema.safeParse(args);
  if (!parsed.success) throw validationFrom(parsed.error);
  const input = parsed.data;

  if (input.id) {
    const memory = eml.memoryRepo.find(input.id);
    if (!memory || memory.repositoryId !== input.repositoryId) {
      return { memory: null };
    }
    return {
      memory: { ...toMemoryView(memory), body: memory.body },
      provenance: eml.memoryRepo.listProvenance(memory.id),
    };
  }

  if (input.entityRef) {
    const rows = eml.db
      .prepare(
        `SELECT m.id FROM entity_links el
         JOIN memory_objects m ON m.id = el.memory_id
         WHERE el.target_ref = ? AND m.repository_id = ? AND m.superseded_by IS NULL
         LIMIT ?`
      )
      .all(input.entityRef, input.repositoryId, input.limit) as Array<{ id: string }>;
    const results = rows
      .map((r) => eml.memoryRepo.find(r.id))
      .filter((m): m is MemoryObject => m !== null)
      .map((m) => toMemoryView(m));
    return { memory: null, results };
  }

  return { memory: null, results: [] };
}

export interface MemorySearchResult {
  results: Record<string, unknown>[];
}

export async function memorySearch(args: unknown, eml: EmlServices): Promise<MemorySearchResult> {
  requireEnabled(eml);
  const parsed = MemorySearchInputSchema.safeParse(args);
  if (!parsed.success) throw validationFrom(parsed.error);
  const input = parsed.data;

  const candidates = await gatherCandidates({
    query: input.query,
    repositoryId: input.repositoryId,
    limit: input.limit,
    repo: eml.memoryRepo,
    vectors: eml.memoryVectors,
    embedQuery: eml.embedQuery,
    graph: eml.graph,
  });

  const memories = candidates.ids
    .map((id) => eml.memoryRepo.find(id))
    .filter((m): m is MemoryObject => m !== null)
    .filter((m) => (input.kind ? m.kind === input.kind : true));

  const rankOpts: RankOptions = eml.goalBiasOf ? { goalBiasOf: eml.goalBiasOf } : {};
  const ranked = rankMemories(memories, candidates.lists, eml.now(), rankOpts);
  return {
    results: ranked.slice(0, input.limit).map((r) => toMemoryView(r.memory, r.score)),
  };
}
