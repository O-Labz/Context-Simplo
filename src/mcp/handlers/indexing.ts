/**
 * MCP Indexing & Management Tool Handlers
 *
 * Implements: index_repository, watch_directory, unwatch_directory,
 * list_repositories, delete_repository, get_stats
 */

import {
  IndexRepositoryInputSchema,
  WatchDirectoryInputSchema,
  UnwatchDirectoryInputSchema,
  DeleteRepositoryInputSchema,
} from '../tools.js';
import type { CodeGraph } from '../../core/graph.js';
import type { StorageProvider } from '../../store/provider.js';
import type { Indexer } from '../../core/indexer.js';
import type { SymbolicSearch } from '../../search/symbolic.js';

export interface HandlerContext {
  storage: StorageProvider;
  graph: CodeGraph;
  indexer: Indexer;
  symbolicSearch: SymbolicSearch;
  workspaceRoot: string;
}

export async function indexRepository(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = IndexRepositoryInputSchema.parse(args);

  const job = await context.indexer.indexRepository(input.path, {
    incremental: input.incremental || false,
    respectIgnore: true,
  });

  return {
    jobId: job.id,
    repositoryId: job.repositoryId,
    status: job.status,
    filesTotal: job.filesTotal,
    filesProcessed: job.filesProcessed,
    filesFailed: job.filesFailed,
    nodesCreated: job.nodesCreated,
    edgesCreated: job.edgesCreated,
    duration: job.completedAt
      ? job.completedAt.getTime() - job.startedAt.getTime()
      : undefined,
  };
}

export async function watchDirectory(
  args: Record<string, unknown>,
  _context: HandlerContext
): Promise<unknown> {
  const input = WatchDirectoryInputSchema.parse(args);

  return {
    message: `File watching for ${input.path} will be implemented in Phase 5`,
    path: input.path,
    watching: false,
  };
}

export async function unwatchDirectory(
  args: Record<string, unknown>,
  _context: HandlerContext
): Promise<unknown> {
  const input = UnwatchDirectoryInputSchema.parse(args);

  return {
    message: `Stopped watching ${input.path}`,
    path: input.path,
    watching: false,
  };
}

export async function listRepositories(
  _args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const repos = context.storage.listRepositories();

  return {
    repositories: repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      path: repo.path,
      fileCount: repo.fileCount,
      nodeCount: repo.nodeCount,
      edgeCount: repo.edgeCount,
      languages: repo.languages,
      isWatched: repo.isWatched,
      lastIndexedAt: repo.lastIndexedAt?.toISOString(),
      createdAt: repo.createdAt.toISOString(),
    })),
    total: repos.length,
  };
}

export async function deleteRepository(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = DeleteRepositoryInputSchema.parse(args);

  const repo = context.storage.getRepository(input.repositoryId);
  if (!repo) {
    return {
      success: false,
      message: `Repository ${input.repositoryId} not found`,
    };
  }

  context.storage.transaction(() => {
    context.storage.deleteNodesInRepository(input.repositoryId);
    context.storage.deleteEdgesInRepository(input.repositoryId);
    context.storage.deleteFilesInRepository(input.repositoryId);
    context.storage.deleteRepository(input.repositoryId);
  });

  return {
    success: true,
    message: `Deleted repository ${repo.name}`,
    repositoryId: input.repositoryId,
  };
}

export async function getStats(_args: Record<string, unknown>, context: HandlerContext): Promise<unknown> {
  const dbStats = context.storage.getStats();
  const graphStats = context.graph.getStats();

  return {
    repositories: dbStats.repositoryCount,
    files: dbStats.fileCount,
    nodes: dbStats.nodeCount,
    edges: dbStats.edgeCount,
    languages: graphStats.languageBreakdown,
    storage: {
      databaseSize: dbStats.databaseSize,
      graphMemory: context.graph.getMemoryFootprint(),
    },
  };
}
