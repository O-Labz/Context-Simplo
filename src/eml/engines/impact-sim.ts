/**
 * Impact Simulation Engine.
 *
 * Predicts the blast radius of a structural change (delete, rename,
 * interface-removal, dependency-removal) by traversing the dependency graph,
 * gathering owners to notify, and flagging rule violations the change would
 * introduce.
 */

import type Database from 'better-sqlite3';
import type { OwnershipEngine } from './ownership.js';
import type { DriftEngine, DriftViolation } from './drift.js';
import { ImpactTargetNotFoundError } from '../../core/errors.js';

export type ImpactOp = 'delete' | 'rename' | 'interface-removal' | 'dependency-removal';

const MAX_DEPTH = 6;
const MAX_AFFECTED = 500;

/** Ops whose blast radius propagates transitively vs. only to direct dependents. */
const TRANSITIVE_OPS: ReadonlySet<ImpactOp> = new Set<ImpactOp>(['delete', 'interface-removal']);

export interface ImpactInput {
  repositoryId: string;
  op: ImpactOp;
  targetRef: string;
  /** New ref for rename ops; used to detect naming violations introduced. */
  newRef?: string;
}

export interface AffectedEntity {
  ref: string;
  label: string;
  depth: number;
}

export interface OwnerToNotify {
  personId: string;
  displayName: string;
  score: number;
}

export interface ImpactResult {
  target: { ref: string; label: string };
  op: ImpactOp;
  affected: AffectedEntity[];
  ownersToNotify: OwnerToNotify[];
  violationsIntroduced: DriftViolation[];
  summary: string;
}

export class ImpactSimEngine {
  private readonly db: Database.Database;
  private readonly ownership?: OwnershipEngine;
  private readonly drift?: DriftEngine;

  constructor(db: Database.Database, opts: { ownership?: OwnershipEngine; drift?: DriftEngine } = {}) {
    this.db = db;
    this.ownership = opts.ownership;
    this.drift = opts.drift;
  }

  simulate(input: ImpactInput): ImpactResult {
    const node = this.db
      .prepare('SELECT id, label, ref FROM graph_nodes WHERE repository_id = ? AND ref = ? LIMIT 1')
      .get(input.repositoryId, input.targetRef) as { id: string; label: string; ref: string } | undefined;
    if (!node) throw new ImpactTargetNotFoundError(input.targetRef);

    const transitive = TRANSITIVE_OPS.has(input.op);
    const affected = this.findDependents(input.repositoryId, node.id, transitive);

    const ownersToNotify = this.gatherOwners([input.targetRef, ...affected.map((a) => a.ref)]);
    const violationsIntroduced = this.violationsFor(input, affected);

    return {
      target: { ref: node.ref, label: node.label },
      op: input.op,
      affected,
      ownersToNotify,
      violationsIntroduced,
      summary: this.describe(input, affected, ownersToNotify, violationsIntroduced),
    };
  }

  private findDependents(repositoryId: string, targetId: string, transitive: boolean): AffectedEntity[] {
    const maxDepth = transitive ? MAX_DEPTH : 1;
    const rows = this.db
      .prepare(
        `WITH RECURSIVE up(id, depth) AS (
           SELECT src, 1 FROM graph_edges
             WHERE dst = @target AND repository_id = @repo AND valid_to IS NULL
           UNION
           SELECT e.src, up.depth + 1 FROM graph_edges e
             JOIN up ON e.dst = up.id
             WHERE e.repository_id = @repo AND e.valid_to IS NULL AND up.depth < @maxDepth
         )
         SELECT n.ref AS ref, n.label AS label, MIN(up.depth) AS depth
         FROM up JOIN graph_nodes n ON n.id = up.id
         WHERE n.id != @target
         GROUP BY n.id
         ORDER BY depth ASC, n.ref ASC
         LIMIT @limit`
      )
      .all({ target: targetId, repo: repositoryId, maxDepth, limit: MAX_AFFECTED }) as AffectedEntity[];
    return rows;
  }

  private gatherOwners(refs: string[]): OwnerToNotify[] {
    if (!this.ownership) return [];
    const byPerson = new Map<string, OwnerToNotify>();
    for (const ref of refs) {
      for (const owner of this.ownership.rankOwners(ref, { limit: 5 })) {
        const existing = byPerson.get(owner.personId);
        if (!existing || owner.score > existing.score) {
          byPerson.set(owner.personId, {
            personId: owner.personId,
            displayName: owner.displayName,
            score: owner.score,
          });
        }
      }
    }
    return [...byPerson.values()].sort((a, b) => b.score - a.score).slice(0, 10);
  }

  private violationsFor(input: ImpactInput, affected: AffectedEntity[]): DriftViolation[] {
    const out: DriftViolation[] = [];

    // A rename can introduce naming violations if the new ref breaks a rule.
    if (input.op === 'rename' && input.newRef) {
      const namingRules = this.db
        .prepare(
          `SELECT id, spec FROM architecture_rules WHERE repository_id = ? AND rule_type = 'naming'`
        )
        .all(input.repositoryId) as Array<{ id: string; spec: string }>;
      for (const rule of namingRules) {
        try {
          const spec = JSON.parse(rule.spec) as { label?: string; pattern: string };
          if (!new RegExp(spec.pattern).test(input.newRef)) {
            out.push({
              ruleId: rule.id,
              ruleType: 'naming',
              fromRef: input.newRef,
              explanation: `Rename to "${input.newRef}" would violate naming rule /${spec.pattern}/.`,
            });
          }
        } catch {
          // ignore malformed rule
        }
      }
    }

    // Surface any current drift involving the target or affected entities,
    // which the change is likely to interact with.
    if (this.drift) {
      const touched = new Set<string>([input.targetRef, ...affected.map((a) => a.ref)]);
      for (const v of this.drift.detectDrift(input.repositoryId)) {
        if (touched.has(v.fromRef) || (v.toRef && touched.has(v.toRef))) {
          out.push(v);
        }
      }
    }

    return out;
  }

  private describe(
    input: ImpactInput,
    affected: AffectedEntity[],
    owners: OwnerToNotify[],
    violations: DriftViolation[]
  ): string {
    return (
      `${input.op} of "${input.targetRef}" affects ${affected.length} entit${affected.length === 1 ? 'y' : 'ies'}, ` +
      `${owners.length} owner(s) to notify, ${violations.length} rule violation(s) implicated.`
    );
  }
}
