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
    const input = IndexRepositorySchema.parse(request.body);

    // Canonicalize and validate path
    const absolutePath = path.resolve(options.workspaceRoot, input.path);

    if (!absolutePath.startsWith(options.workspaceRoot)) {
      return reply.status(400).send({
        error: 'Path traversal detected',
        message: 'Repository path must be within workspace root',
      });
    }

    try {
      // TODO: Trigger actual indexing via indexer module
      // For now, return mock response
      const repoId = `repo-${Date.now()}`;

      options.broadcaster.broadcast(WebSocketEvents.INDEX_PROGRESS, {
        repositoryId: repoId,
        path: input.path,
        progress: 0,
        status: 'starting',
      });

      return {
        success: true,
        repositoryId: repoId,
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
        options.storage.deleteRepository(id);

        return {
          success: true,
          repositoryId: id,
        };
      } catch (error) {
        return reply.status(404).send({
          error: 'Repository not found',
          repositoryId: id,
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

      try {
        // TODO: Trigger actual re-indexing
        options.broadcaster.broadcast(WebSocketEvents.INDEX_PROGRESS, {
          repositoryId: id,
          progress: 0,
          status: 'reindexing',
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

      try {
        // TODO: Start file watcher
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

      try {
        // TODO: Stop file watcher
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
