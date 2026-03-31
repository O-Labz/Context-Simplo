/**
 * Graph Visualization API Routes
 *
 * GET /api/graph/:repo - Get graph data for visualization
 * GET /api/graph/:repo/node/:id - Get node details with neighbors
 *
 * Security:
 * - Repository ID validation
 * - Node count limits (prevent memory exhaustion)
 * - Pagination support
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CodeGraph } from '../../core/graph.js';

const GraphQuerySchema = z.object({
  maxNodes: z.number().int().min(1).max(10000).default(1000),
  includeEdges: z.boolean().default(true),
  filterKind: z.string().optional(),
});

export interface GraphRouteOptions {
  graph: CodeGraph;
}

/**
 * Register graph visualization routes
 */
export async function registerGraphRoutes(
  fastify: FastifyInstance,
  options: GraphRouteOptions
): Promise<void> {
  /**
   * GET /api/graph/:repo
   *
   * Returns graph data for visualization (Sigma.js format).
   *
   * Performance:
   * - Limited to 1000 nodes by default (configurable)
   * - Edges included only if requested
   * - Supports filtering by node kind
   */
  fastify.get<{
    Params: { repo: string };
    Querystring: Record<string, string>;
  }>('/api/graph/:repo', async (request, reply) => {
    const { repo } = request.params;
    const query = GraphQuerySchema.parse({
      maxNodes: request.query.maxNodes ? parseInt(request.query.maxNodes) : 1000,
      includeEdges: request.query.includeEdges !== 'false',
      filterKind: request.query.filterKind,
    });

    try {
      const allNodes = options.graph.getAllNodes({ repositoryId: repo });

      // Apply kind filter if specified
      let filteredNodes = allNodes;
      if (query.filterKind) {
        filteredNodes = allNodes.filter((node) => node.kind === query.filterKind);
      }

      // Limit nodes to prevent memory exhaustion
      const nodes = filteredNodes.slice(0, query.maxNodes);

      // Build edges if requested
      const edges = query.includeEdges
        ? nodes.flatMap((node) => {
            const nodeEdges = options.graph.getCallees(node.id);
            return nodeEdges.map((target) => ({
              id: `${node.id}-${target.id}`,
              source: node.id,
              target: target.id,
              kind: 'calls',
            }));
          })
        : [];

      return {
        nodes: nodes.map((node) => ({
          id: node.id,
          label: node.name,
          kind: node.kind,
          filePath: node.filePath,
          language: node.language,
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          size: node.kind === 'class' ? 10 : node.kind === 'function' ? 6 : 4,
        })),
        edges,
        total: filteredNodes.length,
        truncated: filteredNodes.length > query.maxNodes,
      };
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to load graph',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/graph/:repo/node/:id
   *
   * Returns detailed node information with immediate neighbors.
   */
  fastify.get<{ Params: { repo: string; id: string } }>(
    '/api/graph/:repo/node/:id',
    async (request, reply) => {
      const { repo, id } = request.params;

      try {
        const node = options.graph.getNode(id);

        if (!node || node.repositoryId !== repo) {
          return reply.status(404).send({
            error: 'Node not found',
            nodeId: id,
          });
        }

        const callers = options.graph.getCallers(id);
        const callees = options.graph.getCallees(id);

        return {
          node: {
            id: node.id,
            name: node.name,
            qualifiedName: node.qualifiedName,
            kind: node.kind,
            filePath: node.filePath,
            lineStart: node.lineStart,
            lineEnd: node.lineEnd,
            language: node.language,
            visibility: node.visibility,
            isExported: node.isExported,
            complexity: node.complexity,
          },
          callers: callers.slice(0, 20).map((n) => ({
            id: n.id,
            name: n.name,
            kind: n.kind,
            filePath: n.filePath,
          })),
          callees: callees.slice(0, 20).map((n) => ({
            id: n.id,
            name: n.name,
            kind: n.kind,
            filePath: n.filePath,
          })),
          callersTotal: callers.length,
          calleesTotal: callees.length,
        };
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to load node',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
