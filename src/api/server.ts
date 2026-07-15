/**
 * Fastify API Server
 *
 * Serves the dashboard, REST API, MCP HTTP transport, and WebSocket.
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { basename } from 'path';
import { timingSafeEqual } from 'crypto';
import type { CodeGraphApi } from '../core/graph.js';
import type { StorageProvider } from '../store/provider.js';
import { UnauthorizedError } from '../core/errors.js';
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
  registerWorkspaceRoutes,
  registerEmlRoutes,
} from './routes/index.js';
import type { EmlServices } from '../eml/mcp/handlers.js';

export interface APIServerOptions {
  storage: StorageProvider;
  graph: CodeGraphApi;
  dashboardPath: string;
  workspaceRoot: string;
  mountRoot?: string;
  getWorkspaceRoot?: () => string;
  setWorkspaceRoot?: (newPath: string) => Promise<void>;
  templatesPath: string;
  serverHost?: string;
  serverPort?: number;
  symbolicSearch?: any;
  vectorSearch?: any;
  hybridSearch?: any;
  indexer?: any;
  watcher?: any;
  watchQueue?: any;
  embeddingQueue?: any;
  vectorStore?: any;
  embeddingProvider?: any;
  mcpServer?: any;
  configManager?: any;
  eml?: EmlServices;
  indexQueue?: any;
  config?: any;
  authToken?: string;
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

  // Error handler for custom errors
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof UnauthorizedError) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: error.message,
      });
      return;
    }
    
    // Let Fastify handle other errors
    throw error;
  });

  // Authentication hook (must be first)
  if (options.authToken) {
    const configuredToken = options.authToken;
    fastify.addHook('onRequest', async (request, _reply) => {
      const url = request.url;
      
      // Only protect /api/, /mcp, and /ws routes
      if (!url.startsWith('/api/') && !url.startsWith('/mcp') && !url.startsWith('/ws')) {
        return;
      }
      
      // Exclude health check
      if (url === '/api/health') {
        return;
      }
      
      // Extract token from Authorization header or query parameter (for WebSocket)
      let providedToken: string | undefined;
      
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        providedToken = authHeader.substring(7);
      } else if (request.query && typeof request.query === 'object' && 'token' in request.query) {
        providedToken = String(request.query.token);
      }
      
      if (!providedToken) {
        throw new UnauthorizedError('Missing authentication token');
      }
      
      // Constant-time comparison
      const expectedBuffer = Buffer.from(configuredToken);
      const providedBuffer = Buffer.from(providedToken);
      
      if (expectedBuffer.length !== providedBuffer.length || 
          !timingSafeEqual(expectedBuffer, providedBuffer)) {
        throw new UnauthorizedError('Invalid authentication token');
      }
    });
  }

  // Create WebSocket broadcaster
  const broadcaster = new WebSocketBroadcaster();

  // Register WebSocket plugin
  await fastify.register(fastifyWebsocket);

  // Register WebSocket route
  await registerWebSocketRoute(fastify, broadcaster);

  // Register static file serving for dashboard BEFORE routes so routes take precedence
  await fastify.register(fastifyStatic, {
    root: options.dashboardPath,
    prefix: '/',
    constraints: {}, // Allow routes to override
  });

  // MCP HTTP endpoint (must be registered before other routes)
  if (options.mcpServer) {
    const ALLOWED_ORIGINS = new Set([
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      `http://localhost:${options.serverPort || 3001}`,
      `http://127.0.0.1:${options.serverPort || 3001}`,
    ]);

    fastify.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/mcp')) {
        const origin = request.headers.origin;
        const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : ALLOWED_ORIGINS.values().next().value;
        reply.header('Access-Control-Allow-Origin', allowedOrigin);
        reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
        reply.header('Vary', 'Origin');
        
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
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        }
        if (!reply.raw.writableEnded) {
          reply.raw.end(JSON.stringify({ error: 'Internal server error' }));
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
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        }
        if (!reply.raw.writableEnded) {
          reply.raw.end(JSON.stringify({ error: 'Internal server error' }));
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
    const currentWorkspace = options.getWorkspaceRoot ? options.getWorkspaceRoot() : options.workspaceRoot;
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      websocketClients: broadcaster.getClientCount(),
      workspaceRoot: currentWorkspace,
      rootName: basename(currentWorkspace),
    };
  });

  // Explicit root route for dashboard
  fastify.get('/', async (_request, reply) => {
    return reply.sendFile('index.html');
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
    indexQueue: options.indexQueue,
    autoWatch: options.config ? options.config.autoWatch.value : true,
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
    watchQueue: options.watchQueue,
    embeddingQueue: options.embeddingQueue,
    vectorStore: options.vectorStore,
    embeddingProvider: options.embeddingProvider,
    mcpServer: options.mcpServer,
    indexQueue: options.indexQueue,
  });

  await registerMcpConfigRoutes(fastify, {
    serverHost: options.serverHost || 'localhost',
    serverPort: options.serverPort || 3001,
    templatesPath: options.templatesPath,
  });

  await registerBrowseRoutes(fastify, {
    workspaceRoot: options.workspaceRoot,
    mountRoot: options.mountRoot,
  });

  // Engineering Memory Layer routes (always registered; return 503 when disabled).
  await registerEmlRoutes(fastify, { eml: options.eml });

  // Register workspace routes if workspace switching is supported
  if (options.getWorkspaceRoot && options.setWorkspaceRoot && options.mountRoot) {
    await registerWorkspaceRoutes(fastify, {
      mountRoot: options.mountRoot,
      getWorkspaceRoot: options.getWorkspaceRoot,
      setWorkspaceRoot: options.setWorkspaceRoot,
      broadcaster,
    });
  }

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
