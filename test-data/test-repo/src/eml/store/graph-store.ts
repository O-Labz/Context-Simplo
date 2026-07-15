/**
 * GraphStore interface and shared types for the Engineering Memory Layer.
 *
 * The EML graph is stored in SQLite (`graph_nodes`/`graph_edges`) and traversed
 * with recursive CTEs. A graphology hot cache fronts repeated traversals.
 */

export interface GraphNode {
  id: string;
  label: string;
  ref: string;
  repositoryId: string;
  props: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  src: string;
  dst: string;
  label: string;
  repositoryId: string;
  weight: number;
  confidence: number;
  validFrom: string;
  validTo: string | null;
  props: Record<string, unknown>;
}

export interface GraphNodeInput {
  id: string;
  label: string;
  ref: string;
  repositoryId: string;
  props?: Record<string, unknown>;
}

export interface GraphEdgeInput {
  id?: string;
  src: string;
  dst: string;
  label: string;
  repositoryId: string;
  weight?: number;
  confidence?: number;
  validFrom?: string;
  validTo?: string | null;
  props?: Record<string, unknown>;
}

export type TraverseDirection = 'out' | 'in' | 'both';

export interface TraverseSpec {
  rootId: string;
  direction?: TraverseDirection;
  edgeLabels?: string[];
  repositoryId?: string;
  /** Max traversal depth. Hard-capped at MAX_TRAVERSE_DEPTH. */
  maxDepth?: number;
  /** Max rows returned. Hard-capped at MAX_TRAVERSE_ROWS. */
  limit?: number;
}

export interface TraverseResultNode extends GraphNode {
  depth: number;
}

export const MAX_TRAVERSE_DEPTH = 12;
export const MAX_TRAVERSE_ROWS = 500;

export interface GraphStore {
  addNode(node: GraphNodeInput): void;
  addEdge(edge: GraphEdgeInput): GraphEdge;
  getNode(id: string): GraphNode | null;
  neighbors(nodeId: string, opts?: { direction?: TraverseDirection; edgeLabels?: string[] }): GraphNode[];
  traverse(spec: TraverseSpec): TraverseResultNode[];
  shortestPath(src: string, dst: string, edgeLabels?: string[]): string[] | null;
}
