import { z } from 'zod';
import {
  DeleteRepositoryInputSchema,
  DetectDriftInputSchema,
  ExactSearchInputSchema,
  ExplainArchitectureInputSchema,
  FindComplexFunctionsInputSchema,
  FindDeadCodeInputSchema,
  FindKnowledgeGapsInputSchema,
  FindPathInputSchema,
  FindReferencesInputSchema,
  FindSymbolInputSchema,
  GetImpactRadiusInputSchema,
  HaveWeTriedThisInputSchema,
  HybridSearchInputSchema,
  IndexRepositoryInputSchema,
  ListActiveGoalsInputSchema,
  MemoryRecallInputSchema,
  MemoryRememberInputSchema,
  MemorySearchInputSchema,
  MemoryUpdateInputSchema,
  SemanticSearchInputSchema,
  ShowEvolutionInputSchema,
  SimulateImpactInputSchema,
  TrackIntentInputSchema,
  WatchDirectoryInputSchema,
  WhoKnowsInputSchema,
  WhyWasThisChosenInputSchema,
} from './tools.js';

const readOnly = { readOnlyHint: true as const };

const SymbolHitSchema = z.object({
  name: z.string(),
  qualifiedName: z.string(),
  kind: z.string(),
  filePath: z.string(),
  lineStart: z.number(),
  lineEnd: z.number(),
  isExported: z.boolean(),
  language: z.string(),
  repositoryId: z.string(),
  complexity: z.number().optional(),
});

const AmbiguousSchema = z.object({
  ambiguous: z.literal(true),
  candidates: z.array(
    z.object({
      name: z.string(),
      kind: z.string(),
      filePath: z.string(),
      lineStart: z.number(),
    })
  ),
  message: z.string(),
});

const SearchHitSchema = z.object({
  nodeId: z.string(),
  name: z.string(),
  qualifiedName: z.string(),
  kind: z.string(),
  filePath: z.string(),
  lineStart: z.number(),
  lineEnd: z.number(),
  score: z.number(),
  language: z.string(),
  repositoryId: z.string(),
  complexity: z.number().optional(),
  isExported: z.boolean(),
  snippet: z.string().optional(),
});

const SearchOutputSchema = z.object({
  results: z.array(SearchHitSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
  searchType: z.enum(['exact', 'semantic', 'hybrid']),
  error: z.string().optional(),
  message: z.string().optional(),
  repoRoot: z.string().optional(),
});

const DeadCodeHitSchema = z.object({
  id: z.string(),
  name: z.string(),
  qualifiedName: z.string(),
  kind: z.string(),
  filePath: z.string(),
  lineStart: z.number(),
  lineEnd: z.number(),
  language: z.string(),
});

const ComplexHitSchema = DeadCodeHitSchema.extend({
  complexity: z.number(),
});

const PageSchema = {
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
};

const MemoryViewSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  summary: z.string(),
  confidence: z.number(),
  freshness: z.number(),
  contradictionScore: z.number(),
  sourceCount: z.number(),
  score: z.number().optional(),
});

const DecisionHitSchema = MemoryViewSchema.extend({
  decision: z.string(),
  rationale: z.string(),
  alternatives: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  decisionDate: z.string(),
  author: z.string().nullable(),
  affectedSystems: z.array(z.string()),
  status: z.string(),
});

const FailureHitSchema = MemoryViewSchema.extend({
  failureType: z.string(),
  whatFailed: z.string(),
  whyFailed: z.string(),
  lessons: z.array(z.string()),
  rootCause: z.string().nullable(),
  incidentRef: z.string().nullable(),
});

const ProvenanceSchema = z.object({
  id: z.string(),
  memoryId: z.string(),
  eventId: z.string().nullable(),
  sourceType: z.enum([
    'diff',
    'structural_delta',
    'conversation',
    'pr',
    'issue',
    'commit_message',
    'agent',
  ]),
  sourceRef: z.string(),
  snippet: z.string().nullable(),
  weight: z.number(),
  verifiedAgainstDiff: z.boolean(),
  createdAt: z.string(),
});

const IndexAcceptedSchema = z.object({
  status: z.literal('accepted'),
  path: z.string(),
  message: z.string(),
});

const WatchOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  path: z.string(),
  watching: z.boolean(),
  repositoryId: z.string().optional(),
});

const DeleteOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  repositoryId: z.string().optional(),
});

const FindSymbolOutputSchema = z.object({
  results: z.array(SymbolHitSchema),
  ...PageSchema,
});

const FindReferencesOutputSchema = z.union([
  AmbiguousSchema,
  z.object({
    symbol: SymbolHitSchema,
    direction: z.enum(['in', 'out', 'both']),
    limit: z.number(),
    offset: z.number(),
    callers: z.array(SymbolHitSchema).optional(),
    totalCallers: z.number().optional(),
    hasMoreCallers: z.boolean().optional(),
    callees: z.array(SymbolHitSchema).optional(),
    totalCallees: z.number().optional(),
    hasMoreCallees: z.boolean().optional(),
    repoRoot: z.string().optional(),
  }),
]);

const FindPathOutputSchema = z.union([
  z.object({
    found: z.literal(false),
    from: SymbolHitSchema,
    to: SymbolHitSchema,
    message: z.string(),
  }),
  z.object({
    found: z.literal(true),
    from: SymbolHitSchema,
    to: SymbolHitSchema,
    path: z.array(SymbolHitSchema),
    length: z.number(),
    repoRoot: z.string().optional(),
  }),
]);

const ImpactOutputSchema = z.union([
  AmbiguousSchema,
  z.object({
    symbol: SymbolHitSchema,
    affectedFiles: z.array(
      z.object({
        filePath: z.string(),
        symbols: z.array(
          z.object({
            name: z.string(),
            kind: z.string(),
            lineStart: z.number(),
          })
        ),
      })
    ),
    totalAffectedNodes: z.number(),
    totalAffectedFiles: z.number(),
    depth: z.number(),
    confidence: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
    repoRoot: z.string().optional(),
  }),
]);

const ExplainArchitectureOutputSchema = z.object({
  repository: z.object({
    repositoryId: z.string(),
    name: z.string(),
  }),
  entryPoints: z.array(SymbolHitSchema),
  modules: z.record(
    z.string(),
    z.object({
      nodeCount: z.number(),
      topSymbols: z.array(z.string()),
    })
  ),
  keyAbstractions: z.array(SymbolHitSchema),
  repoRoot: z.string().optional(),
});

const ListRepositoriesOutputSchema = z.object({
  repositories: z.array(
    z.object({
      repositoryId: z.string(),
      name: z.string(),
      path: z.string(),
      fileCount: z.number(),
      nodeCount: z.number(),
      edgeCount: z.number(),
      languages: z.record(z.string(), z.number()),
      isWatched: z.boolean(),
      lastIndexedAt: z.string().optional(),
      status: z.enum(['empty', 'watching', 'indexed']),
    })
  ),
  total: z.number(),
  hint: z.string().optional(),
});

const MemoryUpdateOutputSchema = z.union([
  MemoryViewSchema,
  z.object({ id: z.string() }),
  z.object({ recorded: z.literal(false) }),
  z.object({
    recorded: z.literal(true),
    id: z.string(),
    memoryA: z.string(),
    memoryB: z.string(),
    kind: z.string(),
    detectedAt: z.string(),
  }),
]);

export interface McpToolSpec {
  name: string;
  description: string;
  compactDescription: string;
  title?: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  input: z.ZodType;
  output: z.ZodType;
}

