/**
 * MCP tool definitions with Zod schemas
 *
 * Defines MCP tools exposed to AI assistants (filtered by CONTEXT_SIMPLO_TOOLSET).
 * Each tool has a name, description, and input schema validated with Zod.
 */

import { z } from 'zod';

export const IndexRepositoryInputSchema = z.object({
  path: z.string().describe('Repository path to index (relative to /workspace)'),
  incremental: z.boolean().optional().describe('Only re-index changed files'),
});

export const WatchDirectoryInputSchema = z.object({
  path: z.string().describe('Directory path to watch for changes'),
  enabled: z
    .boolean()
    .optional()
    .default(true)
    .describe('When false, stop watching (replaces unwatch_directory)'),
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
  filePath: z.string().optional().describe('Disambiguate when multiple symbols share a name'),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
});

export const FindCalleesInputSchema = z.object({
  symbolName: z.string().describe('Symbol name to find callees for'),
  filePath: z.string().optional().describe('Disambiguate when multiple symbols share a name'),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
});

export const FindReferencesInputSchema = z.object({
  symbolName: z.string().describe('Symbol name to find references for'),
  direction: z
    .enum(['in', 'out', 'both'])
    .optional()
    .default('both')
    .describe('in=callers, out=callees, both=callers and callees'),
  filePath: z.string().optional().describe('Disambiguate when multiple symbols share a name'),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
});

export const FindPathInputSchema = z.object({
  fromSymbol: z.string().describe('Source symbol name'),
  toSymbol: z.string().describe('Target symbol name'),
});

export const GetImpactRadiusInputSchema = z.object({
  symbolName: z.string().describe('Symbol to analyze impact for'),
  filePath: z.string().optional().describe('Disambiguate when multiple symbols share a name'),
  maxDepth: z.number().int().min(1).max(20).optional().default(10).describe('Maximum traversal depth'),
  limit: z.number().int().min(1).max(200).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
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
  repositoryId: z.string().optional().describe('Filter by repository ID'),
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
  parameters: z.record(z.string(), z.unknown()).optional().describe('Query parameters'),
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

export const MemoryUpdateInputSchema = z
  .object({
    action: z.enum(['verify', 'reinforce', 'flag_contradiction']),
    repositoryId: RepositoryIdSchema,
    id: z.string().min(1).max(128).optional().describe('Memory id (verify/reinforce)'),
    memoryA: z.string().min(1).max(128).optional().describe('First memory id (flag_contradiction)'),
    memoryB: z.string().min(1).max(128).optional().describe('Second memory id (flag_contradiction)'),
    kind: z.string().min(1).max(64).optional().describe('Contradiction kind'),
  })
  .superRefine((v, ctx) => {
    if (v.action === 'flag_contradiction') {
      if (!v.memoryA) {
        ctx.addIssue({ code: 'custom', path: ['memoryA'], message: 'memoryA is required for flag_contradiction' });
      }
      if (!v.memoryB) {
        ctx.addIssue({ code: 'custom', path: ['memoryB'], message: 'memoryB is required for flag_contradiction' });
      }
    } else if (!v.id) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: `id is required for ${v.action}` });
    }
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

export const SimulateImpactInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
  op: z.enum(['delete', 'rename', 'interface-removal', 'dependency-removal']),
  targetRef: z.string().min(1),
  newRef: z.string().min(1).optional(),
});

export const AddArchitectureRuleInputSchema = z.object({
  repositoryId: RepositoryIdSchema,
  ruleType: z.enum(['layer', 'allowed_dep', 'forbidden_dep', 'naming']),
  spec: z.unknown(),
  source: z.enum(['declared', 'inferred']).optional().default('declared'),
});
