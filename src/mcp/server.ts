/**
 * MCP Server - Dual transport (stdio + HTTP)
 *
 * What it does:
 * Implements the Model Context Protocol server with both stdio and Streamable HTTP transports.
 * Registers all 20 tools and routes requests to appropriate handlers.
 *
 * Inputs: Tool requests via MCP protocol
 * Outputs: Tool responses with results or errors
 * Constraints: Must handle both transports simultaneously, proper error codes
 * Assumptions: @modelcontextprotocol/sdk handles protocol details correctly
 * Failure cases: Invalid tool name, validation errors, handler exceptions
 *
 * Design:
 * - Server boots with both transports active
 * - Tool schemas defined in tools.ts
 * - Handlers organized by category (indexing, query, search, analysis)
 * - All inputs validated with Zod before reaching handlers
 * - Errors mapped to MCP error codes
 *
 * Performance: Handlers are async, can process multiple requests concurrently
 * Concurrency: Handlers must be thread-safe (storage/graph access serialized)
 * Security: All inputs validated, paths canonicalized
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { TOOL_DEFINITIONS } from './tools.js';
import type { CodeGraph } from '../core/graph.js';
import type { StorageProvider } from '../store/provider.js';
import type { Indexer } from '../core/indexer.js';
import { SymbolicSearch } from '../search/symbolic.js';
import { VectorSearch } from '../search/vector.js';
import { HybridSearch } from '../search/hybrid.js';
import type { LanceDBVectorStore } from '../store/lance.js';
import type { EmbeddingProvider } from '../llm/provider.js';
import type { FileWatcher } from '../core/watcher.js';
import { MCPProtocolError, ValidationError } from '../core/errors.js';
import * as handlers from './handlers/index.js';

export interface MCPServerOptions {
  storage: StorageProvider;
  graph: CodeGraph;
  indexer: Indexer;
  workspaceRoot: string;
  vectorStore?: LanceDBVectorStore;
  embeddingProvider?: EmbeddingProvider;
  watcher?: FileWatcher;
}

export interface MCPMetrics {
  totalRequests: number;
  requestsPerMinute: number;
  toolBreakdown: Record<string, number>;
  averageResponseTime: number;
  errorRate: number;
  lastMinuteRequests: Array<{ timestamp: number; tool: string; duration: number; error?: boolean }>;
}

export class MCPServer {
  private server: Server;
  private storage: StorageProvider;
  private graph: CodeGraph;
  private indexer: Indexer;
  private symbolicSearch: SymbolicSearch;
  private vectorSearch?: VectorSearch;
  private hybridSearch?: HybridSearch;
  private workspaceRoot: string;
  private watcher?: import('../core/watcher.js').FileWatcher;
  private vectorStore?: LanceDBVectorStore;
  private metrics: MCPMetrics = {
    totalRequests: 0,
    requestsPerMinute: 0,
    toolBreakdown: {},
    averageResponseTime: 0,
    errorRate: 0,
    lastMinuteRequests: [],
  };

  constructor(options: MCPServerOptions) {
    this.storage = options.storage;
    this.graph = options.graph;
    this.indexer = options.indexer;
    this.workspaceRoot = options.workspaceRoot;
    this.symbolicSearch = new SymbolicSearch(this.storage);

    this.watcher = options.watcher;
    this.vectorStore = options.vectorStore;

    if (options.vectorStore && options.embeddingProvider) {
      this.vectorSearch = new VectorSearch(options.vectorStore, options.embeddingProvider);
      this.hybridSearch = new HybridSearch(this.symbolicSearch, this.vectorSearch);
    }

    this.server = new Server(
      {
        name: 'context-simplo',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerTools(this.server);
    this.setupErrorHandling();
  }

  /**
   * Register tool handlers on a Server instance.
   * Used for both the stdio server and per-request HTTP servers.
   */
  private registerTools(server: Server): void {
    server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({
        tools: TOOL_DEFINITIONS,
      })
    );

    server.setRequestHandler(
      CallToolRequestSchema,
      async (request: any) => {
        const { name, arguments: args } = request.params;
        const startTime = Date.now();

        try {
          const result = await this.handleToolCall(name as string, args as Record<string, unknown>);
          const duration = Date.now() - startTime;
          this.recordMetrics(name, duration, false);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          this.recordMetrics(name, duration, true);
          throw this.mapErrorToMCP(error as Error);
        }
      }
    );
  }

  private async handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
    const context = {
      storage: this.storage,
      graph: this.graph,
      indexer: this.indexer,
      symbolicSearch: this.symbolicSearch,
      vectorSearch: this.vectorSearch,
      hybridSearch: this.hybridSearch,
      workspaceRoot: this.workspaceRoot,
      watcher: this.watcher,
      vectorStore: this.vectorStore,
    };

    switch (name) {
      case 'index_repository':
        return handlers.indexRepository(args, context);
      case 'watch_directory':
        return handlers.watchDirectory(args, context);
      case 'unwatch_directory':
        return handlers.unwatchDirectory(args, context);
      case 'list_repositories':
        return handlers.listRepositories(args, context);
      case 'delete_repository':
        return handlers.deleteRepository(args, context);
      case 'get_stats':
        return handlers.getStats(args, context);
      case 'find_symbol':
        return handlers.findSymbol(args, context);
      case 'find_callers':
        return handlers.findCallers(args, context);
      case 'find_callees':
        return handlers.findCallees(args, context);
      case 'find_path':
        return handlers.findPath(args, context);
      case 'get_impact_radius':
        return handlers.getImpactRadius(args, context);
      case 'explain_architecture':
        return handlers.explainArchitecture(args, context);
      case 'exact_search':
        return handlers.exactSearch(args, context);
      case 'semantic_search':
        return handlers.semanticSearch(args, context);
      case 'hybrid_search':
        return handlers.hybridSearch(args, context);
      case 'find_dead_code':
        return handlers.findDeadCode(args, context);
      case 'calculate_complexity':
        return handlers.calculateComplexity(args, context);
      case 'find_complex_functions':
        return handlers.findComplexFunctions(args, context);
      case 'lint_context':
        return handlers.lintContext(args, context);
      case 'query_graph':
        return handlers.queryGraph(args, context);
      default:
        throw new ValidationError(`Unknown tool: ${name}`);
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Server Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private mapErrorToMCP(error: Error): Error {
    if (error instanceof ValidationError) {
      return new MCPProtocolError(error.message, -32602, error);
    }

    if (error instanceof MCPProtocolError) {
      return error;
    }

    return new MCPProtocolError(error.message, -32603, error);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP server started on stdio');
    console.error('MCP HTTP transport ready (stateless, per-request)');
  }

  /**
   * Handle HTTP request for MCP protocol.
   * Creates a fresh Server + Transport pair per request because the SDK
   * forbids reusing a stateless transport across requests.
   */
  async handleHttpRequest(req: IncomingMessage, res: ServerResponse, body?: any): Promise<void> {
    const httpServer = new Server(
      { name: 'context-simplo', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    this.registerTools(httpServer);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await httpServer.connect(transport);
    await transport.handleRequest(req, res, body);

    res.on('close', () => {
      transport.close();
      httpServer.close();
    });
  }

  private recordMetrics(toolName: string, duration: number, error: boolean): void {
    const now = Date.now();
    
    this.metrics.totalRequests++;
    this.metrics.toolBreakdown[toolName] = (this.metrics.toolBreakdown[toolName] || 0) + 1;
    
    this.metrics.lastMinuteRequests.push({
      timestamp: now,
      tool: toolName,
      duration,
      error,
    });

    // Clean up old requests (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    this.metrics.lastMinuteRequests = this.metrics.lastMinuteRequests.filter(
      (req) => req.timestamp > oneMinuteAgo
    );

    // Calculate requests per minute
    this.metrics.requestsPerMinute = this.metrics.lastMinuteRequests.length;

    // Calculate average response time
    const totalDuration = this.metrics.lastMinuteRequests.reduce((sum, req) => sum + req.duration, 0);
    this.metrics.averageResponseTime = this.metrics.lastMinuteRequests.length > 0
      ? totalDuration / this.metrics.lastMinuteRequests.length
      : 0;

    // Calculate error rate
    const errorCount = this.metrics.lastMinuteRequests.filter((req) => req.error).length;
    this.metrics.errorRate = this.metrics.lastMinuteRequests.length > 0
      ? errorCount / this.metrics.lastMinuteRequests.length
      : 0;
  }

  getMetrics(): MCPMetrics {
    return { ...this.metrics };
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}
