/**
 * Workspace Management API Routes
 *
 * GET /api/workspace - Get current workspace info
 * PUT /api/workspace - Change active workspace at runtime
 *
 * Security:
 * - Path traversal prevention
 * - Validates path exists and is within mount root
 * - Read-only mount enforcement
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { isSubpath, sanitizeErrorMessage } from '../../core/path-utils.js';
import type { WebSocketBroadcaster } from '../websocket.js';
import { WebSocketEvents } from '../websocket.js';

const ChangeWorkspaceSchema = z.object({
  path: z.string().min(1),
});

export interface WorkspaceRouteOptions {
  mountRoot: string;
  getWorkspaceRoot: () => string;
  setWorkspaceRoot: (newPath: string) => Promise<void>;
  broadcaster: WebSocketBroadcaster;
}

/**
 * Register workspace management routes
 */
export async function registerWorkspaceRoutes(
  fastify: FastifyInstance,
  options: WorkspaceRouteOptions
): Promise<void> {
  /**
   * GET /api/workspace
   *
   * Returns current workspace path and mount root.
   */
  fastify.get('/api/workspace', async () => {
    const workspaceRoot = options.getWorkspaceRoot();
    return {
      workspace: workspaceRoot,
      mountRoot: options.mountRoot,
      name: path.basename(workspaceRoot),
    };
  });

  /**
   * PUT /api/workspace
   *
   * Change the active workspace at runtime.
   * Triggers re-indexing and watcher restart.
   */
  fastify.put('/api/workspace', async (request, reply) => {
    let input: z.infer<typeof ChangeWorkspaceSchema>;
    try {
      input = ChangeWorkspaceSchema.parse(request.body);
    } catch (error) {
      return reply.status(400).send({
        error: 'Invalid request',
        message: error instanceof z.ZodError ? error.errors.map(e => e.message).join(', ') : 'Validation failed',
      });
    }

    // Canonicalize path
    const absolutePath = path.resolve(input.path);

    // Validate path is within mount root
    if (!isSubpath(options.mountRoot, absolutePath)) {
      return reply.status(400).send({
        error: 'Path traversal detected',
        message: 'Workspace path must be within mount root',
      });
    }

    // Validate path exists and is a directory
    try {
      const stats = await stat(absolutePath);
      if (!stats.isDirectory()) {
        return reply.status(400).send({
          error: 'Invalid path',
          message: 'Workspace path must be a directory',
        });
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return reply.status(404).send({
          error: 'Directory not found',
          message: 'The specified path does not exist',
        });
      }
      return reply.status(500).send({
        error: 'Failed to validate path',
        message: sanitizeErrorMessage(error.message),
      });
    }

    // Broadcast workspace change starting
    options.broadcaster.broadcast(WebSocketEvents.CONFIG_RELOADING, {
      workspace: absolutePath,
      status: 'changing',
    });

    try {
      // Trigger workspace change (stops watcher, updates workspace, re-indexes, starts watcher)
      await options.setWorkspaceRoot(absolutePath);

      // Broadcast success
      options.broadcaster.broadcast(WebSocketEvents.CONFIG_RELOAD_COMPLETE, {
        workspace: absolutePath,
        name: path.basename(absolutePath),
      });

      return {
        success: true,
        workspace: absolutePath,
        name: path.basename(absolutePath),
      };
    } catch (error) {
      options.broadcaster.broadcast(WebSocketEvents.CONFIG_RELOAD_ERROR, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return reply.status(500).send({
        error: 'Failed to change workspace',
        message: error instanceof Error ? sanitizeErrorMessage(error.message) : 'Unknown error',
      });
    }
  });
}
