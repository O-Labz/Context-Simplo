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
import path from 'node:path';
import type { CodeGraph } from '../../core/graph.js';
import type { StorageProvider } from '../../store/provider.js';
import type { Indexer } from '../../core/indexer.js';
import type { SymbolicSearch } from '../../search/symbolic.js';
import type { VectorSearch } from '../../search/vector.js';
import type { HybridSearch } from '../../search/hybrid.js';
import type { FileWatcher } from '../../core/watcher.js';
import type { LanceDBVectorStore } from '../../store/lance.js';
import { isSubpath } from '../../core/path-utils.js';

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

  // Validate path is within workspace
  const absolutePath = path.resolve(context.workspaceRoot, input.path);
  if (!isSubpath(context.workspaceRoot, absolutePath)) {
    throw new Error('Path traversal detected: repository path must be within workspace root');
  }

  const job = await context.indexer.indexRepository(absolutePath, {
    incremental: input.incremental || false,
    respectIgnore: true,
  });

  // Auto-start file watcher so changes are picked up immediately
  let watching = false;
  if (context.watcher && !context.watcher.isWatching(absolutePath)) {
    context.watcher.watch(absolutePath, job.repositoryId);
    context.storage.updateRepositoryWatchStatus(job.repositoryId, true);
    watching = true;
  } else if (context.watcher?.isWatching(absolutePath)) {
    watching = true;
  }

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
    watching,
    message: job.status === 'completed'
      ? `Indexed ${job.filesProcessed} files, ${job.nodesCreated} nodes. ${watching ? 'Auto-watch active — changes re-index immediately.' : 'Watcher unavailable.'}`
      : `Indexing ${job.status}.`,
  };
}

export async function watchDirectory(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = WatchDirectoryInputSchema.parse(args);

  // Path traversal check always runs regardless of watcher availability
  const absolutePath = path.resolve(context.workspaceRoot, input.path);
  if (!isSubpath(context.workspaceRoot, absolutePath)) {
    throw new Error('Path traversal detected: watch path must be within workspace root');
  }

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
  context.watcher.watch(absolutePath, repositoryId);

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
  const watchedPaths = context.watcher?.getWatchedPaths() ?? [];

  return {
    repositories: repos.map((repo) => {
      const isActivelyWatched = watchedPaths.some(
        (p) => p === repo.path || repo.path.startsWith(p)
      );
      return {
        id: repo.id,
        name: repo.name,
        path: repo.path,
        fileCount: repo.fileCount,
        nodeCount: repo.nodeCount,
        edgeCount: repo.edgeCount,
        languages: repo.languages,
        isWatched: isActivelyWatched,
        lastIndexedAt: repo.lastIndexedAt?.toISOString(),
        createdAt: repo.createdAt.toISOString(),
        status: repo.nodeCount === 0
          ? 'empty — run index_repository first'
          : isActivelyWatched
          ? 'indexed, watching for changes'
          : 'indexed',
      };
    }),
    total: repos.length,
    hint: repos.length === 0
      ? 'No repositories indexed. Call index_repository with path="/workspace" to begin.'
      : undefined,
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

  // Remove from graph first (with mutex)
  const nodesToRemove = context.graph.getAllNodes({ repositoryId: input.repositoryId });
  for (const node of nodesToRemove) {
    await context.graph.removeNode(node.id);
  }

  // Then update database
  context.storage.transaction(() => {
    context.storage.deleteNodesInRepository(input.repositoryId);
    context.storage.deleteEdgesInRepository(input.repositoryId);
    context.storage.deleteFilesInRepository(input.repositoryId);
    context.storage.deleteRepository(input.repositoryId);
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
  const watchedPaths = context.watcher?.getWatchedPaths() ?? [];

  return {
    repositories: dbStats.repositoryCount,
    files: dbStats.fileCount,
    nodes: dbStats.nodeCount,
    edges: dbStats.edgeCount,
    filesIndexing: dbStats.filesIndexing ?? 0,
    filesPending: dbStats.filesPending ?? 0,
    filesError: dbStats.filesError ?? 0,
    indexingActive: (dbStats.filesIndexing ?? 0) > 0 || (dbStats.filesPending ?? 0) > 0,
    watchedPaths,
    languages: graphStats.languageBreakdown,
    storage: {
      databaseSize: dbStats.databaseSize,
      graphMemory: context.graph.getMemoryFootprint(),
    },
  };
}
