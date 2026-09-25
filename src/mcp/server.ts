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

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/server';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ContextSimploToolset } from './tool-catalog.js';
import { getContextSimploToolset } from '../core/config.js';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { formatMCPResponse } from './formatter.js';
import { countWireTokens } from './token-count.js';
import { createV2McpServer } from './v2-register.js';
import type { ResponseMode } from '../core/types.js';
import type { CodeGraphApi } from '../core/graph.js';
import type { StorageProvider } from '../store/provider.js';
import type { Indexer } from '../core/indexer.js';
import { SymbolicSearch } from '../search/symbolic.js';
import { VectorSearch } from '../search/vector.js';
import { HybridSearch } from '../search/hybrid.js';
import type { LanceDBVectorStore } from '../store/lance.js';
import type { EmbeddingProvider } from '../llm/provider.js';
import type { FileWatcher } from '../core/watcher.js';
import { EmlError, MCPProtocolError, ValidationError } from '../core/errors.js';
import * as handlers from './handlers/index.js';
import * as emlHandlers from '../eml/mcp/handlers.js';
import type { EmlServices } from '../eml/mcp/handlers.js';
import { EmlDisabledError } from '../core/errors.js';

export interface MCPServerOptions {
  storage: StorageProvider;
  graph: CodeGraphApi;
  indexer: Indexer;
  workspaceRoot: string;
  vectorStore?: LanceDBVectorStore;
  embeddingProvider?: EmbeddingProvider;
  watcher?: FileWatcher;
  responseMode?: ResponseMode;
  toolset?: ContextSimploToolset;
  eml?: EmlServices;
  indexQueue?: any;
}

export interface MCPMetrics {
  totalRequests: number;
  requestsPerMinute: number;
  toolBreakdown: Record<string, number>;
  averageResponseTime: number;
  errorRate: number;
  responseBytesTotal: number;
  responseTokensTotal: number;
  tokensPerMinute: number;
  toolTokensBreakdown: Record<string, number>;
  lastMinuteRequests: Array<{
    timestamp: number;
    tool: string;
    duration: number;
    error?: boolean;
    responseBytes?: number;
    responseTokens?: number;
  }>;
}

export class MCPServer {
  private stdioMcp?: McpServer;
  private storage: StorageProvider;
  private graph: CodeGraphApi;
  private indexer: Indexer;
  private symbolicSearch: SymbolicSearch;
  private vectorSearch?: VectorSearch;
  private hybridSearch?: HybridSearch;
  private workspaceRoot: string;
  private watcher?: import('../core/watcher.js').FileWatcher;
  private vectorStore?: LanceDBVectorStore;
  private responseMode: ResponseMode;
  private toolset: ContextSimploToolset;
  private eml?: EmlServices;
  private indexQueue?: any;
  private metrics: MCPMetrics = {
    totalRequests: 0,
    requestsPerMinute: 0,
    toolBreakdown: {},
    averageResponseTime: 0,
    errorRate: 0,
    responseBytesTotal: 0,
    responseTokensTotal: 0,
    tokensPerMinute: 0,
    toolTokensBreakdown: {},
    lastMinuteRequests: [],
  };
  private v2HttpHandler?: McpHttpHandler;

  constructor(options: MCPServerOptions) {
    this.storage = options.storage;
    this.graph = options.graph;
    this.indexer = options.indexer;
    this.workspaceRoot = options.workspaceRoot;
    this.responseMode = options.responseMode ?? 'full';
    this.toolset = options.toolset ?? getContextSimploToolset();
    this.symbolicSearch = new SymbolicSearch(this.storage);

    this.watcher = options.watcher;
    this.vectorStore = options.vectorStore;
    this.eml = options.eml;
    this.indexQueue = options.indexQueue;

    if (options.vectorStore && options.embeddingProvider) {
      this.vectorSearch = new VectorSearch(options.vectorStore, options.embeddingProvider);
      this.hybridSearch = new HybridSearch(this.symbolicSearch, this.vectorSearch);
    }

    this.setupProcessSignals();
  }

  getResponseMode(): ResponseMode {
    return this.responseMode;
  }

  getToolset(): ContextSimploToolset {
    return this.toolset;
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; structuredContent: unknown }> {
    const startTime = Date.now();
    try {
      const result = await this.handleToolCall(name, args);
      const wrapped = this.wrapToolResult(result);
      this.recordMetrics(name, Date.now() - startTime, false, wrapped.content[0]!.text);
      return wrapped;
    } catch (error) {
      this.recordMetrics(name, Date.now() - startTime, true, '');
      throw this.mapErrorToMCP(error as Error);
    }
  }

  private wrapToolResult(result: unknown): {
    content: Array<{ type: 'text'; text: string }>;
    structuredContent: unknown;
  } {
    return {
      content: [{ type: 'text', text: formatMCPResponse(result, this.responseMode) }],
      structuredContent: result,
    };
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
      indexQueue: this.indexQueue,
    };

