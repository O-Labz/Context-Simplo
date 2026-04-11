/**
 * MCP tool definitions with Zod schemas
 *
 * Defines all 20 MCP tools exposed to AI assistants.
 * Each tool has a name, description, and input schema validated with Zod.
 */

import { z } from 'zod';

export const IndexRepositoryInputSchema = z.object({
  path: z.string().describe('Repository path to index (relative to /workspace)'),
  incremental: z.boolean().optional().describe('Only re-index changed files'),
});

export const WatchDirectoryInputSchema = z.object({
  path: z.string().describe('Directory path to watch for changes'),
});

export const UnwatchDirectoryInputSchema = z.object({
  path: z.string().describe('Directory path to stop watching'),
});

export const DeleteRepositoryInputSchema = z.object({
  repositoryId: z.string().describe('Repository ID to delete'),
});

export const FindSymbolInputSchema = z.object({
  name: z.string().describe('Symbol name or pattern to search for'),
  kind: z
    .enum(['function', 'method', 'class', 'interface', 'type', 'variable', 'constant'])
    .optional()
    .describe('Filter by node kind'),
  limit: z.number().int().min(1).max(100).optional().default(20).describe('Maximum results'),
  offset: z.number().int().min(0).optional().default(0).describe('Pagination offset'),
});

