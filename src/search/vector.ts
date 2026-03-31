/**
 * Vector Search - Semantic search via LanceDB
 *
 * What it does:
 * Provides semantic search using vector embeddings and ANN search.
 *
 * Inputs: Natural language query, EmbeddingProvider, LanceDB
 * Outputs: Ranked SearchResult array with similarity scores
 * Constraints: Requires LLM provider configured
 * Assumptions: Query and chunks use same embedding model
 * Failure cases: Provider unavailable, no embeddings indexed
 */

import type { LanceDBVectorStore } from '../store/lance.js';
import type { EmbeddingProvider } from '../llm/provider.js';
import type { SearchResult, PaginatedResponse } from '../core/types.js';
import { LLMError } from '../core/errors.js';

export class VectorSearch {
  constructor(
    private vectorStore: LanceDBVectorStore,
    private embeddingProvider: EmbeddingProvider
  ) {}

  async search(
    query: string,
    repositoryId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedResponse<SearchResult>> {
    try {
      const queryEmbeddings = await this.embeddingProvider.embed([query]);
      const queryVector = queryEmbeddings[0];

      if (!queryVector) {
        throw new LLMError('provider', 'Failed to generate query embedding', false);
      }

      const results = await this.vectorStore.search(repositoryId, queryVector, limit + 1, offset);
      const hasMore = results.length > limit;
      const trimmedResults = hasMore ? results.slice(0, limit) : results;

      return {
        results: trimmedResults,
        total: offset + results.length + (hasMore ? 1 : 0),
        limit,
        offset,
        hasMore,
      };
    } catch (error) {
      throw new LLMError('search', (error as Error).message, false, error as Error);
    }
  }
}