export const MCP_TOOLS: readonly McpToolSpec[] = [
  {
    name: 'index_repository',
    title: 'Index repository',
    description:
      'Index a codebase into the graph. Parses all source files, builds dependency graph, and persists to storage. Returns as soon as the job is accepted.',
    compactDescription:
      'Index codebase. Parse files, build graph, persist. Returns when the job is accepted; watch stays available.',
    input: IndexRepositoryInputSchema,
    output: IndexAcceptedSchema,
  },
  {
    name: 'watch_directory',
    title: 'Watch directory',
    description:
      'Start or stop watching a directory for file changes. Set enabled=false to stop watching.',
    compactDescription:
      'Watch dir for changes (enabled=true) or stop (enabled=false). Auto re-indexes on save.',
    input: WatchDirectoryInputSchema,
    output: WatchOutputSchema,
  },
  {
    name: 'list_repositories',
    title: 'List repositories',
    description: 'List all indexed repositories with statistics.',
    compactDescription: 'List indexed repos + stats. Check this first; if empty, call index_repository.',
    annotations: readOnly,
    input: z.object({}),
    output: ListRepositoriesOutputSchema,
  },
  {
    name: 'delete_repository',
    title: 'Delete repository',
    description: 'Delete a repository and all its data from the index.',
    compactDescription: 'Delete repo + all data from index.',
    annotations: { destructiveHint: true },
    input: DeleteRepositoryInputSchema,
    output: DeleteOutputSchema,
  },
  {
    name: 'find_symbol',
    title: 'Find symbol',
    description: 'Search for symbols by name with optional filtering.',
    compactDescription: 'Find symbols by name/pattern. Optional kind filter.',
    annotations: readOnly,
    input: FindSymbolInputSchema,
    output: FindSymbolOutputSchema,
  },
  {
    name: 'find_references',
    title: 'Find references',
    description:
      'Find incoming (callers), outgoing (callees), or both reference directions for a symbol.',
    compactDescription: 'Symbol references: direction in|out|both (callers/callees).',
    annotations: readOnly,
    input: FindReferencesInputSchema,
    output: FindReferencesOutputSchema,
  },
  {
    name: 'find_path',
    title: 'Find path',
    description: 'Find the shortest dependency path between two symbols.',
    compactDescription: 'Shortest dependency path between two symbols.',
    annotations: readOnly,
    input: FindPathInputSchema,
    output: FindPathOutputSchema,
  },
  {
    name: 'get_impact_radius',
    title: 'Impact radius',
    description:
      'Analyze the blast radius of changing a symbol. Returns affected files and the symbols in each file.',
    compactDescription: 'Blast radius of changing a symbol. Returns affected files + symbols.',
    annotations: readOnly,
    input: GetImpactRadiusInputSchema,
    output: ImpactOutputSchema,
  },
  {
    name: 'explain_architecture',
    title: 'Explain architecture',
    description:
      'Generate a high-level architectural summary of a repository: entry points, modules, key abstractions.',
    compactDescription: 'High-level repo summary: entry points, modules, key abstractions.',
    annotations: readOnly,
    input: ExplainArchitectureInputSchema,
    output: ExplainArchitectureOutputSchema,
  },
  {
    name: 'semantic_search',
    title: 'Semantic search',
    description:
      'Semantic vector search using LLM embeddings. Good for conceptual queries like "how do we handle authentication?"',
    compactDescription: 'Vector search. Use for conceptual queries ("how does auth work?").',
    annotations: readOnly,
    input: SemanticSearchInputSchema,
    output: SearchOutputSchema,
  },
  {
    name: 'exact_search',
    title: 'Exact search',
    description: 'BM25 full-text search for exact matches. Good for finding specific symbols or text.',
    compactDescription: 'BM25 full-text search. Use for exact symbol/text matches.',
    annotations: readOnly,
    input: ExactSearchInputSchema,
    output: SearchOutputSchema,
  },
  {
    name: 'hybrid_search',
    title: 'Hybrid search',
    description: 'Combined vector + BM25 search with Reciprocal Rank Fusion.',
    compactDescription: 'BM25 + vector search with RRF fusion. Best default search.',
    annotations: readOnly,
    input: HybridSearchInputSchema,
    output: SearchOutputSchema,
  },
  {
    name: 'find_dead_code',
    title: 'Find dead code',
    description: 'Find unreferenced symbols (functions, methods, classes with zero incoming edges).',
    compactDescription: 'Find unreferenced symbols (zero incoming edges).',
    annotations: readOnly,
    input: FindDeadCodeInputSchema,
    output: z.object({ results: z.array(DeadCodeHitSchema), ...PageSchema }),
  },
  {
    name: 'find_complex_functions',
    title: 'Find complex functions',
    description: 'Find the most complex functions in the codebase, ranked by cyclomatic complexity.',
    compactDescription: 'Most complex functions ranked by cyclomatic complexity.',
    annotations: readOnly,
    input: FindComplexFunctionsInputSchema,
    output: z.object({ results: z.array(ComplexHitSchema), ...PageSchema }),
  },
  {
    name: 'memory_remember',
    title: 'Memory remember',
    description:
      'Persist an engineering memory (decision/failure/intent/gap/ownership/note) for later recall.',
    compactDescription:
      'Persist engineering memory (decision/failure/intent/gap/ownership/note). Shared across clients.',
    input: MemoryRememberInputSchema,
    output: z.object({ id: z.string() }),
  },
  {
    name: 'memory_recall',
    title: 'Memory recall',
    description: 'Recall a stored memory by id, or memories linked to a code entity.',
    compactDescription: 'Recall memory by id, or memories linked to an entity.',
    annotations: readOnly,
    input: MemoryRecallInputSchema,
    output: z.object({
      memory: MemoryViewSchema.extend({ body: z.string() }).nullable(),
      provenance: z.array(ProvenanceSchema).optional(),
      results: z.array(MemoryViewSchema).optional(),
    }),
  },
  {
    name: 'memory_search',
    title: 'Memory search',
    description: 'Search engineering memories by meaning and text, ranked by relevance, confidence, and freshness.',
    compactDescription: 'Search memories by meaning + text. Ranked by relevance/confidence/freshness.',
    annotations: readOnly,
    input: MemorySearchInputSchema,
    output: z.object({ results: z.array(MemoryViewSchema) }),
  },
  {
    name: 'why_was_this_chosen',
    title: 'Why chosen',
    description:
      'Explain architectural decisions for a topic or entity: rationale, alternatives, and tradeoffs.',
    compactDescription: 'Decisions for topic/entity: rationale, alternatives, tradeoffs. Empty list if none.',
    annotations: readOnly,
    input: WhyWasThisChosenInputSchema,
    output: z.object({ results: z.array(DecisionHitSchema) }),
  },
  {
    name: 'have_we_tried_this',
    title: 'Have we tried this',
    description: 'Check whether an approach was already attempted and failed, including lessons learned.',
    compactDescription: 'Past failures similar to an approach, with lessons. Empty list if none.',
    annotations: readOnly,
    input: HaveWeTriedThisInputSchema,
    output: z.object({ results: z.array(FailureHitSchema) }),
  },
  {
    name: 'who_knows',
    title: 'Who knows',
    description: 'Find who knows or owns a file, service, or symbol, ranked by signal volume and recency.',
    compactDescription: 'Who owns a file/service/symbol. People ranked by signal volume + recency.',
    annotations: readOnly,
    input: WhoKnowsInputSchema,
    output: z.object({
      results: z.array(
        z.object({
          personId: z.string(),
          displayName: z.string(),
          score: z.number(),
          signalCount: z.number(),
          lastActivityAt: z.string(),
        })
      ),
    }),
  },
  {
    name: 'memory_update',
    title: 'Memory update',
    description: 'Update memory state: verify, reinforce, or flag_contradiction between two memories.',
    compactDescription: 'Verify, reinforce, or flag_contradiction on memories.',
    input: MemoryUpdateInputSchema,
    output: MemoryUpdateOutputSchema,
  },
  {
    name: 'track_intent',
    title: 'Track intent',
    description: 'Track an active engineering goal. Active intents bias memory retrieval toward advancing them.',
    compactDescription: 'Track an active goal/intent. Biases retrieval toward advancing it.',
    input: TrackIntentInputSchema,
    output: z.object({
      id: z.string(),
      memoryId: z.string(),
      goal: z.string(),
      category: z.string(),
      status: z.enum(['active', 'achieved', 'abandoned']),
      priority: z.number(),
      targetDate: z.string().nullable(),
    }),
  },
  {
    name: 'list_active_goals',
    title: 'List active goals',
    description: 'List active engineering goals for a repository, highest priority first.',
    compactDescription: 'List active goals/intents, highest priority first.',
    annotations: readOnly,
    input: ListActiveGoalsInputSchema,
    output: z.object({
      results: z.array(
        z.object({
          memoryId: z.string(),
          goal: z.string(),
          category: z.string(),
          status: z.enum(['active', 'achieved', 'abandoned']),
          priority: z.number(),
          targetDate: z.string().nullable(),
        })
      ),
    }),
  },
  {
    name: 'show_evolution',
    title: 'Show evolution',
    description: 'Chronological evolution (decisions, failures, diffs) for a topic or entity.',
    compactDescription: 'Chronological evolution (decisions, failures, diffs) for topic/entity. Paginated.',
    annotations: readOnly,
    input: ShowEvolutionInputSchema,
    output: z.object({
      entries: z.array(
        z.object({
          kind: z.enum(['decision', 'failure', 'diff']),
          id: z.string(),
          title: z.string(),
          occurredAt: z.string(),
          details: z.record(z.string(), z.unknown()).optional(),
        })
      ),
      total: z.number(),
    }),
  },
  {
    name: 'find_knowledge_gaps',
    title: 'Find knowledge gaps',
    description: 'Rank under-documented, weakly-owned, complex, high-churn hotspots by risk.',
    compactDescription: 'Rank under-documented, weakly-owned, complex, high-churn hotspots by risk.',
    annotations: readOnly,
    input: FindKnowledgeGapsInputSchema,
    output: z.object({
      gaps: z.array(
        z.object({
          repositoryId: z.string(),
          entityRef: z.string(),
          entityType: z.string(),
          complexity: z.number(),
          ownershipStrength: z.number(),
          missingDocs: z.boolean(),
          churn: z.number(),
          riskScore: z.number(),
          reasons: z.array(z.string()),
        })
      ),
      total: z.number(),
    }),
  },
  {
    name: 'detect_drift',
    title: 'Detect drift',
    description: 'Detect architecture drift against declared rules: forbidden dependencies, layer violations, naming violations.',
    compactDescription: 'Detect architecture drift (forbidden deps, layer/naming violations) vs declared rules.',
    annotations: readOnly,
    input: DetectDriftInputSchema,
    output: z.object({
      violations: z.array(
        z.object({
          ruleId: z.string(),
          ruleType: z.enum(['layer', 'allowed_dep', 'forbidden_dep', 'naming']),
          fromRef: z.string(),
          toRef: z.string().optional(),
          explanation: z.string(),
        })
      ),
      total: z.number(),
    }),
  },
  {
    name: 'simulate_impact',
    title: 'Simulate impact',
    description:
      'Simulate the blast radius of a change: affected entities, owners to notify, and rule violations introduced.',
    compactDescription: 'Simulate change blast radius: affected entities, owners to notify, rule violations.',
    annotations: readOnly,
    input: SimulateImpactInputSchema,
    output: z.object({
      target: z.object({ ref: z.string(), label: z.string() }),
      op: z.enum(['delete', 'rename', 'interface-removal', 'dependency-removal']),
      affected: z.array(
        z.object({
          ref: z.string(),
          label: z.string(),
          depth: z.number(),
        })
      ),
      ownersToNotify: z.array(
        z.object({
          personId: z.string(),
          displayName: z.string(),
          score: z.number(),
        })
      ),
      violationsIntroduced: z.array(
        z.object({
          ruleId: z.string(),
          ruleType: z.enum(['layer', 'allowed_dep', 'forbidden_dep', 'naming']),
          fromRef: z.string(),
          toRef: z.string().optional(),
          explanation: z.string(),
        })
      ),
      summary: z.string(),
    }),
  },
];

