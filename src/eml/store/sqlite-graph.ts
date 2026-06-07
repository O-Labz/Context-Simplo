/**
 * SQLite-native GraphStore implementation.
 *
 * Typed accessors over `graph_nodes`/`graph_edges` using prepared statements,
 * with recursive-CTE traversal that is hard-capped on depth and row count to
 * prevent runaway queries (DoS). A graphology hot cache fronts `traverse`.
 *
 * Security: all SQL is parameterized. Dynamic IN-lists use positional `?`
 * placeholders only (never string interpolation of values).
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { GraphQueryError } from '../../core/errors.js';
import {
  MAX_TRAVERSE_DEPTH,
  MAX_TRAVERSE_ROWS,
  type GraphEdge,
  type GraphEdgeInput,
  type GraphNode,
  type GraphNodeInput,
  type GraphStore,
  type TraverseDirection,
  type TraverseResultNode,
  type TraverseSpec,
} from './graph-store.js';
import { HotCache } from './hot-cache.js';

interface GraphNodeRow {
  id: string;
  label: string;
  ref: string;
  repository_id: string;
  props_json: string;
}

interface GraphEdgeRow {
  id: string;
  src: string;
  dst: string;
  label: string;
  repository_id: string;
  weight: number;
  confidence: number;
  valid_from: string;
  valid_to: string | null;
  props_json: string | null;
}

function parseProps(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export class SqliteGraphStore implements GraphStore {
  private readonly db: Database.Database;
  private readonly cache: HotCache | null;

  constructor(db: Database.Database, options: { cache?: HotCache | null } = {}) {
    this.db = db;
    this.cache = options.cache ?? null;
  }

  addNode(node: GraphNodeInput): void {
    try {
      this.db
        .prepare(
          `INSERT INTO graph_nodes (id, label, ref, repository_id, props_json)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             label = excluded.label,
             ref = excluded.ref,
             repository_id = excluded.repository_id,
             props_json = excluded.props_json`
        )
        .run(node.id, node.label, node.ref, node.repositoryId, JSON.stringify(node.props ?? {}));
      this.cache?.invalidateForNodes([node.id]);
    } catch (error) {
      throw new GraphQueryError('addNode', (error as Error).message, error as Error);
    }
  }

  addEdge(edge: GraphEdgeInput): GraphEdge {
    try {
      const id = edge.id ?? `gedge_${randomUUID()}`;
      const validFrom = edge.validFrom ?? new Date().toISOString();
      const weight = edge.weight ?? 1;
      const confidence = edge.confidence ?? 1;
      const propsJson = edge.props ? JSON.stringify(edge.props) : null;
      this.db
        .prepare(
          `INSERT INTO graph_edges (id, src, dst, label, repository_id, weight, confidence, valid_from, valid_to, props_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             src = excluded.src, dst = excluded.dst, label = excluded.label,
             repository_id = excluded.repository_id, weight = excluded.weight,
             confidence = excluded.confidence, valid_from = excluded.valid_from,
             valid_to = excluded.valid_to, props_json = excluded.props_json`
        )
        .run(
          id,
          edge.src,
          edge.dst,
          edge.label,
          edge.repositoryId,
          weight,
          confidence,
          validFrom,
          edge.validTo ?? null,
          propsJson
        );
      this.cache?.invalidateForNodes([edge.src, edge.dst]);
      return {
        id,
        src: edge.src,
        dst: edge.dst,
        label: edge.label,
        repositoryId: edge.repositoryId,
        weight,
        confidence,
        validFrom,
        validTo: edge.validTo ?? null,
        props: edge.props ?? {},
      };
    } catch (error) {
      throw new GraphQueryError('addEdge', (error as Error).message, error as Error);
    }
  }

  getNode(id: string): GraphNode | null {
    const row = this.db.prepare('SELECT * FROM graph_nodes WHERE id = ?').get(id) as GraphNodeRow | undefined;
    if (!row) return null;
    return this.mapNode(row);
  }

  neighbors(
    nodeId: string,
    opts: { direction?: TraverseDirection; edgeLabels?: string[] } = {}
  ): GraphNode[] {
    const direction = opts.direction ?? 'out';
    const ids = new Set<string>();
    try {
      const labelClause = opts.edgeLabels && opts.edgeLabels.length > 0
        ? ` AND label IN (${opts.edgeLabels.map(() => '?').join(',')})`
        : '';
      const labelParams = opts.edgeLabels ?? [];
      if (direction === 'out' || direction === 'both') {
        const rows = this.db
          .prepare(`SELECT dst AS id FROM graph_edges WHERE src = ?${labelClause}`)
          .all(nodeId, ...labelParams) as Array<{ id: string }>;
        rows.forEach((r) => ids.add(r.id));
      }
      if (direction === 'in' || direction === 'both') {
        const rows = this.db
          .prepare(`SELECT src AS id FROM graph_edges WHERE dst = ?${labelClause}`)
          .all(nodeId, ...labelParams) as Array<{ id: string }>;
        rows.forEach((r) => ids.add(r.id));
      }
      return [...ids].map((id) => this.getNode(id)).filter((n): n is GraphNode => n !== null);
    } catch (error) {
      throw new GraphQueryError('neighbors', (error as Error).message, error as Error);
    }
  }

  traverse(spec: TraverseSpec): TraverseResultNode[] {
    const direction = spec.direction ?? 'out';
    const maxDepth = Math.min(spec.maxDepth ?? MAX_TRAVERSE_DEPTH, MAX_TRAVERSE_DEPTH);
    const limit = Math.min(spec.limit ?? MAX_TRAVERSE_ROWS, MAX_TRAVERSE_ROWS);
    const cacheKey = JSON.stringify({
      r: spec.rootId,
      d: direction,
      md: maxDepth,
      l: limit,
      el: spec.edgeLabels ?? null,
      repo: spec.repositoryId ?? null,
    });
    const cached = this.cache?.get(cacheKey);
    if (cached) return cached;

    try {
      const results = this.runTraversal(spec, direction, maxDepth, limit);
      this.cache?.set(cacheKey, results, [spec.rootId]);
      return results;
    } catch (error) {
      throw new GraphQueryError('traverse', (error as Error).message, error as Error);
    }
  }

  private runTraversal(
    spec: TraverseSpec,
    direction: TraverseDirection,
    maxDepth: number,
    limit: number
  ): TraverseResultNode[] {
    // Build the recursive step. `out`/`in` are directed; `both` treats edges as
    // undirected (step to whichever endpoint is not the current node).
    let joinCond: string;
    let nextCol: string;
    if (direction === 'out') {
      joinCond = 'e.src = reach.id';
      nextCol = 'e.dst';
    } else if (direction === 'in') {
      joinCond = 'e.dst = reach.id';
      nextCol = 'e.src';
    } else {
      joinCond = '(e.src = reach.id OR e.dst = reach.id)';
      nextCol = 'CASE WHEN e.src = reach.id THEN e.dst ELSE e.src END';
    }

    let edgeFilter = '';
    if (spec.edgeLabels && spec.edgeLabels.length > 0) {
      edgeFilter += ` AND e.label IN (${spec.edgeLabels.map(() => '?').join(',')})`;
    }
    if (spec.repositoryId) {
      edgeFilter += ' AND e.repository_id = ?';
    }

    const sql = `
      WITH RECURSIVE reach(id, depth) AS (
        SELECT ?, 0
        UNION
        SELECT ${nextCol}, reach.depth + 1
        FROM graph_edges e
        JOIN reach ON ${joinCond}
        WHERE reach.depth < ?${edgeFilter}
      )
      SELECT n.id, n.label, n.ref, n.repository_id, n.props_json, MIN(reach.depth) AS depth
      FROM reach
      JOIN graph_nodes n ON n.id = reach.id
      WHERE reach.id <> ?
      GROUP BY n.id
      ORDER BY depth ASC, n.id ASC
      LIMIT ?`;

    // Param order: root (init), maxDepth, [labels], [repo], root (exclude), limit
    const orderedParams: unknown[] = [];
    orderedParams.push(spec.rootId);
    orderedParams.push(maxDepth);
    if (spec.edgeLabels && spec.edgeLabels.length > 0) orderedParams.push(...spec.edgeLabels);
    if (spec.repositoryId) orderedParams.push(spec.repositoryId);
    orderedParams.push(spec.rootId);
    orderedParams.push(limit);

    const rows = this.db.prepare(sql).all(...orderedParams) as Array<GraphNodeRow & { depth: number }>;
    return rows.map((row) => ({ ...this.mapNode(row), depth: row.depth }));
  }

  shortestPath(src: string, dst: string, edgeLabels?: string[]): string[] | null {
    if (src === dst) return [src];
    try {
      let edgeFilter = '';
      const labelParams: string[] = [];
      if (edgeLabels && edgeLabels.length > 0) {
        edgeFilter = ` AND e.label IN (${edgeLabels.map(() => '?').join(',')})`;
        labelParams.push(...edgeLabels);
      }
      const sql = `
        WITH RECURSIVE paths(id, depth, path) AS (
          SELECT ?, 0, '>' || ? || '>'
          UNION ALL
          SELECT e.dst, paths.depth + 1, paths.path || e.dst || '>'
          FROM graph_edges e
          JOIN paths ON e.src = paths.id
          WHERE paths.depth < ?
            AND instr(paths.path, '>' || e.dst || '>') = 0${edgeFilter}
        )
        SELECT path, depth FROM paths WHERE id = ? ORDER BY depth ASC LIMIT 1`;

      const row = this.db
        .prepare(sql)
        .get(src, src, MAX_TRAVERSE_DEPTH, ...labelParams, dst) as { path: string; depth: number } | undefined;
      if (!row) return null;
      return row.path.split('>').filter((p) => p.length > 0);
    } catch (error) {
      throw new GraphQueryError('shortestPath', (error as Error).message, error as Error);
    }
  }

  private mapNode(row: GraphNodeRow): GraphNode {
    return {
      id: row.id,
      label: row.label,
      ref: row.ref,
      repositoryId: row.repository_id,
      props: parseProps(row.props_json),
    };
  }

  /** Map an edge row (exposed for engines that read raw edges). */
  mapEdge(row: GraphEdgeRow): GraphEdge {
    return {
      id: row.id,
      src: row.src,
      dst: row.dst,
      label: row.label,
      repositoryId: row.repository_id,
      weight: row.weight,
      confidence: row.confidence,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      props: parseProps(row.props_json),
    };
  }
}
