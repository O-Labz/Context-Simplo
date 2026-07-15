/**
 * Shared extraction contracts.
 *
 * Both the LLM extractor and the deterministic fallback produce an
 * `ExtractionResult`. The resolver consumes it identically regardless of source,
 * so the two paths stay interchangeable.
 */

import { z } from 'zod';
import { MemoryKindSchema } from '../store/memory-repo.js';

export const ExtractedEntityRefSchema = z.object({
  kind: z.enum(['file', 'symbol', 'dependency', 'service', 'pr', 'issue', 'person']),
  ref: z.string().min(1).max(512),
});

export const ExtractedMemorySchema = z.object({
  kind: MemoryKindSchema,
  title: z.string().min(1).max(200),
  summary: z.string().max(2000).default(''),
  body: z.string().max(20000).default(''),
  confidence: z.number().min(0).max(1).default(0.5),
  entityRefs: z.array(ExtractedEntityRefSchema).max(50).default([]),
});

export type ExtractedMemory = z.infer<typeof ExtractedMemorySchema>;

export const ExtractionResultSchema = z.object({
  memories: z.array(ExtractedMemorySchema).max(20).default([]),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
