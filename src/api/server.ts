/**
 * Fastify API Server
 *
 * Serves the dashboard, REST API, MCP HTTP transport, and WebSocket.
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { CodeGraph } from '../core/graph.js';
import type { StorageProvider } from '../store/provider.js';
import {
  WebSocketBroadcaster,
  registerWebSocketRoute,
} from './websocket.js';
import {
  registerConfigRoutes,
  registerRepositoryRoutes,
  registerSearchRoutes,
  registerGraphRoutes,
  registerMetricsRoutes,
  registerMcpConfigRoutes,
} from './routes/index.js';

export interface APIServerOptions {
  storage: StorageProvider;
  graph: CodeGraph;
  dashboardPath: string;
  workspaceRoot: string;
  templatesPath: string;
  serverHost?: string;
  serverPort?: number;
}

export interface APIServer {
  fastify: ReturnType<typeof Fastify>;
  broadcaster: WebSocketBroadcaster;
}

export async function createAPIServer(
  options: APIServerOptions
): Promise<APIServer> {
  const fastify = Fastify({
    logger: {
      level: process.env.CONTEXT_SIMPLO_LOG_LEVEL || 'info',
    },
  });

  // Create WebSocket broadcaster
  const broadcaster = new WebSocketBroadcaster();

  // Register WebSocket plugin
  await fastify.register(fastifyWebsocket);

  // Register WebSocket route
  await registerWebSocketRoute(fastify, broadcaster);

  // Register static file serving for dashboard
  await fastify.register(fastifyStatic, {
    root: options.dashboardPath,
    prefix: '/',
  });

  // Health check endpoint
  fastify.get('/api/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      websocketClients: broadcaster.getClientCount(),
    };
  });

  // Register API routes
  await registerConfigRoutes(fastify, {
    storage: options.storage,
    broadcaster,
  });

  await registerRepositoryRoutes(fastify, {
    storage: options.storage,
    graph: options.graph,
    broadcaster,
    workspaceRoot: options.workspaceRoot,
  });

  await registerSearchRoutes(fastify, {
    storage: options.storage,
  });

  await registerGraphRoutes(fastify, {
    graph: options.graph,
  });

  await registerMetricsRoutes(fastify, {
    storage: options.storage,
    graph: options.graph,
  });

  await registerMcpConfigRoutes(fastify, {
    serverHost: options.serverHost || 'localhost',
    serverPort: options.serverPort || 3001,
    templatesPath: options.templatesPath,
  });

  // Legacy stats endpoint (for backward compatibility)
  fastify.get('/api/stats', async () => {
    const dbStats = options.storage.getStats();
    const graphStats = options.graph.getStats();
    return {
      repositories: dbStats.repositoryCount,
      files: dbStats.fileCount,
      nodes: dbStats.nodeCount,
      edges: dbStats.edgeCount,
      languages: graphStats.languageBreakdown,
    };
  });

  return { fastify, broadcaster };
}