export const FindCallersInputSchema = z.object({
  symbolName: z.string().describe('Symbol name to find callers for'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const FindCalleesInputSchema = z.object({
  symbolName: z.string().describe('Symbol name to find callees for'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const FindPathInputSchema = z.object({
  fromSymbol: z.string().describe('Source symbol name'),
  toSymbol: z.string().describe('Target symbol name'),
});

export const GetImpactRadiusInputSchema = z.object({
  symbolName: z.string().describe('Symbol to analyze impact for'),
  maxDepth: z.number().int().min(1).max(20).optional().default(10).describe('Maximum traversal depth'),
});

export const ExplainArchitectureInputSchema = z.object({
  repositoryId: z.string().describe('Repository ID to analyze'),
  detailLevel: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .default(1)
    .describe('Detail level: 1=compact, 2=detailed, 3=comprehensive'),
});

export const SemanticSearchInputSchema = z.object({
  query: z.string().describe('Natural language query (e.g., "how do we handle auth?")'),
  repositoryId: z.string().optional().describe('Filter by repository ID'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const ExactSearchInputSchema = z.object({
  query: z.string().describe('Exact text or symbol to search for'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const HybridSearchInputSchema = z.object({
  query: z.string().describe('Search query (works for both semantic and exact matching)'),
  repositoryId: z.string().optional().describe('Filter by repository ID'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const FindDeadCodeInputSchema = z.object({
  repositoryId: z.string().optional().describe('Filter by repository ID'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const CalculateComplexityInputSchema = z.object({
  symbolName: z.string().describe('Symbol name to calculate complexity for'),
});

export const FindComplexFunctionsInputSchema = z.object({
  repositoryId: z.string().optional().describe('Filter by repository ID'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const LintContextInputSchema = z.object({
  filePath: z.string().describe('File path to check'),
  proposedChange: z.string().describe('Description of the proposed change'),
  repositoryId: z.string().optional().describe('Repository ID'),
});

export const QueryGraphInputSchema = z.object({
  query: z.string().describe('Cypher-like query (read-only)'),
  parameters: z.record(z.unknown()).optional().describe('Query parameters'),
});

export const TOOL_DEFINITIONS = [
  {
    name: 'index_repository',
    description:
      'Index a codebase into the graph. Parses all source files, builds dependency graph, and persists to storage.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repository path to index (relative to /workspace)',
        },
        incremental: {
          type: 'boolean',
          description: 'Only re-index changed files (default: false)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'watch_directory',
    description:
      'Start watching a directory for file changes. Automatically re-indexes changed files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to watch',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'unwatch_directory',
    description: 'Stop watching a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to stop watching',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_repositories',
    description: 'List all indexed repositories with statistics.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_repository',
    description: 'Delete a repository and all its data from the index.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: {
          type: 'string',
          description: 'Repository ID to delete',
        },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'get_stats',
    description: 'Get global statistics about the indexed codebase.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'find_symbol',
    description: 'Search for symbols by name with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Symbol name or pattern',
        },
        kind: {
          type: 'string',
          enum: ['function', 'method', 'class', 'interface', 'type', 'variable', 'constant'],
          description: 'Filter by node kind',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 20, max: 100)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'find_callers',
    description: 'Find all functions/methods that call a given symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: {
          type: 'string',
          description: 'Symbol name to find callers for',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
      },
      required: ['symbolName'],
    },
  },
  {
    name: 'find_callees',
    description: 'Find all functions/methods that a given symbol calls.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: {
          type: 'string',
          description: 'Symbol name to find callees for',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
      },
      required: ['symbolName'],
    },
  },
  {
    name: 'find_path',
    description: 'Find the shortest dependency path between two symbols.',
    inputSchema: {
      type: 'object',
      properties: {
        fromSymbol: {
          type: 'string',
          description: 'Source symbol name',
        },
        toSymbol: {
          type: 'string',
          description: 'Target symbol name',
        },
      },
      required: ['fromSymbol', 'toSymbol'],
    },
  },
  {
    name: 'get_impact_radius',
    description:
      'Analyze the blast radius of changing a symbol. Returns all affected files and symbols.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: {
          type: 'string',
          description: 'Symbol to analyze',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum traversal depth (default: 10)',
        },
      },
      required: ['symbolName'],
    },
  },
  {
    name: 'explain_architecture',
    description:
      'Generate a high-level architectural summary of a repository: entry points, modules, key abstractions.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: {
          type: 'string',
          description: 'Repository ID to analyze',
        },
        detailLevel: {
          type: 'number',
          description: 'Detail level: 1=compact (~500 tokens), 2=detailed (~2000 tokens), 3=comprehensive (~5000 tokens)',
        },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'semantic_search',
    description:
      'Semantic vector search using LLM embeddings. Good for "vibe" queries like "how do we handle authentication?"',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'exact_search',
    description:
      'BM25 full-text search for exact matches. Good for finding specific symbols or text.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Exact text or symbol to search for',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'hybrid_search',
    description:
      'Combined vector + BM25 search with Reciprocal Rank Fusion. Best of both worlds.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_dead_code',
    description: 'Find unreferenced symbols (functions, methods, classes with zero incoming edges).',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: {
          type: 'string',
          description: 'Filter by repository ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
      },
    },
  },
  {
    name: 'calculate_complexity',
    description: 'Calculate cyclomatic complexity for a function or file.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: {
          type: 'string',
          description: 'Symbol name to calculate complexity for',
        },
      },
      required: ['symbolName'],
    },
  },
  {
    name: 'find_complex_functions',
    description: 'Find the most complex functions in the codebase, ranked by cyclomatic complexity.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: {
          type: 'string',
          description: 'Filter by repository ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
      },
    },
  },
  {
    name: 'lint_context',
    description:
      'Check if a proposed change matches existing project patterns (naming conventions, structure).',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'File path to check',
        },
        proposedChange: {
          type: 'string',
          description: 'Description of the proposed change',
        },
      },
      required: ['filePath', 'proposedChange'],
    },
  },
  {
    name: 'query_graph',
    description: 'Execute a Cypher-like query against the graph (read-only, parameterized).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Cypher-like query',
        },
        parameters: {
          type: 'object',
          description: 'Query parameters',
        },
      },
      required: ['query'],
    },
  },
] as const;

/**
 * Compact tool definitions for CONTEXT_SIMPLO_RESPONSE_MODE=compact.
 *
 * Differences from TOOL_DEFINITIONS:
 * - Terse descriptions (drop filler, fragments OK, technical terms exact)
 * - First tool carries the key legend + terse-response directive so any
 *   MCP client (not just Cursor) gets the instruction automatically
 */
