/**
 * Contradiction engine.
 *
 * Detects when two memories make opposing claims about the same subject (e.g.
 * "Added dependency X" vs "Removed dependency X"). On detection it records a
 * `contradictions` row, draws a `CONTRADICTS` graph edge, raises both memories'
 * contradiction score (and lowers confidence), and emits a WARN-level
 * `contradiction.detected` event. It never throws — detection is background.
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { GraphStore } from '../store/graph-store.js';
import type { EventStore } from '../events/store.js';
import type { MemoryObject, MemoryRepo } from '../store/memory-repo.js';

const POSITIVE = /\b(add|added|adds|use|uses|adopt|adopted|introduce[ds]?|enable[ds]?|keep|prefer)\b/;
const NEGATIVE =
  /\b(remove[ds]?|delete[ds]?|not|no|never|avoid|deprecat\w*|reject\w*|drop(?:ped|s)?|disable[ds]?|don't|abandon\w*)\b/;
const POLARITY_WORDS =
  /\b(add|added|adds|use|uses|adopt|adopted|introduce[ds]?|enable[ds]?|keep|prefer|remove[ds]?|delete[ds]?|not|no|never|avoid|deprecat\w*|reject\w*|drop(?:ped|s)?|disable[ds]?|don't|abandon\w*)\b/g;

export type Polarity = 'positive' | 'negative' | 'neutral';

export function polarityOf(text: string): Polarity {
  const lower = text.toLowerCase();
  const pos = POSITIVE.test(lower);
  const neg = NEGATIVE.test(lower);
  if (pos && !neg) return 'positive';
  if (neg && !pos) return 'negative';
  return 'neutral';
}

/** Normalize a claim to its subject by stripping polarity words and noise. */
export function subjectOf(text: string): string {
  return text
    .toLowerCase()
    .replace(POLARITY_WORDS, ' ')
    .replace(/[^a-z0-9\s._/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function opposite(a: Polarity, b: Polarity): boolean {
  return (a === 'positive' && b === 'negative') || (a === 'negative' && b === 'positive');
}

export interface ContradictionRecord {
  id: string;
  memoryA: string;
  memoryB: string;
  kind: string;
  detectedAt: string;
}

const SCORE_BUMP = 0.3;
const CONFIDENCE_DECAY = 0.7;

export class ContradictionEngine {
  private readonly db: Database.Database;
  private readonly graph: GraphStore;
  private readonly repo: MemoryRepo;
  private readonly eventStore?: EventStore;
  private readonly now: () => Date;

  constructor(
    db: Database.Database,
    graph: GraphStore,
    repo: MemoryRepo,
    opts: { eventStore?: EventStore; now?: () => Date } = {}
  ) {
    this.db = db;
    this.graph = graph;
    this.repo = repo;
    this.eventStore = opts.eventStore;
    this.now = opts.now ?? ((): Date => new Date());
  }

  /**
   * Detect contradictions for a memory against its same-kind siblings. Records
   * any found and returns them. Never throws.
   */
  detectForMemory(memory: MemoryObject): ContradictionRecord[] {
    const polarity = polarityOf(`${memory.title} ${memory.summary}`);
    if (polarity === 'neutral') return [];
    const subject = subjectOf(memory.title);
    if (!subject) return [];

    const found: ContradictionRecord[] = [];
    const siblings = this.repo.listByKind(memory.kind, memory.repositoryId, 500);
    for (const other of siblings) {
      if (other.id === memory.id) continue;
      const otherPolarity = polarityOf(`${other.title} ${other.summary}`);
      if (!opposite(polarity, otherPolarity)) continue;
      if (subjectOf(other.title) !== subject) continue;
      const record = this.record(memory, other, 'claim_polarity');
      if (record) found.push(record);
    }
    return found;
  }

  /** Manually flag a contradiction between two memories. */
  flag(memoryAId: string, memoryBId: string, kind = 'manual'): ContradictionRecord | null {
    const a = this.repo.find(memoryAId);
    const b = this.repo.find(memoryBId);
    if (!a || !b) return null;
    return this.record(a, b, kind);
  }

  private record(a: MemoryObject, b: MemoryObject, kind: string): ContradictionRecord | null {
    // Canonical ordering so the pair is stored once regardless of direction.
    const [memoryA, memoryB] = a.id < b.id ? [a, b] : [b, a];
    const existing = this.db
      .prepare('SELECT id FROM contradictions WHERE memory_a = ? AND memory_b = ?')
      .get(memoryA.id, memoryB.id) as { id: string } | undefined;
    if (existing) return null;

    const id = `contra_${randomUUID()}`;
    const detectedAt = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO contradictions (id, memory_a, memory_b, kind, detected_at, resolution, resolved_by)
         VALUES (?, ?, ?, ?, ?, NULL, NULL)`
      )
      .run(id, memoryA.id, memoryB.id, kind, detectedAt);

    this.graph.addNode({ id: memoryA.id, label: 'memory', ref: memoryA.id, repositoryId: memoryA.repositoryId });
    this.graph.addNode({ id: memoryB.id, label: 'memory', ref: memoryB.id, repositoryId: memoryB.repositoryId });
    // A contradiction is symmetric: store both directed edges so neighbor
    // queries surface the relationship regardless of traversal direction.
    this.graph.addEdge({
      src: memoryA.id,
      dst: memoryB.id,
      label: 'CONTRADICTS',
      repositoryId: memoryA.repositoryId,
      weight: 1,
    });
    this.graph.addEdge({
      src: memoryB.id,
      dst: memoryA.id,
      label: 'CONTRADICTS',
      repositoryId: memoryB.repositoryId,
      weight: 1,
    });

    for (const m of [memoryA, memoryB]) {
      this.repo.update(m.id, {
        contradictionScore: Math.min(1, m.contradictionScore + SCORE_BUMP),
        confidence: Math.max(0, m.confidence * CONFIDENCE_DECAY),
      });
    }

    if (this.eventStore) {
      this.eventStore.append({
        type: 'contradiction.detected',
        source: 'engine',
        sourceRef: id,
        repositoryId: memoryA.repositoryId,
        payload: { contradictionId: id, memoryA: memoryA.id, memoryB: memoryB.id, kind, severity: 'warn' },
      });
    }

    return { id, memoryA: memoryA.id, memoryB: memoryB.id, kind, detectedAt };
  }
}
