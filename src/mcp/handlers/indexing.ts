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
import type { VectorSearch } from '../../search/vector.js';
import type { HybridSearch } from '../../search/hybrid.js';
import type { FileWatcher } from '../../core/watcher.js';
import type { LanceDBVectorStore } from '../../store/lance.js';

export interface HandlerContext {
  storage: StorageProvider;
  graph: CodeGraph;
  indexer: Indexer;
  symbolicSearch: SymbolicSearch;
  vectorSearch?: VectorSearch;
  hybridSearch?: HybridSearch;
  workspaceRoot: string;
  watcher?: FileWatcher;
  vectorStore?: LanceDBVectorStore;
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
  context: HandlerContext
): Promise<unknown> {
  const input = WatchDirectoryInputSchema.parse(args);

  if (!context.watcher) {
    return {
      success: false,
      message: 'File watcher is not available',
      path: input.path,
      watching: false,
    };
  }

  const repos = context.storage.listRepositories();
  const repo = repos.find(r => r.path === input.path || r.path.endsWith(input.path));

  const repositoryId = repo?.id || 'default-repo';
  context.watcher.watch(input.path, repositoryId);

  if (repo) {
    context.storage.updateRepositoryWatchStatus(repo.id, true);
  }

  return {
    success: true,
    message: `Now watching ${input.path} for changes`,
    path: input.path,
    repositoryId,
    watching: true,
  };
}

export async function unwatchDirectory(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = UnwatchDirectoryInputSchema.parse(args);

  if (!context.watcher) {
    return {
      success: false,
      message: 'File watcher is not available',
      path: input.path,
      watching: false,
    };
  }

  context.watcher.unwatch(input.path);

  const repos = context.storage.listRepositories();
  const repo = repos.find(r => r.path === input.path || r.path.endsWith(input.path));
  if (repo) {
    context.storage.updateRepositoryWatchStatus(repo.id, false);
  }

  return {
    success: true,
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

  context.graph.getAllNodes({ repositoryId: input.repositoryId }).forEach(node => {
    context.graph.removeNode(node.id);
  });

  if (context.vectorStore) {
    try {
      await context.vectorStore.deleteRepository(input.repositoryId);
    } catch (err) {
      console.warn(`Failed to clean up LanceDB for repo ${input.repositoryId}:`, err);
    }
  }

  if (context.watcher && repo.isWatched) {
    try {
      context.watcher.unwatch(repo.path);
    } catch {
      // watcher may not be watching this path
    }
  }

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
