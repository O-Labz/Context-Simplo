/**
 * EML event types and validation schema.
 *
 * Events are the append-only backbone of the Engineering Memory Layer. Every
 * ingested change/conversation/PR/issue/agent-write becomes an event row in
 * `eml_events`. The worker bus dispatches them to subscribers.
 */

import { z } from 'zod';

/**
 * Known event topics. New types are appended to this union (additive only).
 */
export const EmlEventTypeSchema = z.enum([
  'code.changed',
  'code.diff.observed',
  'message_mismatch.detected',
  'git.author.observed',
  'memory.asserted',
  'conversation.ingested',
  'vcs.pr.observed',
  'vcs.issue.observed',
  'vcs.review.observed',
  'webhook.received',
  'vcs.fetch',
  'extraction.completed',
  'contradiction.detected',
  'drift.violation_detected',
  'score.recomputed',
  'ownership.recomputed',
  'gap.detected',
]);

export type EmlEventType = z.infer<typeof EmlEventTypeSchema>;

export const EmlEventSourceSchema = z.enum([
  'indexer',
  'diff_observer',
  'git',
  'webhook',
  'vcs',
  'conversation',
  'agent',
  'engine',
  'system',
]);

export type EmlEventSource = z.infer<typeof EmlEventSourceSchema>;

/**
 * Input accepted by the event store on append. `contentHash` is computed by the
 * store (never supplied by callers) so dedup is deterministic.
 */
export const EmlEventInputSchema = z.object({
  type: EmlEventTypeSchema,
  source: EmlEventSourceSchema,
  sourceRef: z.string().min(1).max(1024),
  repositoryId: z.string().min(1).max(128),
  actor: z.string().max(256).optional(),
  payload: z.record(z.unknown()),
  occurredAt: z.string().datetime().optional(),
});

export type EmlEventInput = z.infer<typeof EmlEventInputSchema>;

export type EmlEventStatus = 'pending' | 'processing' | 'done' | 'error';

/**
 * Persisted event row, hydrated from `eml_events`.
 */
export interface EmlEvent {
  id: string;
  type: EmlEventType;
  source: EmlEventSource;
  sourceRef: string;
  repositoryId: string;
  actor: string | null;
  payload: Record<string, unknown>;
  contentHash: string;
  occurredAt: string;
  ingestedAt: string;
  processedAt: string | null;
  status: EmlEventStatus;
  attempts: number;
  lastError: string | null;
}
