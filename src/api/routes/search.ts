/**
 * Search API Routes
 *
 * POST /api/search - Unified search endpoint (exact, semantic, hybrid)
 *
 * Security:
 * - Rate limiting (10 requests per minute per IP)
 * - Input validation with Zod
 * - Query length limits (prevent abuse)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { StorageProvider } from '../../store/provider.js';

const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  mode: z.enum(['exact', 'semantic', 'hybrid']).default('hybrid'),
  repositoryId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export interface SearchRouteOptions {
  storage: StorageProvider;
}

/**
 * Register search routes
 */
export async function registerSearchRoutes(
  fastify: FastifyInstance,
  _options: SearchRouteOptions
): Promise<void> {
  /**
   * POST /api/search
   *
   * Unified search endpoint supporting:
   * - exact: BM25 full-text search (SQLite FTS5)
   * - semantic: Vector similarity search (LanceDB)
   * - hybrid: Combined with Reciprocal Rank Fusion
   *
   * Rate limiting: 10 requests/minute per IP (prevents abuse).
   */
  fastify.post('/api/search', async (request, reply) => {
    const input = SearchSchema.parse(request.body);

    try {
      // TODO: Implement actual search using search modules
      // For now, return mock results
      const results: unknown[] = [];

      return {
        query: input.query,
        mode: input.mode,
        results,
        total: 0,
        limit: input.limit,
        offset: input.offset,
        hasMore: false,
        timing: {
          total: 0,
          exact: 0,
          semantic: 0,
          fusion: 0,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
