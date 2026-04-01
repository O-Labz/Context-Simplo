/**
 * Directory Browser API Route
 *
 * GET /api/browse?path= - List subdirectories within the workspace
 *
 * Security:
 * - Only exposes directories within the workspace root
 * - Prevents path traversal via canonicalization
 * - Filters hidden/system directories
 */

import type { FastifyInstance } from 'fastify';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isSubpath } from '../../core/path-utils.js';

export interface BrowseRouteOptions {
  workspaceRoot: string;
}

export async function registerBrowseRoutes(
  fastify: FastifyInstance,
  options: BrowseRouteOptions
): Promise<void> {
  fastify.get<{ Querystring: { path?: string } }>(
    '/api/browse',
    async (request, reply) => {
      const relPath = (request.query.path || '/').replace(/^\/+/, '');
      const absolutePath = relPath
        ? path.resolve(options.workspaceRoot, relPath)
        : options.workspaceRoot;

      if (!isSubpath(options.workspaceRoot, absolutePath)) {
        return reply.status(400).send({
          error: 'Path traversal detected',
          message: 'Browse path must be within workspace root',
        });
      }

      try {
        const entries = await readdir(absolutePath, { withFileTypes: true });

        const HIDDEN = new Set([
          'node_modules', '.git', '.svn', '.hg', '__pycache__',
          '.cache', '.tmp', 'dist', 'build', '.next', '.nuxt',
          'coverage', '.nyc_output', '.turbo', '.vercel',
        ]);

        const dirs = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !HIDDEN.has(e.name))
          .map((e) => ({
            name: e.name,
            path: (relPath ? relPath + '/' + e.name : e.name).replace(/\\/g, '/'),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const fileStat = await stat(absolutePath);
        const currentPath = relPath || '/';
        const isRoot = absolutePath === options.workspaceRoot;
        const parentDir = path.dirname(relPath).replace(/\\/g, '/');

        return {
          current: currentPath.replace(/\\/g, '/'),
          parent: isRoot ? null : (parentDir === '.' ? '/' : parentDir),
          directories: dirs,
          isRoot,
          rootName: path.basename(options.workspaceRoot),
          lastModified: fileStat.mtime.toISOString(),
        };
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return reply.status(404).send({ error: 'Directory not found' });
        }
        if (error.code === 'ENOTDIR') {
          return reply.status(400).send({ error: 'Path is not a directory' });
        }
        return reply.status(500).send({
          error: 'Failed to browse directory',
          message: error.message,
        });
      }
    }
  );
}
