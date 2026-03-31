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
  watcher?: any;
  embeddingQueue?: any;
  vectorStore?: any;
  embeddingProvider?: any;
  mcpServer?: any;
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
        watchedDirectories: options.watcher ? options.watcher.getWatchedPaths().length : 0,
        recentChanges: [],
        queueDepth: 0,
      },

      // Embedding pipeline
      embedding: options.embeddingQueue ? {
        queueDepth: options.embeddingQueue.getStats().queued,
        inFlight: options.embeddingQueue.getStats().inFlight,
        completed: options.embeddingQueue.getStats().completed,
        failed: options.embeddingQueue.getStats().failed,
        averageLatency: 0,
        totalTokens: options.embeddingQueue.getStats().totalTokens,
        rateLimitHits: 0,
      } : {
        queueDepth: 0,
        inFlight: 0,
        completed: 0,
        failed: 0,
        averageLatency: 0,
        totalTokens: 0,
        rateLimitHits: 0,
      },

      // MCP traffic
      mcp: options.mcpServer ? {
        requestsPerMinute: options.mcpServer.getMetrics().requestsPerMinute,
        toolBreakdown: options.mcpServer.getMetrics().toolBreakdown,
        averageResponseTime: options.mcpServer.getMetrics().averageResponseTime,
        errorRate: options.mcpServer.getMetrics().errorRate,
        totalRequests: options.mcpServer.getMetrics().totalRequests,
      } : {
        requestsPerMinute: 0,
        toolBreakdown: {},
        averageResponseTime: 0,
        errorRate: 0,
        totalRequests: 0,
      },

      // LLM provider status
      llm: options.embeddingProvider ? {
        connected: await options.embeddingProvider.healthCheck().catch(() => false),
        provider: options.embeddingProvider.modelName().includes('openai') ? 'openai' : 
                  options.embeddingProvider.modelName().includes('nomic') ? 'ollama' : 'unknown',
        model: options.embeddingProvider.modelName(),
        lastHealthCheck: new Date().toISOString(),
        totalCalls: options.embeddingQueue ? options.embeddingQueue.getStats().completed : 0,
        estimatedCost: 0,
      } : {
        connected: false,
        provider: 'none',
        model: undefined,
        lastHealthCheck: undefined,
        totalCalls: 0,
        estimatedCost: 0,
      },

      // Storage
      storage: {
        sqliteSize: dbStats.databaseSize,
        lancedbSize: options.vectorStore ? await options.vectorStore.getSize().catch(() => 0) : 0,
        totalDiskUsage: dbStats.databaseSize + (options.vectorStore ? await options.vectorStore.getSize().catch(() => 0) : 0),
      },

      // Timestamp
      timestamp: new Date().toISOString(),
    };
  });
}
