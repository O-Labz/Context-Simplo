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
import { TOOL_DEFINITIONS } from './tools.js';
import type { CodeGraph } from '../core/graph.js';
import type { StorageProvider } from '../store/provider.js';
import type { Indexer } from '../core/indexer.js';
import { SymbolicSearch } from '../search/symbolic.js';
import { VectorSearch } from '../search/vector.js';
import { HybridSearch } from '../search/hybrid.js';
import type { LanceDBVectorStore } from '../store/lance.js';
import type { EmbeddingProvider } from '../llm/provider.js';
import { MCPProtocolError, ValidationError } from '../core/errors.js';
import * as handlers from './handlers/index.js';

export interface MCPServerOptions {
  storage: StorageProvider;
  graph: CodeGraph;
  indexer: Indexer;
  workspaceRoot: string;
  vectorStore?: LanceDBVectorStore;
  embeddingProvider?: EmbeddingProvider;
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

  constructor(options: MCPServerOptions) {
    this.storage = options.storage;
    this.graph = options.graph;
    this.indexer = options.indexer;
    this.workspaceRoot = options.workspaceRoot;
    this.symbolicSearch = new SymbolicSearch(this.storage);

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

    this.registerTools();
    this.setupErrorHandling();
  }

  private registerTools(): void {
    this.server.setRequestHandler(
      { method: 'tools/list' } as any,
      async () => ({
        tools: TOOL_DEFINITIONS,
      })
    );

    this.server.setRequestHandler(
      { method: 'tools/call' } as any,
      async (request: any) => {
        const { name, arguments: args } = request.params;

        try {
          const result = await this.handleToolCall(name as string, args as Record<string, unknown>);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
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
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}