export const EML_MCP_TOOL_NAMES = new Set<string>([
  'memory_remember',
  'memory_recall',
  'memory_search',
  'why_was_this_chosen',
  'have_we_tried_this',
  'who_knows',
  'memory_update',
  'track_intent',
  'list_active_goals',
  'show_evolution',
  'find_knowledge_gaps',
  'detect_drift',
  'simulate_impact',
]);

export type ContextSimploToolset = 'core' | 'full';

export interface AdvertisedTool {
  name: string;
  description: string;
  title?: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

function advertise(spec: McpToolSpec, responseMode: 'full' | 'compact' | 'toon'): AdvertisedTool {
  return {
    name: spec.name,
    title: spec.title,
    description: responseMode === 'full' ? spec.description : spec.compactDescription,
    ...(spec.annotations ? { annotations: spec.annotations } : {}),
    inputSchema: z.toJSONSchema(spec.input) as Record<string, unknown>,
    outputSchema: z.toJSONSchema(spec.output) as Record<string, unknown>,
  };
}

export function toolSpecs(toolset: ContextSimploToolset = 'core'): readonly McpToolSpec[] {
  if (toolset === 'full') {
    return MCP_TOOLS;
  }
  return MCP_TOOLS.filter((tool) => !EML_MCP_TOOL_NAMES.has(tool.name));
}

export function resolveToolDefinitions(
  responseMode: 'full' | 'compact' | 'toon',
  toolset: ContextSimploToolset = 'core'
): AdvertisedTool[] {
  return toolSpecs(toolset).map((spec) => advertise(spec, responseMode));
}
