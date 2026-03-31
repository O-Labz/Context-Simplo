/**
 * Symbolic search - BM25 full-text search via SQLite FTS5
 *
 * What it does:
 * Provides exact text matching using BM25 ranking algorithm via SQLite's FTS5 extension.
 * Searches across symbol names, qualified names, file paths, and docstrings.
 *
 * Inputs: Search query string, limit, offset
 * Outputs: Ranked SearchResult array with BM25 scores
 * Constraints: FTS5 query syntax, limit max 100
 * Assumptions: nodes_fts table is kept in sync with nodes table
 * Failure cases: Invalid FTS5 query syntax, database errors
 *
 * Design:
 * - Uses SQLite FTS5 virtual table with porter stemming and unicode61 tokenizer
 * - BM25 ranking built into FTS5 (rank column)
 * - Joins with nodes table to get full node data
 * - Scores normalized to 0-1 range
 *
 * Performance: FTS5 is highly optimized, O(log n) search with inverted index
 * Concurrency: Read-only, thread-safe
 * Security: Query is parameterized, no injection risk
 */

import type { StorageProvider } from '../store/provider.js';
import type { SearchResult, PaginatedResponse } from '../core/types.js';
import { StoreError } from '../core/errors.js';

export class SymbolicSearch {
  constructor(private storage: StorageProvider) {}

  search(
    query: string,
    limit: number = 20,
    offset: number = 0
  ): PaginatedResponse<SearchResult> {
    if (limit > 100) {
      limit = 100;
    }

    if (limit < 1) {
      limit = 20;
    }

    if (offset < 0) {
      offset = 0;
    }

    try {
      const results = this.storage.search(query, limit + 1, offset);
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
      throw new StoreError('search', 'FTS5 query failed', error as Error);
    }
  }

  searchByName(name: string, limit: number = 20): SearchResult[] {
    return this.search(name, limit, 0).results;
  }

  searchByQualifiedName(qualifiedName: string, limit: number = 20): SearchResult[] {
    return this.search(`qualified_name:${qualifiedName}`, limit, 0).results;
  }

  searchInFile(filePath: string, query: string, limit: number = 20): SearchResult[] {
    return this.search(`file_path:${filePath} AND ${query}`, limit, 0).results;
  }
}
