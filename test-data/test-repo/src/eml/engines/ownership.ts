/**
 * Ownership graph engine.
 *
 * Turns `ownership_signals` into ranked owners and projects OWNS/KNOWS edges
 * into the EML graph. Ranking blends signal volume with recency decay so the
 * person who touched something most (and most recently) ranks highest.
 */

import type Database from 'better-sqlite3';
import type { GraphStore } from '../store/graph-store.js';
import type { EventStore } from '../events/store.js';
import { PeopleEngine } from './people.js';

const RECENCY_HALF_LIFE_DAYS = 90;
const PROXIMITY_FACTOR = 0.5;
const MS_PER_DAY = 86_400_000;

export interface OwnerRank {
  personId: string;
  displayName: string;
  score: number;
  signalCount: number;
  lastActivityAt: string;
}

interface SignalRow {
  person_id: string;
  signal: string;
  weight: number;
  last_activity_at: string;
}

function recencyDecay(lastActivityAt: string, now: Date): number {
  const then = Date.parse(lastActivityAt);
  if (Number.isNaN(then)) return 0.5;
  const ageDays = Math.max(0, (now.getTime() - then) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

export class OwnershipEngine {
  private readonly db: Database.Database;
  private readonly graph: GraphStore;
  private readonly people: PeopleEngine;
  private readonly eventStore?: EventStore;
  private readonly now: () => Date;

  constructor(
    db: Database.Database,
    graph: GraphStore,
    opts: { people?: PeopleEngine; eventStore?: EventStore; now?: () => Date } = {}
  ) {
    this.db = db;
    this.graph = graph;
    this.people = opts.people ?? new PeopleEngine(db);
    this.eventStore = opts.eventStore;
    this.now = opts.now ?? ((): Date => new Date());
  }

  /**
   * Ranked owners for an entity ref. Optionally blends signals from graph
   * neighbors (proximity) at a reduced weight.
   */
  rankOwners(entityRef: string, opts: { limit?: number; useGraphProximity?: boolean } = {}): OwnerRank[] {
    const now = this.now();
    const acc = new Map<string, { score: number; signalCount: number; lastActivityAt: string }>();

    this.accumulate(entityRef, 1, now, acc);

    if (opts.useGraphProximity) {
      const node = this.graph.getNode(entityRef);
      if (node) {
        for (const neighbor of this.graph.neighbors(entityRef)) {
          this.accumulate(neighbor.ref, PROXIMITY_FACTOR, now, acc);
        }
      }
    }

    const ranks: OwnerRank[] = [];
    for (const [personId, agg] of acc) {
      const person = this.people.get(personId);
      ranks.push({
        personId,
        displayName: person?.displayName ?? personId,
        score: agg.score,
        signalCount: agg.signalCount,
        lastActivityAt: agg.lastActivityAt,
      });
    }
    ranks.sort((a, b) => (b.score - a.score) || a.personId.localeCompare(b.personId));
    return ranks.slice(0, opts.limit ?? 10);
  }

  private accumulate(
    entityRef: string,
    factor: number,
    now: Date,
    acc: Map<string, { score: number; signalCount: number; lastActivityAt: string }>
  ): void {
    const rows = this.db
      .prepare('SELECT person_id, signal, weight, last_activity_at FROM ownership_signals WHERE entity_ref = ?')
      .all(entityRef) as SignalRow[];
    for (const row of rows) {
      const contribution = row.weight * recencyDecay(row.last_activity_at, now) * factor;
      const existing = acc.get(row.person_id);
      if (existing) {
        existing.score += contribution;
        existing.signalCount += 1;
        if (row.last_activity_at > existing.lastActivityAt) existing.lastActivityAt = row.last_activity_at;
      } else {
        acc.set(row.person_id, {
          score: contribution,
          signalCount: 1,
          lastActivityAt: row.last_activity_at,
        });
      }
    }
  }

  /**
   * Project OWNS/KNOWS edges into the graph from current signals and emit
   * `ownership.recomputed`. Returns counts for observability.
   */
  recompute(repositoryId: string): { owners: number; edges: number } {
    const rows = this.db
      .prepare(
        `SELECT person_id, entity_type, entity_ref, weight, last_activity_at
         FROM ownership_signals`
      )
      .all() as Array<{
      person_id: string;
      entity_type: string;
      entity_ref: string;
      weight: number;
      last_activity_at: string;
    }>;

    const now = this.now();
    const ownerScore = new Map<string, number>(); // key person|entity
    const entityOwners = new Map<string, Set<string>>();
    const personSet = new Set<string>();

    for (const r of rows) {
      const key = `${r.person_id}\u0000${r.entity_ref}`;
      ownerScore.set(key, (ownerScore.get(key) ?? 0) + r.weight * recencyDecay(r.last_activity_at, now));
      personSet.add(r.person_id);
      if (!entityOwners.has(r.entity_ref)) entityOwners.set(r.entity_ref, new Set());
      entityOwners.get(r.entity_ref)!.add(r.person_id);
    }

    let edges = 0;
    for (const [key, score] of ownerScore) {
      const [personId, entityRef] = key.split('\u0000');
      if (!personId || !entityRef) continue;
      this.graph.addNode({ id: personId, label: 'person', ref: personId, repositoryId });
      this.graph.addNode({ id: entityRef, label: 'entity', ref: entityRef, repositoryId });
      this.graph.addEdge({ src: personId, dst: entityRef, label: 'OWNS', repositoryId, weight: score });
      edges++;
    }

    // KNOWS edges between co-owners of the same entity.
    for (const owners of entityOwners.values()) {
      const list = Array.from(owners);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const b = list[j]!;
          this.graph.addEdge({ src: a, dst: b, label: 'KNOWS', repositoryId, weight: 1 });
          edges++;
        }
      }
    }

    if (this.eventStore) {
      this.eventStore.append({
        type: 'ownership.recomputed',
        source: 'engine',
        sourceRef: `ownership:${repositoryId}`,
        repositoryId,
        payload: { owners: personSet.size, edges },
      });
    }

    return { owners: personSet.size, edges };
  }
}
