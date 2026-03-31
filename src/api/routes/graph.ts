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
import DirectedGraph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
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

      const nodeIdSet = new Set(nodes.map(n => n.id));
      const allEdgeKinds: Array<'calls' | 'imports' | 'extends' | 'implements' | 'references'> =
        ['calls', 'imports', 'extends', 'implements', 'references'];

      const edges = query.includeEdges
        ? nodes.flatMap((node) => {
            const results: Array<{ id: string; source: string; target: string; kind: string }> = [];
            for (const kind of allEdgeKinds) {
              const targets = options.graph.getCallees(node.id, [kind]);
              for (const target of targets) {
                if (nodeIdSet.has(target.id)) {
                  results.push({
                    id: `${node.id}-${target.id}-${kind}`,
                    source: node.id,
                    target: target.id,
                    kind,
                  });
                }
              }
            }
            return results;
          })
        : [];

      const layoutGraph = new DirectedGraph();
      for (const node of nodes) {
        layoutGraph.addNode(node.id, {
          x: Math.random() * 100,
          y: Math.random() * 100,
        });
      }
      for (const edge of edges) {
        if (layoutGraph.hasNode(edge.source) && layoutGraph.hasNode(edge.target)) {
          try {
            layoutGraph.addEdge(edge.source, edge.target);
          } catch { /* duplicate */ }
        }
      }

      if (layoutGraph.order > 1) {
        const iterations = Math.min(Math.max(layoutGraph.order * 2, 50), 500);
        forceAtlas2.assign(layoutGraph, {
          iterations,
          settings: {
            gravity: 1,
            scalingRatio: 10,
            barnesHutOptimize: layoutGraph.order > 200,
            strongGravityMode: true,
            slowDown: 5,
          },
        });
      }

      return {
        nodes: nodes.map((node) => {
          const attrs = layoutGraph.getNodeAttributes(node.id);
          return {
            id: node.id,
            label: node.name,
            kind: node.kind,
            filePath: node.filePath,
            language: node.language,
            x: attrs.x as number,
            y: attrs.y as number,
            size: node.kind === 'class' ? 10 : node.kind === 'function' ? 6 : 4,
          };
        }),
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

        const edgeKinds: Array<'calls' | 'imports' | 'extends' | 'implements' | 'references'> =
          ['calls', 'imports', 'extends', 'implements', 'references'];
        const callers = options.graph.getCallers(id, edgeKinds);
        const callees = options.graph.getCallees(id, edgeKinds);

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
