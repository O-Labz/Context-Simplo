/**
 * Metrics API Routes
 *
 * GET /api/metrics - Operational metrics dashboard
 *
 * Returns:
 * - System health (uptime, memory, CPU)
 * - Index status (files, nodes, edges, languages)
 * - Watcher activity (watched dirs, recent changes)
 * - Embedding pipeline (queue depth, latency, errors)
 * - MCP traffic (requests/min, tool breakdown, errors)
 * - LLM provider status (connected, model, health)
 * - Storage (SQLite size, LanceDB size)
 *
 * Security: Localhost-only, no sensitive data exposed.
 */

import type { FastifyInstance } from 'fastify';
import type { StorageProvider } from '../../store/provider.js';
import type { CodeGraph } from '../../core/graph.js';

export interface MetricsRouteOptions {
  storage: StorageProvider;
  graph: CodeGraph;
}

/**
 * Register metrics routes
 */
export async function registerMetricsRoutes(
  fastify: FastifyInstance,
  options: MetricsRouteOptions
): Promise<void> {
  /**
   * GET /api/metrics
   *
   * Returns comprehensive operational metrics.
   */
  fastify.get('/api/metrics', async () => {
    const dbStats = options.storage.getStats();
    const graphStats = options.graph.getStats();
    const memUsage = process.memoryUsage();

    return {
      // System health
      system: {
        uptime: process.uptime() * 1000,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },

      // Memory usage
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external,
        graphMemory: options.graph.getMemoryFootprint(),
      },

      // Index status
      index: {
        repositoryCount: dbStats.repositoryCount,
        fileCount: dbStats.fileCount,
        nodeCount: dbStats.nodeCount,
        edgeCount: dbStats.edgeCount,
        languages: graphStats.languageBreakdown,
        lastIndexTime: dbStats.lastIndexTime,
        filesIndexing: dbStats.filesIndexing || 0,
        filesPending: dbStats.filesPending || 0,
        filesError: dbStats.filesError || 0,
      },

      // Watcher activity
      watcher: {
        watchedDirectories: 0, // TODO: Get from watcher module
        recentChanges: [], // TODO: Get from watcher module
        queueDepth: 0,
      },

      // Embedding pipeline
      embedding: {
        queueDepth: 0, // TODO: Get from embedding queue
        inFlight: 0,
        completed: 0,
        failed: 0,
        averageLatency: 0,
        totalTokens: 0,
        rateLimitHits: 0,
      },

      // MCP traffic
      mcp: {
        requestsPerMinute: 0, // TODO: Track in MCP server
        toolBreakdown: {}, // TODO: Track tool usage
        averageResponseTime: 0,
        errorRate: 0,
      },

      // LLM provider status
      llm: {
        connected: false, // TODO: Get from LLM provider
        provider: 'none',
        model: undefined,
        lastHealthCheck: undefined,
        totalCalls: 0,
        estimatedCost: 0,
      },

      // Storage
      storage: {
        sqliteSize: dbStats.databaseSize,
        lancedbSize: 0, // TODO: Get from LanceDB
        totalDiskUsage: dbStats.databaseSize,
      },

      // Timestamp
      timestamp: new Date().toISOString(),
    };
  });
}
