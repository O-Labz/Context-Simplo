/**
 * Commit-message cross-check.
 *
 * Compares a prose claim (commit/PR message) against the observed structural
 * delta. Prose is never trusted on its own: when the claim contradicts the diff
 * we emit `message_mismatch.detected` and downgrade the prose provenance weight
 * so downstream extraction trusts the diff over the words.
 */

import type { EventStore } from '../events/store.js';
import type { StructuralDelta } from '../extract/candidate.js';

export const TRUSTED_PROSE_WEIGHT = 1.0;
export const DISTRUSTED_PROSE_WEIGHT = 0.2;

export interface CrossCheckResult {
  mismatches: string[];
  proseWeight: number;
}

function hasAdditions(delta: StructuralDelta): boolean {
  return (
    (delta.addedSymbols?.length ?? 0) > 0 ||
    (delta.addedDependencies?.length ?? 0) > 0 ||
    (delta.addedFiles?.length ?? 0) > 0
  );
}

function hasRemovals(delta: StructuralDelta): boolean {
  return (
    (delta.removedSymbols?.length ?? 0) > 0 ||
    (delta.removedDependencies?.length ?? 0) > 0 ||
    (delta.deletedFiles?.length ?? 0) > 0
  );
}

/**
 * Pure cross-check. Returns any contradictions plus the provenance weight the
 * prose should carry.
 */
export function crossCheck(message: string, delta: StructuralDelta): CrossCheckResult {
  const mismatches: string[] = [];
  const lower = message.toLowerCase();

  const claimsRemoval = /\b(remove[ds]?|delete[ds]?|drop(?:ped|s)?|deprecate[ds]?)\b/.test(lower);
  const claimsAddition = /\b(add(?:ed|s)?|introduce[ds]?|create[ds]?|implement(?:ed|s)?)\b/.test(lower);

  if (claimsRemoval && !hasRemovals(delta)) {
    mismatches.push('message claims a removal but no removal was observed in the diff');
  }
  if (claimsAddition && !hasAdditions(delta)) {
    mismatches.push('message claims an addition but no addition was observed in the diff');
  }

  return {
    mismatches,
    proseWeight: mismatches.length > 0 ? DISTRUSTED_PROSE_WEIGHT : TRUSTED_PROSE_WEIGHT,
  };
}

export class MessageChecker {
  private readonly eventStore: EventStore;

  constructor(eventStore: EventStore) {
    this.eventStore = eventStore;
  }

  /**
   * Run the cross-check and, on contradiction, emit `message_mismatch.detected`.
   * Returns the result so callers can apply the prose weight to provenance.
   */
  check(
    repositoryId: string,
    sourceRef: string,
    message: string,
    delta: StructuralDelta
  ): CrossCheckResult {
    const result = crossCheck(message, delta);
    if (result.mismatches.length > 0) {
      this.eventStore.append({
        type: 'message_mismatch.detected',
        source: 'diff_observer',
        sourceRef,
        repositoryId,
        payload: {
          message,
          mismatches: result.mismatches,
          proseWeight: result.proseWeight,
          delta,
        },
      });
    }
    return result;
  }
}
