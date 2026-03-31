/**
 * Hybrid Search - Reciprocal Rank Fusion
 *
 * What it does:
 * Combines BM25 symbolic search and vector semantic search using RRF.
 *
 * Inputs: Query, SymbolicSearch, VectorSearch
 * Outputs: Fused and reranked SearchResult array
 * Constraints: Both searches must complete successfully
 * Assumptions: Score normalization works across search types
 * Failure cases: One search fails, no results from either
 *
 * Design:
 * - Run both searches in parallel
 * - Apply Reciprocal Rank Fusion: score = sum(1 / (k + rank))
 * - Merge and deduplicate by nodeId
 * - Sort by fused score
 */

import type { SymbolicSearch } from './symbolic.js';
import type { VectorSearch } from './vector.js';
import type { SearchResult, PaginatedResponse } from '../core/types.js';

const RRF_K = 60;

export class HybridSearch {
  constructor(
    private symbolicSearch: SymbolicSearch,
    private vectorSearch: VectorSearch
  ) {}

  async search(
    query: string,
    repositoryId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedResponse<SearchResult>> {
    const [symbolicResults, vectorResults] = await Promise.allSettled([
      this.symbolicSearch.search(query, limit * 2, 0),
      this.vectorSearch.search(query, repositoryId, limit * 2, 0),
    ]);

    const symbolic =
      symbolicResults.status === 'fulfilled' ? symbolicResults.value.results : [];
    const vector = vectorResults.status === 'fulfilled' ? vectorResults.value.results : [];

    const fusedScores = new Map<string, { result: SearchResult; score: number }>();

    symbolic.forEach((result, index) => {
      const rrfScore = 1 / (RRF_K + index + 1);
      fusedScores.set(result.nodeId, {
        result,
        score: rrfScore,
      });
    });

    vector.forEach((result, index) => {
      const rrfScore = 1 / (RRF_K + index + 1);
      const existing = fusedScores.get(result.nodeId);

      if (existing) {
        existing.score += rrfScore;
      } else {
        fusedScores.set(result.nodeId, {
          result,
          score: rrfScore,
        });
      }
    });

    const sortedResults = Array.from(fusedScores.values())
      .sort((a, b) => b.score - a.score)
      .map((item) => ({
        ...item.result,
        score: item.score,
      }));

    const paginatedResults = sortedResults.slice(offset, offset + limit);
    const hasMore = offset + limit < sortedResults.length;

    return {
      results: paginatedResults,
      total: sortedResults.length,
      limit,
      offset,
      hasMore,
    };
  }
}
