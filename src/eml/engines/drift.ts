/**
 * Architecture Drift Engine.
 *
 * Stores declared `architecture_rules` and evaluates them against the actual
 * dependency edges in the graph to surface drift: forbidden dependencies,
 * layering violations, allowed-dependency breaches, and naming violations.
 */

import { randomUUID } from 'crypto';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { EventStore } from '../events/store.js';
import { ArchitectureRuleValidationError } from '../../core/errors.js';

const RepositoryIdSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/, 'repositoryId must be a 16-character hex string');

export const RuleTypeSchema = z.enum(['layer', 'allowed_dep', 'forbidden_dep', 'naming']);
export type RuleType = z.infer<typeof RuleTypeSchema>;

/** Per-rule-type spec schemas. Validated explicitly so we can map to a 400. */
const DepSpecSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
const LayerSpecSchema = z.object({
  // Ordered top -> bottom; a layer may depend on layers at or below itself.
  layers: z.array(z.object({ name: z.string().min(1), match: z.string().min(1) })).min(2),
});
const NamingSpecSchema = z.object({
  label: z.string().min(1).optional(),
  pattern: z.string().min(1),
});

export const ArchitectureRuleSchema = z.object({
  repositoryId: RepositoryIdSchema,
  ruleType: RuleTypeSchema,
  spec: z.unknown(),
  source: z.enum(['declared', 'inferred']).default('declared'),
});
export type ArchitectureRuleInput = z.infer<typeof ArchitectureRuleSchema>;

export interface ArchitectureRuleRecord {
  id: string;
  repositoryId: string;
  ruleType: RuleType;
  spec: unknown;
  source: 'declared' | 'inferred';
  createdAt: string;
}

export interface DriftViolation {
  ruleId: string;
  ruleType: RuleType;
  fromRef: string;
  toRef?: string;
  explanation: string;
}

interface EdgeRow {
  id: string;
  label: string;
  srcRef: string;
  dstRef: string;
}

interface NodeRow {
  ref: string;
  label: string;
}

