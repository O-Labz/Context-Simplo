/**
 * Knowledge Gap Detection.
 *
 * Combines code complexity, weak ownership, missing documentation/discussion,
 * and churn into a single risk score so teams can find under-owned,
 * hard-to-understand hotspots. All weights live in `RISK_WEIGHTS`.
 */

import type Database from 'better-sqlite3';
import type { OwnershipEngine } from './ownership.js';

export const RISK_WEIGHTS = {
  complexity: 0.4,
  ownership: 0.3,
  docs: 0.2,
  churn: 0.1,
} as const;

const COMPLEXITY_NORM = 20;
const CHURN_NORM = 20;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface GapInputMetrics {
  /** Raw cyclomatic complexity (>= 1). */
  complexity: number;
  /** 0..1 ownership strength (1 = strongly owned). */
  ownershipStrength: number;
  /** Whether docs/discussion are missing for the entity. */
  missingDocs: boolean;
  /** Raw churn (signal/commit count). */
  churn: number;
}

/** Pure risk score in [0,1]. Higher = riskier knowledge gap. */
export function scoreGap(m: GapInputMetrics): number {
  const complexityNorm = clamp01(m.complexity / COMPLEXITY_NORM);
  const churnNorm = clamp01(m.churn / CHURN_NORM);
  const w = RISK_WEIGHTS;
  return clamp01(
    w.complexity * complexityNorm +
      w.ownership * (1 - clamp01(m.ownershipStrength)) +
      w.docs * (m.missingDocs ? 1 : 0) +
      w.churn * churnNorm
  );
}

export interface KnowledgeGap extends GapInputMetrics {
  repositoryId: string;
  entityRef: string;
  entityType: string;
  riskScore: number;
  reasons: string[];
}

interface SignalAgg {
  entity_ref: string;
  entity_type: string;
  churn: number;
}

export class GapsEngine {
  private readonly db: Database.Database;
  private readonly ownership?: OwnershipEngine;
  private readonly complexityOf: (entityRef: string) => number;

  constructor(
    db: Database.Database,
    opts: { ownership?: OwnershipEngine; complexityOf?: (entityRef: string) => number } = {}
  ) {
    this.db = db;
    this.ownership = opts.ownership;
    this.complexityOf = opts.complexityOf ?? ((ref) => this.complexityFromGraph(ref));
  }

  /** Read a precomputed complexity from a graph node's props, if present. */
  private complexityFromGraph(entityRef: string): number {
    const row = this.db
      .prepare('SELECT props_json FROM graph_nodes WHERE ref = ? LIMIT 1')
      .get(entityRef) as { props_json: string } | undefined;
    if (!row) return 1;
    try {
      const props = JSON.parse(row.props_json) as { complexity?: number };
      return typeof props.complexity === 'number' ? props.complexity : 1;
    } catch {
      return 1;
    }
  }

  private ownershipStrengthOf(entityRef: string): number {
    if (!this.ownership) return 0;
    const owners = this.ownership.rankOwners(entityRef, { limit: 1 });
    const top = owners[0];
    if (!top) return 0;
    // Map an unbounded score into [0,1): strong ownership saturates toward 1.
    return 1 - 1 / (1 + top.score);
  }

  private hasDocs(entityRef: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS hit FROM entity_links WHERE target_ref = ? LIMIT 1')
      .get(entityRef) as { hit: number } | undefined;
    return Boolean(row);
  }

  /**
   * Rank knowledge gaps for a repository. Candidates are entities that have any
   * ownership signal; metrics are blended into a risk score.
   */
  findKnowledgeGaps(repositoryId: string, opts: { limit?: number } = {}): KnowledgeGap[] {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const rows = this.db
      .prepare(
        `SELECT entity_ref, entity_type, COUNT(*) AS churn
         FROM ownership_signals
         WHERE entity_type IN ('file','symbol','service')
         GROUP BY entity_ref, entity_type`
      )
      .all() as SignalAgg[];

    const gaps: KnowledgeGap[] = rows.map((row) => {
      const complexity = this.complexityOf(row.entity_ref);
      const ownershipStrength = this.ownershipStrengthOf(row.entity_ref);
      const missingDocs = !this.hasDocs(row.entity_ref);
      const metrics: GapInputMetrics = { complexity, ownershipStrength, missingDocs, churn: row.churn };
      const reasons: string[] = [];
      if (complexity >= COMPLEXITY_NORM / 2) reasons.push('high complexity');
      if (ownershipStrength < 0.4) reasons.push('weak ownership');
      if (missingDocs) reasons.push('no documented decisions');
      if (row.churn >= CHURN_NORM / 2) reasons.push('high churn');
      return {
        repositoryId,
        entityRef: row.entity_ref,
        entityType: row.entity_type,
        ...metrics,
        riskScore: scoreGap(metrics),
        reasons,
      };
    });

    gaps.sort((a, b) => b.riskScore - a.riskScore || a.entityRef.localeCompare(b.entityRef));
    return gaps.slice(0, limit);
  }
}
