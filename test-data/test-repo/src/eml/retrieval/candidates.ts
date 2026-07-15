/**
 * Candidate generation for memory retrieval.
 *
 * Gathers ranked candidate lists from three legs:
 *  - vector  (LanceDB ANN over `eml_memory`) — skipped when no embedder/provider
 *  - bm25    (FTS5 over memory_objects)
 *  - graph   (memories linked to seed entities via the EML graph)
 *
 * Each leg degrades to empty on absence/failure; retrieval never errors just
 * because one source is unavailable.
 */

import type { MemoryRepo } from '../store/memory-repo.js';
import type { MemoryVectorStore } from '../store/memory-vectors.js';
import type { GraphStore } from '../store/graph-store.js';
import type { CandidateList } from './rank.js';

export type QueryEmbedder = (query: string) => Promise<number[] | null>;

export interface CandidateParams {
  query: string;
  repositoryId: string;
  limit: number;
  repo: MemoryRepo;
  vectors?: MemoryVectorStore;
  embedQuery?: QueryEmbedder;
  graph?: GraphStore;
  /** Seed graph node ids to expand for graph-based candidates. */
  seedNodeIds?: string[];
  /** Edge labels to follow for graph candidates (defaults to memory links). */
  graphEdgeLabels?: string[];
}

export interface CandidateResult {
  lists: CandidateList[];
  /** Union of all candidate memory ids across legs. */
  ids: string[];
}

async function vectorLeg(params: CandidateParams): Promise<string[]> {
  if (!params.vectors || !params.embedQuery) return [];
  try {
    const vector = await params.embedQuery(params.query);
    if (!vector || vector.length === 0) return [];
    const hits = await params.vectors.search(params.repositoryId, vector, params.limit * 2);
    return hits.map((h) => h.memoryId);
  } catch {
    return [];
  }
}

function bm25Leg(params: CandidateParams): string[] {
  try {
    return params.repo.searchFts(params.query, params.repositoryId, params.limit * 2).map((h) => h.id);
  } catch {
    return [];
  }
}

function graphLeg(params: CandidateParams): string[] {
  if (!params.graph || !params.seedNodeIds || params.seedNodeIds.length === 0) return [];
  const labels = params.graphEdgeLabels;
  const found = new Set<string>();
  try {
    for (const seed of params.seedNodeIds) {
      const reached = params.graph.traverse({
        rootId: seed,
        direction: 'both',
        edgeLabels: labels,
        repositoryId: params.repositoryId,
        maxDepth: 2,
        limit: params.limit * 2,
      });
      for (const node of reached) {
        if (node.label === 'memory') found.add(node.ref);
      }
    }
  } catch {
    return [];
  }
  return [...found];
}

/**
 * Gather candidate lists. Vector + graph run concurrently with bm25.
 */
export async function gatherCandidates(params: CandidateParams): Promise<CandidateResult> {
  const [vectorIds] = await Promise.all([vectorLeg(params)]);
  const bm25Ids = bm25Leg(params);
  const graphIds = graphLeg(params);

  const lists: CandidateList[] = [
    { source: 'vector', memoryIds: vectorIds },
    { source: 'bm25', memoryIds: bm25Ids },
    { source: 'graph', memoryIds: graphIds },
  ];

  const union = new Set<string>();
  for (const list of lists) for (const id of list.memoryIds) union.add(id);

  return { lists, ids: [...union] };
}