/** Compile a glob-ish matcher: `*` is a wildcard, otherwise substring match. */
function matcher(pattern: string): (value: string) => boolean {
  if (/[*?[\]]/.test(pattern)) {
    const re = new RegExp(
      '^' + pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return (v) => re.test(v);
  }
  return (v) => v.includes(pattern);
}

/** Validate and normalize a rule spec for its type, or throw a 400. */
export function validateSpec(ruleType: RuleType, spec: unknown): unknown {
  try {
    switch (ruleType) {
      case 'forbidden_dep':
      case 'allowed_dep':
        return DepSpecSchema.parse(spec);
      case 'layer':
        return LayerSpecSchema.parse(spec);
      case 'naming':
        return NamingSpecSchema.parse(spec);
      default:
        throw new Error(`unknown rule type: ${ruleType as string}`);
    }
  } catch (error) {
    throw new ArchitectureRuleValidationError((error as Error).message, error as Error);
  }
}

export class DriftEngine {
  private readonly db: Database.Database;
  private readonly eventStore?: EventStore;

  constructor(db: Database.Database, opts: { eventStore?: EventStore } = {}) {
    this.db = db;
    this.eventStore = opts.eventStore;
  }

  addRule(input: ArchitectureRuleInput): ArchitectureRuleRecord {
    const parsed = ArchitectureRuleSchema.parse(input);
    const normalizedSpec = validateSpec(parsed.ruleType, parsed.spec);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO architecture_rules (id, repository_id, rule_type, spec, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, parsed.repositoryId, parsed.ruleType, JSON.stringify(normalizedSpec), parsed.source, createdAt);
    return {
      id,
      repositoryId: parsed.repositoryId,
      ruleType: parsed.ruleType,
      spec: normalizedSpec,
      source: parsed.source,
      createdAt,
    };
  }

  listRules(repositoryId: string): ArchitectureRuleRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, repository_id, rule_type, spec, source, created_at
         FROM architecture_rules WHERE repository_id = ? ORDER BY created_at ASC`
      )
      .all(repositoryId) as Array<{
      id: string;
      repository_id: string;
      rule_type: RuleType;
      spec: string;
      source: 'declared' | 'inferred';
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      repositoryId: r.repository_id,
      ruleType: r.rule_type,
      spec: this.safeParse(r.spec),
      source: r.source,
      createdAt: r.created_at,
    }));
  }

  private safeParse(json: string): unknown {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }

  private dependencyEdges(repositoryId: string): EdgeRow[] {
    return this.db
      .prepare(
        `SELECT e.id AS id, e.label AS label, ns.ref AS srcRef, nd.ref AS dstRef
         FROM graph_edges e
         JOIN graph_nodes ns ON ns.id = e.src
         JOIN graph_nodes nd ON nd.id = e.dst
         WHERE e.repository_id = ? AND (e.valid_to IS NULL)`
      )
      .all(repositoryId) as EdgeRow[];
  }

  private nodes(repositoryId: string): NodeRow[] {
    return this.db
      .prepare('SELECT ref, label FROM graph_nodes WHERE repository_id = ?')
      .all(repositoryId) as NodeRow[];
  }

  /** Evaluate all rules; return violations with explanations. */
  detectDrift(repositoryId: string): DriftViolation[] {
    const rules = this.listRules(repositoryId);
    if (rules.length === 0) return [];
    const edges = this.dependencyEdges(repositoryId);
    const violations: DriftViolation[] = [];

    for (const rule of rules) {
      switch (rule.ruleType) {
        case 'forbidden_dep':
          violations.push(...this.evalForbidden(rule, edges));
          break;
        case 'allowed_dep':
          violations.push(...this.evalAllowed(rule, edges));
          break;
        case 'layer':
          violations.push(...this.evalLayer(rule, edges));
          break;
        case 'naming':
          violations.push(...this.evalNaming(rule, repositoryId));
          break;
      }
    }

    if (violations.length > 0 && this.eventStore) {
      this.eventStore.append({
        type: 'drift.violation_detected',
        source: 'engine',
        sourceRef: repositoryId,
        repositoryId,
        payload: { count: violations.length, severity: 'warn', violations: violations.slice(0, 50) },
      });
    }

    return violations;
  }

  private evalForbidden(rule: ArchitectureRuleRecord, edges: EdgeRow[]): DriftViolation[] {
    const spec = rule.spec as { from: string; to: string };
    const matchFrom = matcher(spec.from);
    const matchTo = matcher(spec.to);
    const out: DriftViolation[] = [];
    for (const e of edges) {
      if (matchFrom(e.srcRef) && matchTo(e.dstRef)) {
        out.push({
          ruleId: rule.id,
          ruleType: rule.ruleType,
          fromRef: e.srcRef,
          toRef: e.dstRef,
          explanation: `Forbidden dependency: "${e.srcRef}" must not depend on "${e.dstRef}" (matches ${spec.from} -> ${spec.to}).`,
        });
      }
    }
    return out;
  }

  private evalAllowed(rule: ArchitectureRuleRecord, edges: EdgeRow[]): DriftViolation[] {
    const spec = rule.spec as { from: string; to: string };
    const matchFrom = matcher(spec.from);
    const matchTo = matcher(spec.to);
    const out: DriftViolation[] = [];
    for (const e of edges) {
      if (matchFrom(e.srcRef) && !matchTo(e.dstRef) && e.srcRef !== e.dstRef) {
        out.push({
          ruleId: rule.id,
          ruleType: rule.ruleType,
          fromRef: e.srcRef,
          toRef: e.dstRef,
          explanation: `Disallowed dependency: "${e.srcRef}" may only depend on "${spec.to}", but depends on "${e.dstRef}".`,
        });
      }
    }
    return out;
  }

  private evalLayer(rule: ArchitectureRuleRecord, edges: EdgeRow[]): DriftViolation[] {
    const spec = rule.spec as { layers: Array<{ name: string; match: string }> };
    const compiled = spec.layers.map((l) => ({ ...l, test: matcher(l.match) }));
    const layerOf = (ref: string): number => compiled.findIndex((l) => l.test(ref));
    const out: DriftViolation[] = [];
    for (const e of edges) {
      const srcIdx = layerOf(e.srcRef);
      const dstIdx = layerOf(e.dstRef);
      if (srcIdx === -1 || dstIdx === -1) continue;
      // A lower layer (higher index) must not be depended upon... rather: a
      // layer may depend on the same or lower layers (>= index). Upward
      // dependency (src below dst in the stack) is a violation.
      if (srcIdx > dstIdx) {
        out.push({
          ruleId: rule.id,
          ruleType: rule.ruleType,
          fromRef: e.srcRef,
          toRef: e.dstRef,
          explanation: `Layer violation: "${compiled[srcIdx]!.name}" (${e.srcRef}) must not depend upward on "${compiled[dstIdx]!.name}" (${e.dstRef}).`,
        });
      }
    }
    return out;
  }

  private evalNaming(rule: ArchitectureRuleRecord, repositoryId: string): DriftViolation[] {
    const spec = rule.spec as { label?: string; pattern: string };
    let re: RegExp;
    try {
      re = new RegExp(spec.pattern);
    } catch {
      return [];
    }
    const out: DriftViolation[] = [];
    for (const n of this.nodes(repositoryId)) {
      if (spec.label && n.label !== spec.label) continue;
      if (!re.test(n.ref)) {
        out.push({
          ruleId: rule.id,
          ruleType: rule.ruleType,
          fromRef: n.ref,
          explanation: `Naming violation: "${n.ref}" does not match required pattern /${spec.pattern}/.`,
        });
      }
    }
    return out;
  }
}
