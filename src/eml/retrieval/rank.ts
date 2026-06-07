/**
 * Memory ranking: Reciprocal Rank Fusion (RRF) over candidate lists, then a
 * scored rerank that blends relevance, confidence, freshness, contradiction,
 * corroboration (source_count) and active-goal bias.
 *
 * All weights live in the single `RANK_WEIGHTS` constant. The clock is injected
 * (`now`) so ranking is fully deterministic and testable.
 */

import type { MemoryObject, MemoryKind } from '../store/memory-repo.js';

export const RRF_K = 60;

export const RANK_WEIGHTS = {
  relevance: 1.0,
  confidence: 0.5,
  freshness: 0.5,
  contradiction: 0.7,
  sourceCount: 0.2,
  goal: 0.6,
} as const;

/** Per-kind time-decay rate (per day). Larger = decays faster. */
export const LAMBDA: Record<MemoryKind, number> = {
  decision: 0.002,
  failure: 0.001,
  intent: 0.02,
  gap: 0.01,
  ownership: 0.005,
  note: 0.01,
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface CandidateList {
  source: 'vector' | 'bm25' | 'graph';
  memoryIds: string[];
}

export interface RankOptions {
  /** Returns a 0..1 bias for memories that advance an active goal. */
  goalBiasOf?: (memory: MemoryObject) => number;
}

export interface ActiveGoal {
  text: string;
  /** 1..5; higher priority goals confer a stronger bias. */
  priority: number;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
  );
}

/**
 * Bias in [0,1] reflecting how strongly a memory advances any active goal.
 * Computed as priority-weighted Jaccard token overlap; returns the strongest
 * match across goals.
 */
export function goalBiasFor(memory: MemoryObject, goals: ActiveGoal[]): number {
  if (goals.length === 0) return 0;
  const memTokens = tokenize(`${memory.title} ${memory.summary}`);
  if (memTokens.size === 0) return 0;
  let best = 0;
  for (const goal of goals) {
    const goalTokens = tokenize(goal.text);
    if (goalTokens.size === 0) continue;
    let shared = 0;
    for (const t of goalTokens) if (memTokens.has(t)) shared++;
    const overlap = shared / goalTokens.size;
    const priorityWeight = Math.max(0.2, Math.min(1, goal.priority / 5));
    best = Math.max(best, overlap * priorityWeight);
  }
  return Math.max(0, Math.min(1, best));
}

export interface RankedMemory {
  memory: MemoryObject;
  score: number;
  relevance: number;
}

/**
 * Dynamic freshness in [0,1] from age since last verification (or validity
 * start), using a per-kind exponential decay. `now` is injected.
 */
export function freshnessOf(memory: MemoryObject, now: Date): number {
  const anchorIso = memory.lastVerifiedAt ?? memory.validFrom ?? memory.createdAt;
  const anchor = new Date(anchorIso).getTime();
  const ageDays = Math.max(0, (now.getTime() - anchor) / MS_PER_DAY);
  const lambda = LAMBDA[memory.kind] ?? 0.01;
  return Math.exp(-lambda * ageDays);
}

/**
 * Fuse candidate lists into a single relevance score per memory id via RRF.
 */
export function fuseRRF(lists: CandidateList[]): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of lists) {
    list.memoryIds.forEach((id, index) => {
      const contribution = 1 / (RRF_K + index + 1);
      fused.set(id, (fused.get(id) ?? 0) + contribution);
    });
  }
  return fused;
}

/**
 * Score a single memory given its fused relevance.
 */
export function scoreMemory(
  memory: MemoryObject,
  relevance: number,
  now: Date,
  options: RankOptions = {}
): number {
  const w = RANK_WEIGHTS;
  const freshness = freshnessOf(memory, now);
  const sourceCountNorm = 1 - 1 / (1 + Math.max(0, memory.sourceCount));
  const goalBias = options.goalBiasOf ? options.goalBiasOf(memory) : 0;
  return (
    w.relevance * relevance +
    w.confidence * memory.confidence +
    w.freshness * freshness -
    w.contradiction * memory.contradictionScore +
    w.sourceCount * sourceCountNorm +
    w.goal * goalBias
  );
}

/**
 * Rank a set of candidate memories deterministically. Ties break by descending
 * relevance then ascending id so identical inputs always yield identical order.
 */
export function rankMemories(
  memories: MemoryObject[],
  lists: CandidateList[],
  now: Date,
  options: RankOptions = {}
): RankedMemory[] {
  const fused = fuseRRF(lists);
  const ranked = memories.map((memory) => {
    const relevance = fused.get(memory.id) ?? 0;
    return { memory, relevance, score: scoreMemory(memory, relevance, now, options) };
  });
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return a.memory.id < b.memory.id ? -1 : a.memory.id > b.memory.id ? 1 : 0;
  });
  return ranked;
}
