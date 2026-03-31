/**
 * Core type definitions for Context-Simplo
 *
 * This module defines all domain types with Zod schemas for runtime validation.
 * All types are immutable by design (readonly fields).
 */

import { z } from 'zod';

export const NodeKindSchema = z.enum([
  'function',
  'method',
  'class',
  'interface',
  'type',
  'variable',
  'constant',
  'import',
  'export',
  'module',
  'namespace',
]);

export type NodeKind = z.infer<typeof NodeKindSchema>;

export const EdgeKindSchema = z.enum([
  'calls',
  'called_by',
  'imports',
  'imported_by',
  'extends',
  'extended_by',
  'implements',
  'implemented_by',
  'contains',
  'contained_by',
  'references',
  'referenced_by',
]);

export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const VisibilitySchema = z.enum(['public', 'private', 'protected', 'internal']);

export type Visibility = z.infer<typeof VisibilitySchema>;

export const CodeNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  qualifiedName: z.string(),
  kind: NodeKindSchema,
  filePath: z.string(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  columnStart: z.number().int().nonnegative().optional(),
  columnEnd: z.number().int().nonnegative().optional(),
  visibility: VisibilitySchema.optional(),
  isExported: z.boolean().optional(),
  docstring: z.string().optional(),
  complexity: z.number().int().nonnegative().optional(),
  repositoryId: z.string(),
  language: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CodeNode = z.infer<typeof CodeNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  kind: EdgeKindSchema,
  confidence: z.number().min(0).max(1),
  repositoryId: z.string(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const FileMetadataSchema = z.object({
  path: z.string(),
  repositoryId: z.string(),
  hash: z.string(),
  mtime: z.number().int().positive(),
  size: z.number().int().nonnegative(),
  language: z.string().optional(),
  nodeCount: z.number().int().nonnegative(),
  status: z.enum(['pending', 'indexing', 'indexed', 'error']),
  lastError: z.string().optional(),
  retryCount: z.number().int().nonnegative(),
  indexedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type FileMetadata = z.infer<typeof FileMetadataSchema>;

export const IndexJobSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  type: z.enum(['full', 'incremental', 'file']),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  filesTotal: z.number().int().nonnegative(),
  filesProcessed: z.number().int().nonnegative(),
  filesFailed: z.number().int().nonnegative(),
  nodesCreated: z.number().int().nonnegative(),
  edgesCreated: z.number().int().nonnegative(),
  embeddingsGenerated: z.number().int().nonnegative(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  error: z.string().optional(),
  estimatedDuration: z.number().int().positive().optional(),
});

export type IndexJob = z.infer<typeof IndexJobSchema>;

export const RepositoryInfoSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  fileCount: z.number().int().nonnegative(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  languages: z.record(z.number().int().nonnegative()),
  isWatched: z.boolean(),
  lastIndexedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RepositoryInfo = z.infer<typeof RepositoryInfoSchema>;

export const SearchResultSchema = z.object({
  nodeId: z.string(),
  name: z.string(),
  qualifiedName: z.string(),
  kind: NodeKindSchema,
  filePath: z.string(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  score: z.number().min(0).max(1),
  snippet: z.string().optional(),
  language: z.string(),
  repositoryId: z.string(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    results: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  });

export type PaginatedResponse<T> = {
  results: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export const NodeFilterSchema = z.object({
  kind: NodeKindSchema.optional(),
  language: z.string().optional(),
  repositoryId: z.string().optional(),
  filePath: z.string().optional(),
  visibility: VisibilitySchema.optional(),
  namePattern: z.string().optional(),
});

export type NodeFilter = z.infer<typeof NodeFilterSchema>;

export const EmbeddingChunkSchema = z.object({
  id: z.string(),
  nodeId: z.string().optional(),
  filePath: z.string(),
  repositoryId: z.string(),
  content: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  language: z.string(),
  symbolContext: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  createdAt: z.date(),
});

export type EmbeddingChunk = z.infer<typeof EmbeddingChunkSchema>;

export const ConfigSourceSchema = z.enum(['env', 'dashboard', 'default']);

export type ConfigSource = z.infer<typeof ConfigSourceSchema>;

export const LLMProviderTypeSchema = z.enum(['openai', 'ollama', 'azure', 'none']);

export type LLMProviderType = z.infer<typeof LLMProviderTypeSchema>;

export const ConfigValueSchema = z.object({
  value: z.unknown(),
  source: ConfigSourceSchema,
  isLocked: z.boolean(),
});

export type ConfigValue<T> = {
  value: T;
  source: ConfigSource;
  isLocked: boolean;
};

export const AppConfigSchema = z.object({
  llmProvider: z.object({
    value: LLMProviderTypeSchema,
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
  llmApiKey: z.object({
    value: z.string().optional(),
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
  llmBaseUrl: z.object({
    value: z.string().url().optional(),
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
  llmEmbeddingModel: z.object({
    value: z.string().optional(),
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
  dataDir: z.object({
    value: z.string(),
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
  autoIndex: z.object({
    value: z.boolean(),
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
  watchEnabled: z.object({
    value: z.boolean(),
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
  logLevel: z.object({
    value: z.enum(['error', 'warn', 'info', 'debug']),
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
  embeddingConcurrency: z.object({
    value: z.number().int().positive(),
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
  embeddingBatchSize: z.object({
    value: z.number().int().positive(),
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
  graphMemoryLimitMb: z.object({
    value: z.number().int().positive(),
    source: ConfigSourceSchema,
    isLocked: z.boolean(),
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  uptime: z.number().int().nonnegative(),
  memory: z.object({
    heapUsed: z.number().int().nonnegative(),
    heapTotal: z.number().int().nonnegative(),
    rss: z.number().int().nonnegative(),
    graphMemory: z.number().int().nonnegative(),
  }),
  graph: z.object({
    nodeCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative(),
  }),
  storage: z.object({
    sqliteSize: z.number().int().nonnegative(),
    lancedbSize: z.number().int().nonnegative(),
    totalSize: z.number().int().nonnegative(),
  }),
  llm: z.object({
    connected: z.boolean(),
    provider: LLMProviderTypeSchema,
    model: z.string().optional(),
  }),
  timestamp: z.date(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
