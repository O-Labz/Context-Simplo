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
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = SemanticSearchInputSchema.parse(args);

  if (!context.vectorSearch) {
    return {
      error: 'Semantic search not available: LLM provider not configured.',
      message:
        'Vector search not available. Configure an LLM provider via the dashboard at http://localhost:3001/setup or set LLM_PROVIDER environment variable.',
      searchType: 'semantic',
      results: [],
      total: 0,
      limit: input.limit || 20,
      offset: input.offset || 0,
      hasMore: false,
    };
  }

  const result = await context.vectorSearch.search(
    input.query,
    input.repositoryId || 'default-repo',
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
    searchType: 'semantic',
  };
}

export async function hybridSearch(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = HybridSearchInputSchema.parse(args);

  if (!context.hybridSearch) {
    const exactResult = context.symbolicSearch.search(
      input.query,
      input.limit || 20,
      input.offset || 0
    );

    return {
      error: 'Full hybrid search not available: LLM provider not configured.',
      message: 'True hybrid search not available — falling back to BM25 only. Configure LLM for vector+BM25 fusion.',
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
    };
  }

  const result = await context.hybridSearch.search(
    input.query,
    input.repositoryId || 'default-repo',
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
    searchType: 'hybrid',
  };
}
