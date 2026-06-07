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
  limit: z.number().int().min(1).max(100).optional().default(10).describe('Maximum results'),
  offset: z.number().int().min(0).optional().default(0).describe('Pagination offset'),
});

export const FindCallersInputSchema = z.object({
  symbolName: z.string().describe('Symbol name to find callers for'),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
});

export const FindCalleesInputSchema = z.object({
  symbolName: z.string().describe('Symbol name to find callees for'),
  limit: z.number().int().min(1).max(100).optional().default(10),
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
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
  includeSnippets: z.boolean().optional().default(false).describe('Attach up to 10 lines / 500 chars of source per result. Default: false (saves tokens).'),
});

export const ExactSearchInputSchema = z.object({
  query: z.string().describe('Exact text or symbol to search for'),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
  includeSnippets: z.boolean().optional().default(false).describe('Attach up to 10 lines / 500 chars of source per result. Default: false (saves tokens).'),
});

export const HybridSearchInputSchema = z.object({
  query: z.string().describe('Search query (works for both semantic and exact matching)'),
  repositoryId: z.string().optional().describe('Filter by repository ID'),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
  includeSnippets: z.boolean().optional().default(false).describe('Attach up to 10 lines / 500 chars of source per result. Default: false (saves tokens).'),
});

export const FindDeadCodeInputSchema = z.object({
  repositoryId: z.string().optional().describe('Filter by repository ID'),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
});

export const CalculateComplexityInputSchema = z.object({
  symbolName: z.string().describe('Symbol name to calculate complexity for'),
});

export const FindComplexFunctionsInputSchema = z.object({
  repositoryId: z.string().optional().describe('Filter by repository ID'),
  limit: z.number().int().min(1).max(100).optional().default(10),
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

// --- Engineering Memory Layer (EML) tool input schemas ---

const RepositoryIdSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/)
  .describe('16-hex repository id');

export const MemoryKindToolSchema = z.enum(['decision', 'failure', 'intent', 'gap', 'ownership', 'note']);

export const MemoryRememberInputSchema = z.object({
  kind: MemoryKindToolSchema.describe('Memory kind'),
  title: z.string().min(1).max(200).describe('Short title'),
  summary: z.string().max(2000).optional().describe('One-paragraph summary'),
  body: z.string().max(20000).optional().describe('Full memory body'),
  repositoryId: RepositoryIdSchema,
  idempotencyKey: z.string().min(1).max(128).optional().describe('Dedup key for safe re-submit'),
  entityRefs: z
    .array(
      z.object({
        kind: z.enum(['node', 'file', 'service', 'symbol']),
        ref: z.string().min(1),
      })
    )
    .optional()
    .describe('Code entities this memory relates to'),
});

export const MemoryRecallInputSchema = z.object({
  id: z.string().min(1).max(128).optional().describe('Memory id to recall'),
  repositoryId: RepositoryIdSchema,
  entityRef: z.string().optional().describe('Recall memories linked to this entity ref'),
  limit: z.number().int().min(1).max(100).optional().default(10),
});

export const MemorySearchInputSchema = z.object({
  query: z.string().min(1).describe('Search query'),
  repositoryId: RepositoryIdSchema,
  limit: z.number().int().min(1).max(100).optional().default(10),
  kind: MemoryKindToolSchema.optional().describe('Optional kind filter'),
});

export const WhyWasThisChosenInputSchema = z
  .object({
    repositoryId: RepositoryIdSchema,
    topic: z.string().min(1).optional().describe('Topic/keywords to search decisions for'),
    entityRef: z.string().min(1).optional().describe('Entity ref (file/symbol/service) the decision affects'),
    limit: z.number().int().min(1).max(50).optional().default(10),
  })
  .refine((v) => Boolean(v.topic) || Boolean(v.entityRef), {
    message: 'one of topic or entityRef is required',
  });

export const HaveWeTriedThisInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
  description: z.string().min(1).describe('Describe the approach/idea to check against past failures'),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const WhoKnowsInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
  entityRef: z.string().min(1).describe('Entity ref (file/service/symbol) to find owners for'),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const MemoryIdActionInputSchema = z.object({
  id: z.string().min(1).max(128).describe('Memory id'),
  repositoryId: RepositoryIdSchema,
});

export const FlagContradictionInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
  memoryA: z.string().min(1).max(128).describe('First memory id'),
  memoryB: z.string().min(1).max(128).describe('Second memory id'),
  kind: z.string().min(1).max(64).optional().describe('Contradiction kind'),
});

