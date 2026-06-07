/**
 * Candidate detection gate.
 *
 * Cheap heuristic that decides whether an event is worth running through the
 * (expensive) extractor. Structural-delta signals are weighted first; prose
 * keywords are a weak secondary signal (the diff is the source of truth).
 */

import type { EmlEvent } from '../events/types.js';

export interface SymbolRef {
  name: string;
  kind: string;
}

/**
 * Normalized structural delta carried by ingestion events under `payload.delta`.
 */
export interface StructuralDelta {
  addedSymbols?: SymbolRef[];
  removedSymbols?: SymbolRef[];
  changedSymbols?: SymbolRef[];
  addedDependencies?: string[];
  removedDependencies?: string[];
  addedFiles?: string[];
  deletedFiles?: string[];
  linesChanged?: number;
  layerViolations?: string[];
  message?: string;
}

export interface CandidateResult {
  likely: boolean;
  signals: string[];
}

/** Event types that are eligible for extraction. */
const EXTRACTABLE_TYPES = new Set([
  'code.diff.observed',
  'conversation.ingested',
  'vcs.pr.observed',
  'vcs.issue.observed',
  'vcs.review.observed',
  'message_mismatch.detected',
]);

const LARGE_REWRITE_LINES = 300;

const PROSE_KEYWORDS = [
  'because',
  'decided',
  'instead of',
  'revert',
  'failed',
  'failure',
  'bug',
  'workaround',
  'deprecat',
  'migrat',
  'rollback',
  'regression',
  'root cause',
  'tradeoff',
  'rejected',
];

export function extractDelta(event: EmlEvent): StructuralDelta {
  const payload = event.payload as Record<string, unknown>;
  const delta = (payload.delta ?? payload) as StructuralDelta;
  return delta ?? {};
}

export function detect(event: EmlEvent): CandidateResult {
  if (!EXTRACTABLE_TYPES.has(event.type)) {
    return { likely: false, signals: [] };
  }

  const delta = extractDelta(event);
  const signals: string[] = [];

  if (delta.addedDependencies && delta.addedDependencies.length > 0) signals.push('dependency_added');
  if (delta.removedDependencies && delta.removedDependencies.length > 0) signals.push('dependency_removed');
  if (
    (delta.changedSymbols ?? []).some((s) => s.kind === 'interface' || s.kind === 'type') ||
    (delta.removedSymbols ?? []).some((s) => s.kind === 'interface' || s.kind === 'type')
  ) {
    signals.push('interface_change');
  }
  if (delta.deletedFiles && delta.deletedFiles.length > 0) signals.push('file_deleted');
  if (delta.layerViolations && delta.layerViolations.length > 0) signals.push('layer_cross');
  if ((delta.linesChanged ?? 0) >= LARGE_REWRITE_LINES) signals.push('large_rewrite');

  const prose = (delta.message ?? (event.payload as Record<string, unknown>).message ?? '');
  if (typeof prose === 'string' && prose.length > 0) {
    const lower = prose.toLowerCase();
    if (PROSE_KEYWORDS.some((kw) => lower.includes(kw))) signals.push('prose_keyword');
  }

  return { likely: signals.length > 0, signals };
}
