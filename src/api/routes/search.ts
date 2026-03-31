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

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(ip, entry);
  }

  entry.count++;
  const allowed = entry.count <= RATE_LIMIT_MAX_REQUESTS;
  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count);

  return { allowed, remaining, resetAt: entry.resetAt };
}

export interface SearchRouteOptions {
  storage: StorageProvider;
  symbolicSearch?: any;
  vectorSearch?: any;
  hybridSearch?: any;
}

export async function registerSearchRoutes(
  fastify: FastifyInstance,
  options: SearchRouteOptions
): Promise<void> {
  fastify.post('/api/search', async (request, reply) => {
    const ip = request.ip || 'unknown';
    const { allowed, remaining, resetAt } = checkRateLimit(ip);

    reply.header('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

    if (!allowed) {
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        message: `Maximum ${RATE_LIMIT_MAX_REQUESTS} search requests per minute. Try again later.`,
        retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
      });
    }

    let input: z.infer<typeof SearchSchema>;
    try {
      input = SearchSchema.parse(request.body);
    } catch (error) {
      return reply.status(400).send({
        error: 'Invalid request',
        message: error instanceof z.ZodError ? error.errors.map(e => e.message).join(', ') : 'Validation failed',
      });
    }

    try {
      const startTime = Date.now();
      let exactTime = 0;
      let semanticTime = 0;
      let fusionTime = 0;

      let results: unknown[] = [];
      let total = 0;
      let hasMore = false;

      if (input.mode === 'exact') {
        const { SymbolicSearch } = await import('../../search/symbolic.js');
        const symbolicSearch = options.symbolicSearch || new SymbolicSearch(options.storage);
        
        const exactStart = Date.now();
        const response = symbolicSearch.search(input.query, input.limit, input.offset);
        exactTime = Date.now() - exactStart;
        
        results = response.results;
        total = response.total;
        hasMore = response.hasMore;
      } else if (input.mode === 'semantic') {
        if (!options.vectorSearch) {
          return reply.status(400).send({
            error: 'Semantic search not available',
            message: 'No LLM provider configured. Configure via /setup',
          });
        }

        const semanticStart = Date.now();
        const response = await options.vectorSearch.search(
          input.query,
          input.repositoryId || '',
          input.limit,
          input.offset
        );
        semanticTime = Date.now() - semanticStart;
        
        results = response.results;
        total = response.total;
        hasMore = response.hasMore;
      } else if (input.mode === 'hybrid') {
        if (!options.hybridSearch) {
          return reply.status(400).send({
            error: 'Hybrid search not available',
            message: 'No LLM provider configured. Configure via /setup',
          });
        }

        const hybridStart = Date.now();
        const response = await options.hybridSearch.search(
          input.query,
          input.repositoryId || '',
          input.limit,
          input.offset
        );
        fusionTime = Date.now() - hybridStart;
        
        results = response.results;
        total = response.total;
        hasMore = response.hasMore;
      }

      const totalTime = Date.now() - startTime;

      return {
        query: input.query,
        mode: input.mode,
        results,
        total,
        limit: input.limit,
        offset: input.offset,
        hasMore,
        timing: {
          total: totalTime,
          exact: exactTime,
          semantic: semanticTime,
          fusion: fusionTime,
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
