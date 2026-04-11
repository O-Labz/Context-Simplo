/**
 * Fastify API Server
 *
 * Serves the dashboard, REST API, MCP HTTP transport, and WebSocket.
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { basename } from 'path';
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
  registerBrowseRoutes,
} from './routes/index.js';

export interface APIServerOptions {
  storage: StorageProvider;
  graph: CodeGraph;
  dashboardPath: string;
  workspaceRoot: string;
  templatesPath: string;
  serverHost?: string;
  serverPort?: number;
  symbolicSearch?: any;
  vectorSearch?: any;
  hybridSearch?: any;
  indexer?: any;
  watcher?: any;
  embeddingQueue?: any;
  vectorStore?: any;
  embeddingProvider?: any;
  mcpServer?: any;
  configManager?: any;
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

  // MCP HTTP endpoint (must be registered before SPA fallback)
  if (options.mcpServer) {
    // Add CORS support for MCP endpoint
    fastify.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/mcp')) {
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
        
        if (request.method === 'OPTIONS') {
          reply.code(200).send();
        }
      }
    });

    // POST endpoint for MCP requests
    fastify.post('/mcp', {
      config: {
        // Disable Fastify's response serialization
        rawBody: true,
      },
    }, async (request, reply) => {
      try {
        console.error(`[MCP] POST ${request.url}`);
        
        // Parse body
        const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
        console.error('[MCP] Method:', body.method, 'Protocol:', body.params?.protocolVersion);
        
        // Important: Must hijack BEFORE any async operations
        reply.hijack();
        
        // Handle the request - MCP transport will write directly to reply.raw
        await options.mcpServer.handleHttpRequest(request.raw, reply.raw, body);
        
        console.error('[MCP] POST completed');
      } catch (error) {
        console.error('[MCP] POST error:', error);
        // After hijack, we must write to raw response
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        }
        if (!reply.raw.writableEnded) {
          reply.raw.end(JSON.stringify({ error: String(error) }));
        }
      }
    });

    // GET endpoint for SSE notifications
    fastify.get('/mcp', async (request, reply) => {
      try {
        console.error(`[MCP] GET ${request.url} (SSE)`);
        
        // Important: Must hijack BEFORE any async operations
        reply.hijack();
        
        // Handle the SSE request - MCP transport will write directly to reply.raw
        await options.mcpServer.handleHttpRequest(request.raw, reply.raw);
        
        console.error('[MCP] GET completed');
      } catch (error) {
        console.error('[MCP] GET error:', error);
        // After hijack, we must write to raw response
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        }
        if (!reply.raw.writableEnded) {
          reply.raw.end(JSON.stringify({ error: String(error) }));
        }
      }
    });
  }

  // SPA fallback - serve index.html for all non-API routes
  fastify.setNotFoundHandler(async (request, reply) => {
    // If it's an API request, return 404
    if (request.url.startsWith('/api/') || request.url.startsWith('/ws') || request.url.startsWith('/mcp')) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }
    // Otherwise, serve index.html for client-side routing
    return reply.sendFile('index.html');
  });

  // Health check endpoint
  fastify.get('/api/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      websocketClients: broadcaster.getClientCount(),
      workspaceRoot: options.workspaceRoot,
      rootName: basename(options.workspaceRoot),
    };
  });

  // Register API routes
  await registerConfigRoutes(fastify, {
    storage: options.storage,
    broadcaster,
    embeddingProvider: options.embeddingProvider,
    configManager: options.configManager,
  });

  await registerRepositoryRoutes(fastify, {
    storage: options.storage,
    graph: options.graph,
    broadcaster,
    workspaceRoot: options.workspaceRoot,
    indexer: options.indexer,
    watcher: options.watcher,
    vectorStore: options.vectorStore,
  });

  await registerSearchRoutes(fastify, {
    storage: options.storage,
    symbolicSearch: options.symbolicSearch,
    vectorSearch: options.vectorSearch,
    hybridSearch: options.hybridSearch,
    configManager: options.configManager,
    workspaceRoot: options.workspaceRoot,
  });

  await registerGraphRoutes(fastify, {
    graph: options.graph,
  });

  await registerMetricsRoutes(fastify, {
    storage: options.storage,
    graph: options.graph,
    watcher: options.watcher,
    embeddingQueue: options.embeddingQueue,
    vectorStore: options.vectorStore,
    embeddingProvider: options.embeddingProvider,
    mcpServer: options.mcpServer,
  });

  await registerMcpConfigRoutes(fastify, {
    serverHost: options.serverHost || 'localhost',
    serverPort: options.serverPort || 3001,
    templatesPath: options.templatesPath,
  });

  await registerBrowseRoutes(fastify, {
    workspaceRoot: options.workspaceRoot,
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
