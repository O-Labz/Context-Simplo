/**
 * MCP Search Tool Handlers
 *
 * Implements: exact_search, semantic_search, hybrid_search
 */

import {
  ExactSearchInputSchema,
  SemanticSearchInputSchema,
  HybridSearchInputSchema,
} from '../tools.js';
import type { HandlerContext } from './indexing.js';

export async function exactSearch(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = ExactSearchInputSchema.parse(args);

  const result = context.symbolicSearch.search(
    input.query,
    input.limit || 20,
    input.offset || 0
  );

  return {
    results: result.results.map((r) => ({
      nodeId: r.nodeId,
      name: r.name,
      qualifiedName: r.qualifiedName,
      kind: r.kind,
      filePath: r.filePath,
      lineStart: r.lineStart,
      lineEnd: r.lineEnd,
      score: r.score,
      language: r.language,
      repositoryId: r.repositoryId,
    })),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    hasMore: result.hasMore,
    searchType: 'exact',
  };
}

export async function semanticSearch(
  _args: Record<string, unknown>,
  _context: HandlerContext
): Promise<unknown> {
  return {
    error: 'Vector search unavailable',
    message:
      'Semantic search requires LLM configuration. Configure an LLM provider via the dashboard at http://localhost:3000/setup',
    searchType: 'semantic',
    results: [],
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  };
}

export async function hybridSearch(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = HybridSearchInputSchema.parse(args);

  const exactResult = context.symbolicSearch.search(
    input.query,
    input.limit || 20,
    input.offset || 0
  );

  return {
    results: exactResult.results.map((r) => ({
      nodeId: r.nodeId,
      name: r.name,
      qualifiedName: r.qualifiedName,
      kind: r.kind,
      filePath: r.filePath,
      lineStart: r.lineStart,
      lineEnd: r.lineEnd,
      score: r.score,
      language: r.language,
      repositoryId: r.repositoryId,
    })),
    total: exactResult.total,
    limit: exactResult.limit,
    offset: exactResult.offset,
    hasMore: exactResult.hasMore,
    searchType: 'hybrid',
    note: 'Currently using BM25 only. Vector search will be added in Phase 4.',
  };
}
