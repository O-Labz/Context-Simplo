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
import { resolveRepositoryId } from '../repository-scope.js';
import { mapSearchHit } from '../search-result-map.js';
import { attachRepoRootEnvelope } from '../path-display.js';

async function attachSnippets(
  context: HandlerContext,
  rows: Array<{ filePath: string; lineStart: number; lineEnd: number; snippet?: string }>
): Promise<void> {
  if (!context.workspaceRoot || rows.length === 0) {
    return;
  }
  try {
    const { extractSnippetsBatch } = await import('../../search/snippet.js');
    const snippets = await extractSnippetsBatch(
      context.workspaceRoot,
      rows.map((r) => ({
        filePath: r.filePath,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
      })),
      { maxLines: 10, maxChars: 500 }
    );

    for (const row of rows) {
      const key = `${row.filePath}:${row.lineStart}:${row.lineEnd}`;
      const snippet = snippets.get(key);
      if (snippet) {
        row.snippet = snippet;
      }
    }
  } catch {
    // best-effort
  }
}

function buildSearchPayload(
  context: HandlerContext,
  repositoryId: string | undefined,
  body: Record<string, unknown>
): Record<string, unknown> {
  return attachRepoRootEnvelope(context.storage, repositoryId, body);
}

export async function exactSearch(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = ExactSearchInputSchema.parse(args);
  const repositoryId = resolveRepositoryId(context.storage, input.repositoryId);

  const result = context.symbolicSearch.search(
    input.query,
    input.limit || 10,
    input.offset || 0,
    repositoryId
  );

  const rows = result.results.map((r) => ({ ...r }));
  if (input.includeSnippets) {
    await attachSnippets(context, rows);
  }

  return buildSearchPayload(context, repositoryId, {
    results: rows.map((r) =>
      mapSearchHit(context.storage, r, { includeSnippets: Boolean(input.includeSnippets) })
    ),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    hasMore: result.hasMore,
    searchType: 'exact',
  });
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
      limit: input.limit || 10,
      offset: input.offset || 0,
      hasMore: false,
    };
  }

  const repositoryId = resolveRepositoryId(context.storage, input.repositoryId);
  if (!repositoryId) {
    const repos = context.storage.listRepositories();
    if (repos.length === 0) {
      return {
        error: 'No repositories indexed',
        message: 'Please index a repository first',
        searchType: 'semantic',
        results: [],
        total: 0,
        limit: input.limit || 10,
        offset: input.offset || 0,
        hasMore: false,
      };
    }
    return {
      error: 'repositoryId required',
      message: 'Multiple repositories indexed; pass repositoryId to scope semantic search.',
      searchType: 'semantic',
      results: [],
      total: 0,
      limit: input.limit || 10,
      offset: input.offset || 0,
      hasMore: false,
    };
  }

  const result = await context.vectorSearch.search(
    input.query,
    repositoryId,
    input.limit || 10,
    input.offset || 0
  );

  const rows = result.results.map((r) => ({ ...r }));
  if (input.includeSnippets) {
    await attachSnippets(context, rows);
  }

  return buildSearchPayload(context, repositoryId, {
    results: rows.map((r) =>
      mapSearchHit(context.storage, r, { includeSnippets: Boolean(input.includeSnippets) })
    ),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    hasMore: result.hasMore,
    searchType: 'semantic',
  });
}

export async function hybridSearch(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = HybridSearchInputSchema.parse(args);
  const repositoryId = resolveRepositoryId(context.storage, input.repositoryId);

  if (!context.hybridSearch) {
    const exactResult = context.symbolicSearch.search(
      input.query,
      input.limit || 10,
      input.offset || 0,
      repositoryId
    );

    const rows = exactResult.results.map((r) => ({ ...r }));
    if (input.includeSnippets) {
      await attachSnippets(context, rows);
    }

    return buildSearchPayload(context, repositoryId, {
      error: 'Full hybrid search not available: LLM provider not configured.',
      message: 'True hybrid search not available — falling back to BM25 only. Configure LLM for vector+BM25 fusion.',
      results: rows.map((r) =>
        mapSearchHit(context.storage, r, { includeSnippets: Boolean(input.includeSnippets) })
      ),
      total: exactResult.total,
      limit: exactResult.limit,
      offset: exactResult.offset,
      hasMore: exactResult.hasMore,
      searchType: 'hybrid',
    });
  }

  if (!repositoryId) {
    const repos = context.storage.listRepositories();
    if (repos.length === 0) {
      return {
        error: 'No repositories indexed',
        message: 'Please index a repository first',
        searchType: 'hybrid',
        results: [],
        total: 0,
        limit: input.limit || 10,
        offset: input.offset || 0,
        hasMore: false,
      };
    }
    return {
      error: 'repositoryId required',
      message: 'Multiple repositories indexed; pass repositoryId to scope hybrid search.',
      searchType: 'hybrid',
      results: [],
      total: 0,
      limit: input.limit || 10,
      offset: input.offset || 0,
      hasMore: false,
    };
  }

  const result = await context.hybridSearch.search(
    input.query,
    repositoryId,
    input.limit || 10,
    input.offset || 0
  );

  const rows = result.results.map((r) => ({ ...r }));
  if (input.includeSnippets) {
    await attachSnippets(context, rows);
  }

  return buildSearchPayload(context, repositoryId, {
    results: rows.map((r) =>
      mapSearchHit(context.storage, r, { includeSnippets: Boolean(input.includeSnippets) })
    ),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    hasMore: result.hasMore,
    searchType: 'hybrid',
  });
}