export const TrackIntentInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
  goal: z.string().min(1).max(200).describe('The goal/intent to track'),
  category: z.string().min(1).max(64).describe('Category (e.g. perf, refactor, feature)'),
  priority: z.number().int().min(1).max(5).optional().default(3).describe('Priority 1-5'),
  targetDate: z.string().min(1).max(40).optional().describe('Optional ISO target date'),
});

export const ListActiveGoalsInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export const ShowEvolutionInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
  entityRef: z.string().min(1).optional().describe('Entity ref (file/symbol/service)'),
  topic: z.string().min(1).optional().describe('Topic/keywords'),
  limit: z.number().int().min(1).max(200).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

export const FindKnowledgeGapsInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const DetectDriftInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
});

export const AddArchitectureRuleInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
  ruleType: z.enum(['layer', 'allowed_dep', 'forbidden_dep', 'naming']),
  spec: z.unknown(),
  source: z.enum(['declared', 'inferred']).optional().default('declared'),
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
          description: 'Maximum results (default: 10, max: 100)',
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
          description: 'Maximum results (default: 10)',
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
          description: 'Maximum results (default: 10)',
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
          description: 'Detail level: 1=summary, 2=detailed, 3=full',
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
          description: 'Maximum results (default: 10)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
        includeSnippets: {
          type: 'boolean',
          description: 'Attach up to 10 lines / 500 chars of source per result (default: false)',
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
          description: 'Maximum results (default: 10)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
        includeSnippets: {
          type: 'boolean',
          description: 'Attach up to 10 lines / 500 chars of source per result (default: false)',
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
          description: 'Maximum results (default: 10)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
        includeSnippets: {
          type: 'boolean',
          description: 'Attach up to 10 lines / 500 chars of source per result (default: false)',
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
          description: 'Maximum results (default: 10)',
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
          description: 'Maximum results (default: 10)',
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
  {
    name: 'memory_remember',
    description:
      'Persist an engineering memory (decision/failure/intent/gap/ownership/note) for later recall. Shared across all MCP clients.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['decision', 'failure', 'intent', 'gap', 'ownership', 'note'],
          description: 'Memory kind',
        },
        title: { type: 'string', description: 'Short title' },
        summary: { type: 'string', description: 'One-paragraph summary' },
        body: { type: 'string', description: 'Full memory body' },
        repositoryId: { type: 'string', description: '16-hex repository id' },
        idempotencyKey: { type: 'string', description: 'Dedup key for safe re-submit' },
        entityRefs: {
          type: 'array',
          description: 'Code entities this memory relates to',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['node', 'file', 'service', 'symbol'] },
              ref: { type: 'string' },
            },
            required: ['kind', 'ref'],
          },
        },
      },
      required: ['kind', 'title', 'repositoryId'],
    },
  },
  {
    name: 'memory_recall',
    description: 'Recall a stored memory by id, or memories linked to a code entity.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory id to recall' },
        repositoryId: { type: 'string', description: '16-hex repository id' },
        entityRef: { type: 'string', description: 'Recall memories linked to this entity ref' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'memory_search',
    description: 'Search engineering memories by meaning + text, ranked by relevance/confidence/freshness.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        repositoryId: { type: 'string', description: '16-hex repository id' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        kind: {
          type: 'string',
          enum: ['decision', 'failure', 'intent', 'gap', 'ownership', 'note'],
          description: 'Optional kind filter',
        },
      },
      required: ['query', 'repositoryId'],
    },
  },
  {
    name: 'why_was_this_chosen',
    description:
      'Explain architectural decisions for a topic or entity: returns rationale, alternatives, and tradeoffs. Empty list when none found.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repository id' },
        topic: { type: 'string', description: 'Topic/keywords to search decisions for' },
        entityRef: { type: 'string', description: 'Entity ref (file/symbol/service) the decision affects' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'have_we_tried_this',
    description:
      'Check whether an approach was already attempted and failed: returns similar past failures with lessons learned. Empty list when none found.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repository id' },
        description: { type: 'string', description: 'Describe the approach/idea to check' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['repositoryId', 'description'],
    },
  },
  {
    name: 'who_knows',
    description:
      'Find who knows/owns a file, service, or symbol: returns people ranked by ownership signal volume and recency. Empty list when no signals.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repository id' },
        entityRef: { type: 'string', description: 'Entity ref (file/service/symbol)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['repositoryId', 'entityRef'],
    },
  },
  {
    name: 'verify_memory',
    description: 'Mark a memory as verified now: refreshes recency and recomputes confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory id' },
        repositoryId: { type: 'string', description: '16-hex repository id' },
      },
      required: ['id', 'repositoryId'],
    },
  },
  {
    name: 'reinforce_memory',
    description: 'Reinforce a memory: bumps source count, refreshes recency, recomputes confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory id' },
        repositoryId: { type: 'string', description: '16-hex repository id' },
      },
      required: ['id', 'repositoryId'],
    },
  },
  {
    name: 'flag_contradiction',
    description: 'Manually flag two memories as contradictory. Records the pair, draws a CONTRADICTS edge, lowers confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repository id' },
        memoryA: { type: 'string', description: 'First memory id' },
        memoryB: { type: 'string', description: 'Second memory id' },
        kind: { type: 'string', description: 'Contradiction kind' },
      },
      required: ['repositoryId', 'memoryA', 'memoryB'],
    },
  },
  {
    name: 'track_intent',
    description: 'Track an active engineering goal/intent. Active intents bias memory retrieval toward advancing them.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repository id' },
        goal: { type: 'string', description: 'The goal/intent to track' },
        category: { type: 'string', description: 'Category (perf, refactor, feature, ...)' },
        priority: { type: 'number', description: 'Priority 1-5 (default 3)' },
        targetDate: { type: 'string', description: 'Optional ISO target date' },
      },
      required: ['repositoryId', 'goal', 'category'],
    },
  },
  {
    name: 'list_active_goals',
    description: 'List active engineering goals/intents for a repository, highest priority first.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repository id' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'show_evolution',
    description:
      'Show the chronological evolution (decisions, failures, diffs) for a topic or entity, ordered by time and paginated.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repository id' },
        entityRef: { type: 'string', description: 'Entity ref (file/symbol/service)' },
        topic: { type: 'string', description: 'Topic/keywords' },
        limit: { type: 'number', description: 'Max entries (default 50, max 200)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'find_knowledge_gaps',
    description:
      'Find under-documented, weakly-owned, complex, high-churn code hotspots ranked by knowledge-gap risk.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repository id' },
        limit: { type: 'number', description: 'Max gaps (default 20, max 100)' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'detect_drift',
    description:
      'Detect architecture drift: forbidden/disallowed dependencies, layer violations, and naming violations against declared rules.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repository id' },
      },
      required: ['repositoryId'],
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
    description: 'Index codebase. Parse files, build graph, persist. Auto-starts file watcher on completion.',
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
        detailLevel: { type: 'number', description: '1=summary, 2=detailed, 3=full' },
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
        limit: { type: 'number', description: 'Max results (default: 10)' },
        offset: { type: 'number', description: 'Pagination offset' },
        includeSnippets: { type: 'boolean', description: 'Include code snippets (default: false)' },
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
        limit: { type: 'number', description: 'Max results (default: 10)' },
        offset: { type: 'number', description: 'Pagination offset' },
        includeSnippets: { type: 'boolean', description: 'Include code snippets (default: false)' },
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
        limit: { type: 'number', description: 'Max results (default: 10)' },
        offset: { type: 'number', description: 'Pagination offset' },
        includeSnippets: { type: 'boolean', description: 'Include code snippets (default: false)' },
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
  {
    name: 'memory_remember',
    description: 'Persist engineering memory (decision/failure/intent/gap/ownership/note). Shared across clients.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['decision', 'failure', 'intent', 'gap', 'ownership', 'note'],
          description: 'Memory kind',
        },
        title: { type: 'string', description: 'Short title' },
        summary: { type: 'string', description: 'Summary' },
        body: { type: 'string', description: 'Full body' },
        repositoryId: { type: 'string', description: '16-hex repo id' },
        idempotencyKey: { type: 'string', description: 'Dedup key' },
        entityRefs: {
          type: 'array',
          description: 'Linked code entities',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['node', 'file', 'service', 'symbol'] },
              ref: { type: 'string' },
            },
            required: ['kind', 'ref'],
          },
        },
      },
      required: ['kind', 'title', 'repositoryId'],
    },
  },
  {
    name: 'memory_recall',
    description: 'Recall memory by id, or memories linked to an entity.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory id' },
        repositoryId: { type: 'string', description: '16-hex repo id' },
        entityRef: { type: 'string', description: 'Linked entity ref' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'memory_search',
    description: 'Search memories by meaning + text. Ranked by relevance/confidence/freshness.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        repositoryId: { type: 'string', description: '16-hex repo id' },
        limit: { type: 'number', description: 'Max results' },
        kind: {
          type: 'string',
          enum: ['decision', 'failure', 'intent', 'gap', 'ownership', 'note'],
          description: 'Optional kind filter',
        },
      },
      required: ['query', 'repositoryId'],
    },
  },
  {
    name: 'why_was_this_chosen',
    description: 'Decisions for topic/entity: rationale, alternatives, tradeoffs. Empty list if none.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repo id' },
        topic: { type: 'string', description: 'Topic/keywords' },
        entityRef: { type: 'string', description: 'Entity ref (file/symbol/service)' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'have_we_tried_this',
    description: 'Past failures similar to an approach, with lessons. Empty list if none.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repo id' },
        description: { type: 'string', description: 'Approach/idea to check' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['repositoryId', 'description'],
    },
  },
  {
    name: 'who_knows',
    description: 'Who owns a file/service/symbol. People ranked by signal volume + recency. Empty if none.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repo id' },
        entityRef: { type: 'string', description: 'Entity ref (file/service/symbol)' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['repositoryId', 'entityRef'],
    },
  },
  {
    name: 'verify_memory',
    description: 'Verify a memory now. Refresh recency + recompute confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory id' },
        repositoryId: { type: 'string', description: '16-hex repo id' },
      },
      required: ['id', 'repositoryId'],
    },
  },
  {
    name: 'reinforce_memory',
    description: 'Reinforce a memory. Bump source count + refresh + recompute confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory id' },
        repositoryId: { type: 'string', description: '16-hex repo id' },
      },
      required: ['id', 'repositoryId'],
    },
  },
  {
    name: 'flag_contradiction',
    description: 'Flag two memories as contradictory. Records pair + CONTRADICTS edge, lowers confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repo id' },
        memoryA: { type: 'string', description: 'First memory id' },
        memoryB: { type: 'string', description: 'Second memory id' },
        kind: { type: 'string', description: 'Contradiction kind' },
      },
      required: ['repositoryId', 'memoryA', 'memoryB'],
    },
  },
  {
    name: 'track_intent',
    description: 'Track an active goal/intent. Biases retrieval toward advancing it.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repo id' },
        goal: { type: 'string', description: 'Goal/intent' },
        category: { type: 'string', description: 'Category' },
        priority: { type: 'number', description: 'Priority 1-5' },
        targetDate: { type: 'string', description: 'ISO target date' },
      },
      required: ['repositoryId', 'goal', 'category'],
    },
  },
  {
    name: 'list_active_goals',
    description: 'List active goals/intents, highest priority first.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repo id' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'show_evolution',
    description: 'Chronological evolution (decisions, failures, diffs) for topic/entity. Paginated.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repo id' },
        entityRef: { type: 'string', description: 'Entity ref' },
        topic: { type: 'string', description: 'Topic/keywords' },
        limit: { type: 'number', description: 'Max entries (max 200)' },
        offset: { type: 'number', description: 'Offset' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'find_knowledge_gaps',
    description: 'Rank under-documented, weakly-owned, complex, high-churn hotspots by risk.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repo id' },
        limit: { type: 'number', description: 'Max gaps (max 100)' },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'detect_drift',
    description: 'Detect architecture drift (forbidden deps, layer/naming violations) vs declared rules.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: '16-hex repo id' },
      },
      required: ['repositoryId'],
    },
  },
] as const;
