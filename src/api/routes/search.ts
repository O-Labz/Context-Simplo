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
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now();
  const staleKeys: string[] = [];
  
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      staleKeys.push(ip);
    }
  }
  
  for (const key of staleKeys) {
    rateLimitStore.delete(key);
  }
  
  if (staleKeys.length > 0) {
    console.log(`Cleaned up ${staleKeys.length} stale rate limit entries`);
  }
}, RATE_LIMIT_CLEANUP_INTERVAL_MS);

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
  configManager?: any;
  workspaceRoot?: string;
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

      let results: any[] = [];
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
        const vectorSearch = options.configManager?.getVectorSearch() || options.vectorSearch;
        if (!vectorSearch) {
          return reply.status(400).send({
            error: 'Semantic search not available',
            message: 'No LLM provider configured. Configure via /setup',
          });
        }

        // Get repository ID - use provided one or first available
        let repoId = input.repositoryId;
        if (!repoId) {
          const repos = options.storage.listRepositories();
          if (repos.length === 0) {
            return reply.status(400).send({
              error: 'No repositories indexed',
              message: 'Please index a repository first',
            });
          }
          repoId = repos[0]!.id;
        }

        const semanticStart = Date.now();
        const response = await vectorSearch.search(
          input.query,
          repoId,
          input.limit,
          input.offset
        );
        semanticTime = Date.now() - semanticStart;
        
        results = response.results;
        total = response.total;
        hasMore = response.hasMore;
      } else if (input.mode === 'hybrid') {
        const hybridSearch = options.configManager?.getHybridSearch() || options.hybridSearch;
        if (!hybridSearch) {
          return reply.status(400).send({
            error: 'Hybrid search not available',
            message: 'No LLM provider configured. Configure via /setup',
          });
        }

        // Get repository ID - use provided one or first available
        let repoId = input.repositoryId;
        if (!repoId) {
          const repos = options.storage.listRepositories();
          if (repos.length === 0) {
            return reply.status(400).send({
              error: 'No repositories indexed',
              message: 'Please index a repository first',
            });
          }
          repoId = repos[0]!.id;
        }

        const hybridStart = Date.now();
        const response = await hybridSearch.search(
          input.query,
          repoId,
          input.limit,
          input.offset
        );
        fusionTime = Date.now() - hybridStart;
        
        results = response.results;
        total = response.total;
        hasMore = response.hasMore;
      }

      // Add code snippets if workspace root is available
      if (options.workspaceRoot && results.length > 0) {
        try {
          const { extractSnippetsBatch } = await import('../../search/snippet.js');
          const snippets = await extractSnippetsBatch(
            options.workspaceRoot,
            results.map(r => ({
              filePath: r.filePath,
              lineStart: r.lineStart,
              lineEnd: r.lineEnd,
            })),
            { maxLines: 10, maxChars: 500 }
          );
          
          // Attach snippets to results
          results = results.map(r => {
            const key = `${r.filePath}:${r.lineStart}:${r.lineEnd}`;
            const snippet = snippets.get(key);
            return snippet ? { ...r, snippet } : r;
          });
        } catch (error) {
          // Snippet extraction failed, continue without snippets
          console.warn('Failed to extract snippets:', error);
        }
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