export const TOOL_DEFINITIONS_COMPACT = [
  {
    name: 'index_repository',
    description:
      'COMPACT MODE — response keys abbreviated: n=name, qn=qualifiedName, k=kind, fp=filePath, ls=lineStart, le=lineEnd, rid=repositoryId, lang=language, s=score, t=total, m=hasMore, r=results/callers/callees, sym=symbol, nid=nodeId, x=isExported, cx=complexity, st=searchType. Respond terse: drop articles/filler/pleasantries/hedging. Fragments OK. Short synonyms. Technical terms exact. Code blocks unchanged. Auto-clarity for security warnings or irreversible ops. | Index codebase. Parse files, build graph, persist. Auto-starts file watcher on completion.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo path (relative to /workspace)' },
        incremental: { type: 'boolean', description: 'Re-index changed files only' },
      },
      required: ['path'],
    },
  },
  {
    name: 'watch_directory',
    description: 'Watch dir for changes. Auto re-indexes on save.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Dir path to watch' },
      },
      required: ['path'],
    },
  },
  {
    name: 'unwatch_directory',
    description: 'Stop watching dir.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Dir path to stop watching' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_repositories',
    description: 'List indexed repos + stats. Check this first; if empty, call index_repository.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_repository',
    description: 'Delete repo + all data from index.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: 'Repo ID to delete' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'get_stats',
    description: 'Global index stats. Shows indexingActive flag.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'find_symbol',
    description: 'Find symbols by name/pattern. Optional kind filter.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name or pattern' },
        kind: {
          type: 'string',
          enum: ['function', 'method', 'class', 'interface', 'type', 'variable', 'constant'],
          description: 'Filter by kind',
        },
        limit: { type: 'number', description: 'Max results (default 20)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
      required: ['name'],
    },
  },
  {
    name: 'find_callers',
    description: 'Find all callers of a symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: { type: 'string', description: 'Symbol to find callers for' },
        limit: { type: 'number', description: 'Max results' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
      required: ['symbolName'],
    },
  },
  {
    name: 'find_callees',
    description: 'Find all symbols called by a symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: { type: 'string', description: 'Symbol to find callees for' },
        limit: { type: 'number', description: 'Max results' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
      required: ['symbolName'],
    },
  },
  {
    name: 'find_path',
    description: 'Shortest dependency path between two symbols.',
    inputSchema: {
      type: 'object',
      properties: {
        fromSymbol: { type: 'string', description: 'Source symbol' },
        toSymbol: { type: 'string', description: 'Target symbol' },
      },
      required: ['fromSymbol', 'toSymbol'],
    },
  },
  {
    name: 'get_impact_radius',
    description: 'Blast radius of changing a symbol. Returns affected files + symbols.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: { type: 'string', description: 'Symbol to analyze' },
        maxDepth: { type: 'number', description: 'Max traversal depth (default 10)' },
      },
      required: ['symbolName'],
    },
  },
  {
    name: 'explain_architecture',
    description: 'High-level repo summary: entry points, modules, key abstractions.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: 'Repo ID to analyze' },
        detailLevel: { type: 'number', description: '1=compact, 2=detailed, 3=comprehensive' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'semantic_search',
    description: 'Vector search. Use for conceptual queries ("how does auth work?").',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query' },
        repositoryId: { type: 'string', description: 'Filter by repo ID' },
        limit: { type: 'number', description: 'Max results' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
      required: ['query'],
    },
  },
  {
    name: 'exact_search',
    description: 'BM25 full-text search. Use for exact symbol/text matches.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text or symbol to search' },
        limit: { type: 'number', description: 'Max results' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
      required: ['query'],
    },
  },
  {
    name: 'hybrid_search',
    description: 'BM25 + vector search with RRF fusion. Best default search.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        repositoryId: { type: 'string', description: 'Filter by repo ID' },
        limit: { type: 'number', description: 'Max results' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_dead_code',
    description: 'Find unreferenced symbols (zero incoming edges).',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: 'Filter by repo ID' },
        limit: { type: 'number', description: 'Max results' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  {
    name: 'calculate_complexity',
    description: 'Cyclomatic complexity for a function.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: { type: 'string', description: 'Symbol to measure' },
      },
      required: ['symbolName'],
    },
  },
  {
    name: 'find_complex_functions',
    description: 'Most complex functions ranked by cyclomatic complexity.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: 'Filter by repo ID' },
        limit: { type: 'number', description: 'Max results' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  {
    name: 'lint_context',
    description: 'Check proposed change against project patterns (naming, structure).',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'File path to check' },
        proposedChange: { type: 'string', description: 'Change description' },
        repositoryId: { type: 'string', description: 'Repo ID' },
      },
      required: ['filePath', 'proposedChange'],
    },
  },
  {
    name: 'query_graph',
    description: 'Cypher-like read-only graph query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cypher-like query string' },
        parameters: { type: 'object', description: 'Query parameters' },
      },
      required: ['query'],
    },
  },
] as const;
