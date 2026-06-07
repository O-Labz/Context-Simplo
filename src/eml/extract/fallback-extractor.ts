/**
 * Deterministic fallback extractor.
 *
 * Used when `EML_EXTRACTION !== 'llm'` or when no LLM chat provider is
 * available. Derives memory facts purely from the structural delta, so the
 * results are reproducible and diff-grounded (high provenance, moderate
 * confidence — no inference beyond what the diff states).
 */

import type { EmlEvent } from '../events/types.js';
import { extractDelta } from './candidate.js';
import type { ExtractionResult, ExtractedMemory } from './types.js';

const DIFF_CONFIDENCE = 0.6;

export function extract(event: EmlEvent): ExtractionResult {
  const delta = extractDelta(event);
  const memories: ExtractedMemory[] = [];

  for (const dep of delta.addedDependencies ?? []) {
    memories.push({
      kind: 'decision',
      title: `Added dependency ${dep}`,
      summary: `Dependency \`${dep}\` was introduced.`,
      body: `The change added \`${dep}\` to the project's dependencies.`,
      confidence: DIFF_CONFIDENCE,
      entityRefs: [{ kind: 'dependency', ref: dep }],
    });
  }

  for (const dep of delta.removedDependencies ?? []) {
    memories.push({
      kind: 'decision',
      title: `Removed dependency ${dep}`,
      summary: `Dependency \`${dep}\` was removed.`,
      body: `The change removed \`${dep}\` from the project's dependencies.`,
      confidence: DIFF_CONFIDENCE,
      entityRefs: [{ kind: 'dependency', ref: dep }],
    });
  }

  for (const file of delta.deletedFiles ?? []) {
    memories.push({
      kind: 'note',
      title: `Deleted file ${file}`,
      summary: `File \`${file}\` was deleted.`,
      body: `The change deleted \`${file}\`.`,
      confidence: DIFF_CONFIDENCE,
      entityRefs: [{ kind: 'file', ref: file }],
    });
  }

  for (const sym of [...(delta.changedSymbols ?? []), ...(delta.removedSymbols ?? [])]) {
    if (sym.kind !== 'interface' && sym.kind !== 'type') continue;
    memories.push({
      kind: 'decision',
      title: `Interface change: ${sym.name}`,
      summary: `The ${sym.kind} \`${sym.name}\` changed.`,
      body: `A breaking-prone change touched the ${sym.kind} \`${sym.name}\`.`,
      confidence: DIFF_CONFIDENCE,
      entityRefs: [{ kind: 'symbol', ref: sym.name }],
    });
  }

  for (const violation of delta.layerViolations ?? []) {
    memories.push({
      kind: 'decision',
      title: `Layer boundary crossed: ${violation}`,
      summary: `A layer boundary was crossed (${violation}).`,
      body: `The change introduced a cross-layer reference: ${violation}.`,
      confidence: DIFF_CONFIDENCE,
      entityRefs: [],
    });
  }

  return { memories };
}
