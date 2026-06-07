/**
 * Knowledge Freshness engine.
 *
 * Owns the scoring lifecycle for memories: confidence (how much to trust),
 * freshness (recency decay), and source-count reinforcement. Verification and
 * reinforcement bump the relevant fields; a batch job periodically recomputes
 * decay and emits `score.recomputed`. The clock is injected for determinism.
 */

import type { MemoryObject, MemoryRepo } from '../store/memory-repo.js';
import type { EventStore } from '../events/store.js';

export const FRESHNESS_HALF_LIFE_DAYS = 180;
const MS_PER_DAY = 86_400_000;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Recency decay in [0,1] based on the most recent verification/creation. */
export function freshnessOf(referenceTs: string | null | undefined, now: Date): number {
  if (!referenceTs) return 0.5;
  const then = Date.parse(referenceTs);
  if (Number.isNaN(then)) return 0.5;
  const ageDays = Math.max(0, (now.getTime() - then) / MS_PER_DAY);
  return clamp01(Math.pow(0.5, ageDays / FRESHNESS_HALF_LIFE_DAYS));
}

/**
 * Confidence blends source volume, contradiction penalty, and recency. Pure
 * and deterministic given the memory + clock.
 */
export function confidenceOf(memory: MemoryObject, now: Date): number {
  const sourceFactor = 1 - 1 / (1 + Math.max(0, memory.sourceCount));
  const contradictionPenalty = 1 - clamp01(memory.contradictionScore);
  const recency = freshnessOf(memory.lastVerifiedAt ?? memory.validFrom, now);
  return clamp01(sourceFactor * contradictionPenalty * (0.5 + 0.5 * recency));
}

export interface FreshnessEngineOptions {
  eventStore?: EventStore;
  now?: () => Date;
}

export class FreshnessEngine {
  private readonly repo: MemoryRepo;
  private readonly eventStore?: EventStore;
  private readonly now: () => Date;

  constructor(repo: MemoryRepo, opts: FreshnessEngineOptions = {}) {
    this.repo = repo;
    this.eventStore = opts.eventStore;
    this.now = opts.now ?? ((): Date => new Date());
  }

  /** Mark a memory as verified now: refresh recency and recompute confidence. */
  verify(memoryId: string): MemoryObject {
    const now = this.now();
    const existing = this.repo.getById(memoryId);
    const updated: MemoryObject = {
      ...existing,
      lastVerifiedAt: now.toISOString(),
      freshness: 1,
    };
    return this.repo.update(memoryId, {
      lastVerifiedAt: now.toISOString(),
      freshness: 1,
      confidence: confidenceOf(updated, now),
    });
  }

  /** Reinforce a memory: bump source count + refresh + recompute confidence. */
  reinforce(memoryId: string): MemoryObject {
    const now = this.now();
    const existing = this.repo.getById(memoryId);
    const nextSourceCount = existing.sourceCount + 1;
    const projected: MemoryObject = {
      ...existing,
      sourceCount: nextSourceCount,
      lastVerifiedAt: now.toISOString(),
      freshness: 1,
    };
    return this.repo.update(memoryId, {
      sourceCount: nextSourceCount,
      lastVerifiedAt: now.toISOString(),
      freshness: 1,
      confidence: confidenceOf(projected, now),
    });
  }

  /**
   * Recompute freshness + confidence for all live memories in a repository.
   * Emits `score.recomputed`. Returns the number updated.
   */
  recomputeRepository(repositoryId: string): number {
    const now = this.now();
    const kinds = ['decision', 'failure', 'intent', 'gap', 'ownership', 'note'] as const;
    let updated = 0;
    for (const kind of kinds) {
      for (const memory of this.repo.listByKind(kind, repositoryId, 1000)) {
        const freshness = freshnessOf(memory.lastVerifiedAt ?? memory.validFrom, now);
        const confidence = confidenceOf({ ...memory, freshness }, now);
        this.repo.update(memory.id, { freshness, confidence });
        updated++;
      }
    }
    if (this.eventStore) {
      this.eventStore.append({
        type: 'score.recomputed',
        source: 'engine',
        sourceRef: `freshness:${repositoryId}`,
        repositoryId,
        payload: { updated, at: now.toISOString() },
      });
    }
    return updated;
  }
}

/**
 * Bounded interval runner for the batch recompute. Clock + interval injected;
 * never overlaps runs.
 */
export class FreshnessRunner {
  private readonly engine: FreshnessEngine;
  private readonly intervalMs: number;
  private readonly repositories: () => string[];
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(engine: FreshnessEngine, opts: { intervalMs: number; repositories: () => string[] }) {
    this.engine = engine;
    this.intervalMs = Math.max(1000, opts.intervalMs);
    this.repositories = opts.repositories;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  tick(): void {
    if (this.running) return;
    this.running = true;
    try {
      for (const repo of this.repositories()) {
        this.engine.recomputeRepository(repo);
      }
    } finally {
      this.running = false;
    }
  }
}