    switch (name) {
      case 'index_repository':
        return handlers.indexRepository(args, context);
      case 'watch_directory':
        return handlers.watchDirectory(args, context);
      case 'list_repositories':
        return handlers.listRepositories(args, context);
      case 'delete_repository':
        return handlers.deleteRepository(args, context);
      case 'find_symbol':
        return handlers.findSymbol(args, context);
      case 'find_references':
        return handlers.findReferences(args, context);
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
      case 'find_complex_functions':
        return handlers.findComplexFunctions(args, context);
      case 'memory_remember':
        return emlHandlers.memoryRemember(args, this.requireEml());
      case 'memory_recall':
        return emlHandlers.memoryRecall(args, this.requireEml());
      case 'memory_search':
        return emlHandlers.memorySearch(args, this.requireEml());
      case 'why_was_this_chosen':
        return emlHandlers.whyWasThisChosen(args, this.requireEml());
      case 'have_we_tried_this':
        return emlHandlers.haveWeTriedThis(args, this.requireEml());
      case 'who_knows':
        return emlHandlers.whoKnows(args, this.requireEml());
      case 'memory_update':
        return emlHandlers.memoryUpdate(args, this.requireEml());
      case 'track_intent':
        return emlHandlers.trackIntent(args, this.requireEml());
      case 'list_active_goals':
        return emlHandlers.listActiveGoals(args, this.requireEml());
      case 'show_evolution':
        return emlHandlers.showEvolution(args, this.requireEml());
      case 'find_knowledge_gaps':
        return emlHandlers.findKnowledgeGaps(args, this.requireEml());
      case 'detect_drift':
        return emlHandlers.detectDrift(args, this.requireEml());
      case 'simulate_impact':
        return emlHandlers.simulateImpact(args, this.requireEml());
      default:
        throw new ValidationError(`Unknown tool: ${name}`);
    }
  }

  private requireEml(): EmlServices {
    if (!this.eml) throw new EmlDisabledError();
    return this.eml;
  }

  private setupProcessSignals(): void {
    process.on('SIGINT', async () => {
      await this.close();
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

    if (error instanceof EmlError) {
      // 400-class domain errors map to invalid-params; others to internal error.
      const mcpCode = error.httpStatus === 400 || error.httpStatus === 404 ? -32602 : -32603;
      return new MCPProtocolError(error.message, mcpCode, error);
    }

    return new MCPProtocolError(error.message, -32603, error);
  }

  async start(): Promise<void> {
    this.stdioMcp = createV2McpServer(this);
    const transport = new StdioServerTransport();
    await this.stdioMcp.connect(transport);
    this.stdioMcp.server.onerror = (error) => {
      console.error('[MCP Server Error]', error);
    };
    console.error('MCP server started on stdio');
    console.error('MCP HTTP transport ready (SDK v2, stateless)');
  }

  /**
   * Handle HTTP request for MCP protocol (SDK v2 stateless handler).
   */
  async handleHttpRequest(req: IncomingMessage, res: ServerResponse, body?: unknown): Promise<void> {
    if (!this.v2HttpHandler) {
      this.v2HttpHandler = createMcpHandler(() => createV2McpServer(this), { legacy: 'stateless' });
    }
    const nodeHandler = toNodeHandler(this.v2HttpHandler);
    await nodeHandler(req, res, body);
  }

  private recordMetrics(toolName: string, duration: number, error: boolean, responseText: string): void {
    const now = Date.now();
    const responseBytes = Buffer.byteLength(responseText, 'utf8');
    const responseTokens = countWireTokens(responseText);

    this.metrics.totalRequests++;
    this.metrics.toolBreakdown[toolName] = (this.metrics.toolBreakdown[toolName] || 0) + 1;
    this.metrics.responseBytesTotal += responseBytes;
    this.metrics.responseTokensTotal += responseTokens;
    this.metrics.toolTokensBreakdown[toolName] =
      (this.metrics.toolTokensBreakdown[toolName] || 0) + responseTokens;

    this.metrics.lastMinuteRequests.push({
      timestamp: now,
      tool: toolName,
      duration,
      error,
      responseBytes,
      responseTokens,
    });

    // Clean up old requests (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    this.metrics.lastMinuteRequests = this.metrics.lastMinuteRequests.filter(
      (req) => req.timestamp > oneMinuteAgo
    );

    this.metrics.requestsPerMinute = this.metrics.lastMinuteRequests.length;
    this.metrics.tokensPerMinute = this.metrics.lastMinuteRequests.reduce(
      (sum, entry) => sum + (entry.responseTokens ?? 0),
      0
    );

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
    await this.stdioMcp?.close();
    this.stdioMcp = undefined;
  }
}
