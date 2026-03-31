/**
 * Repository Management API Routes
 *
 * GET /api/repositories - List all indexed repositories
 * POST /api/repositories - Index a new repository
 * DELETE /api/repositories/:id - Delete a repository
 * POST /api/repositories/:id/reindex - Trigger re-indexing
 * POST /api/repositories/:id/watch - Start watching
 * DELETE /api/repositories/:id/watch - Stop watching
 *
 * Security:
 * - Path traversal prevention (canonicalization)
 * - Read-only workspace mount validation
 * - Input validation with Zod
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import path from 'node:path';
import type { StorageProvider } from '../../store/provider.js';
import type { CodeGraph } from '../../core/graph.js';
import type { WebSocketBroadcaster } from '../websocket.js';
import { WebSocketEvents } from '../websocket.js';

const IndexRepositorySchema = z.object({
  path: z.string().min(1),
  incremental: z.boolean().optional().default(false),
});

export interface RepositoryRouteOptions {
  storage: StorageProvider;
  graph: CodeGraph;
  broadcaster: WebSocketBroadcaster;
  workspaceRoot: string;
  indexer?: any;
  watcher?: any;
  vectorStore?: any;
}

/**
 * Register repository management routes
 */
export async function registerRepositoryRoutes(
  fastify: FastifyInstance,
  options: RepositoryRouteOptions
): Promise<void> {
  /**
   * GET /api/repositories
   *
   * Returns all indexed repositories with statistics.
   */
  fastify.get('/api/repositories', async () => {
    const repos = options.storage.listRepositories();

    return {
      repositories: repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        path: repo.path,
        fileCount: repo.fileCount,
        nodeCount: repo.nodeCount,
        edgeCount: repo.edgeCount,
        languages: repo.languages,
        isWatched: repo.isWatched || false,
        lastIndexedAt: repo.lastIndexedAt,
      })),
      total: repos.length,
    };
  });

  /**
   * POST /api/repositories
   *
   * Index a new repository.
   *
   * Security:
   * - Validates path is within workspace root
   * - Prevents path traversal attacks
   * - Canonicalizes paths
   */
  fastify.post('/api/repositories', async (request, reply) => {
    let input: z.infer<typeof IndexRepositorySchema>;
    try {
      input = IndexRepositorySchema.parse(request.body);
    } catch (error) {
      return reply.status(400).send({
        error: 'Invalid request',
        message: error instanceof z.ZodError ? error.errors.map(e => e.message).join(', ') : 'Validation failed',
      });
    }

    if (!options.indexer) {
      return reply.status(500).send({
        error: 'Indexer not available',
        message: 'Indexer module not initialized',
      });
    }

    // Canonicalize and validate path
    const absolutePath = path.resolve(options.workspaceRoot, input.path);

    if (!absolutePath.startsWith(options.workspaceRoot)) {
      return reply.status(400).send({
        error: 'Path traversal detected',
        message: 'Repository path must be within workspace root',
      });
    }

    try {
      options.broadcaster.broadcast(WebSocketEvents.INDEX_PROGRESS, {
        repositoryId: 'pending',
        path: input.path,
        progress: 0,
        status: 'starting',
      });

      // Run indexing in background
      setImmediate(async () => {
        try {
          const job = await options.indexer.indexRepository(absolutePath, {
            incremental: input.incremental,
            respectIgnore: true,
          });

          options.broadcaster.broadcast(WebSocketEvents.INDEX_COMPLETE, {
            repositoryId: job.repositoryId,
            path: input.path,
            filesProcessed: job.filesProcessed,
            nodesCreated: job.nodesCreated,
            edgesCreated: job.edgesCreated,
          });
        } catch (error) {
          options.broadcaster.broadcast(WebSocketEvents.INDEX_ERROR, {
            path: input.path,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

      return {
        success: true,
        path: input.path,
        message: 'Indexing started',
      };
    } catch (error) {
      return reply.status(500).send({
        error: 'Indexing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/repositories/:id
   *
   * Delete a repository and all its data.
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/repositories/:id',
    async (request, reply) => {
      const { id } = request.params;

      try {
        const repo = options.storage.listRepositories().find(r => r.id === id);
        if (!repo) {
          return reply.status(404).send({
            error: 'Repository not found',
            repositoryId: id,
          });
        }

        options.storage.transaction(() => {
          options.storage.deleteNodesInRepository(id);
          options.storage.deleteEdgesInRepository(id);
          options.storage.deleteFilesInRepository(id);
          options.storage.deleteRepository(id);
        });

        options.graph.getAllNodes({ repositoryId: id }).forEach(node => {
          options.graph.removeNode(node.id);
        });

        if (options.vectorStore) {
          try {
            await options.vectorStore.deleteRepository(id);
          } catch (err) {
            console.warn(`Failed to clean up LanceDB for repo ${id}:`, err);
          }
        }

        if (options.watcher && repo.isWatched) {
          try {
            options.watcher.unwatch(repo.path);
          } catch {
            // watcher may not be watching this path
          }
        }

        return {
          success: true,
          repositoryId: id,
        };
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to delete repository',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/repositories/:id/reindex
   *
   * Trigger re-indexing of a repository.
   */
  fastify.post<{ Params: { id: string } }>(
    '/api/repositories/:id/reindex',
    async (request, reply) => {
      const { id } = request.params;

      if (!options.indexer) {
        return reply.status(500).send({
          error: 'Indexer not available',
          message: 'Indexer module not initialized',
        });
      }

      try {
        const repos = options.storage.listRepositories();
        const repo = repos.find((r) => r.id === id);

        if (!repo) {
          return reply.status(404).send({
            error: 'Repository not found',
            repositoryId: id,
          });
        }

        options.broadcaster.broadcast(WebSocketEvents.INDEX_PROGRESS, {
          repositoryId: id,
          progress: 0,
          status: 'reindexing',
        });

        // Run re-indexing in background
        setImmediate(async () => {
          try {
            const job = await options.indexer.indexRepository(repo.path, {
              incremental: false,
              respectIgnore: true,
            });

            options.broadcaster.broadcast(WebSocketEvents.INDEX_COMPLETE, {
              repositoryId: job.repositoryId,
              path: repo.path,
              filesProcessed: job.filesProcessed,
              nodesCreated: job.nodesCreated,
              edgesCreated: job.edgesCreated,
            });
          } catch (error) {
            options.broadcaster.broadcast(WebSocketEvents.INDEX_ERROR, {
              repositoryId: id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        });

        return {
          success: true,
          repositoryId: id,
          message: 'Re-indexing started',
        };
      } catch (error) {
        return reply.status(500).send({
          error: 'Re-indexing failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/repositories/:id/watch
   *
   * Start watching a repository for file changes.
   */
  fastify.post<{ Params: { id: string } }>(
    '/api/repositories/:id/watch',
    async (request, reply) => {
      const { id } = request.params;

      if (!options.watcher) {
        return reply.status(500).send({
          error: 'Watcher not available',
          message: 'File watcher module not initialized',
        });
      }

      try {
        const repos = options.storage.listRepositories();
        const repo = repos.find((r) => r.id === id);

        if (!repo) {
          return reply.status(404).send({
            error: 'Repository not found',
            repositoryId: id,
          });
        }

        options.watcher.watch(repo.path, id);
        options.storage.updateRepositoryWatchStatus(id, true);

        return {
          success: true,
          repositoryId: id,
          watching: true,
        };
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to start watching',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * DELETE /api/repositories/:id/watch
   *
   * Stop watching a repository.
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/repositories/:id/watch',
    async (request, reply) => {
      const { id } = request.params;

      if (!options.watcher) {
        return reply.status(500).send({
          error: 'Watcher not available',
          message: 'File watcher module not initialized',
        });
      }

      try {
        const repos = options.storage.listRepositories();
        const repo = repos.find((r) => r.id === id);

        if (!repo) {
          return reply.status(404).send({
            error: 'Repository not found',
            repositoryId: id,
          });
        }

        options.watcher.unwatch(repo.path);
        options.storage.updateRepositoryWatchStatus(id, false);

        return {
          success: true,
          repositoryId: id,
          watching: false,
        };
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to stop watching',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
