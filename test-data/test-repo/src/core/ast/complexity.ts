/**
 * Language-agnostic cyclomatic complexity computation.
 * 
 * Cyclomatic complexity = 1 + number of decision points (branches).
 */

const BRANCH_KEYWORDS = new Set([
  'if', 'for', 'while', 'case', 'catch',
  'elif', 'when', 'match', 'elsif', 'unless',
]);

const BRANCH_OPERATORS = ['&&', '||', '?'];

/**
 * Compute complexity from source by counting branch keywords and operators.
 */
export function computeComplexityFromSource(source: string): number {
  let branchCount = 0;

  // Count branch keywords (word boundaries)
  const keywordArray = Array.from(BRANCH_KEYWORDS);
  for (let i = 0; i < keywordArray.length; i++) {
    const keyword = keywordArray[i];
    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
    const matches = source.match(regex);
    if (matches) {
      branchCount += matches.length;
    }
  }

  // Count branch operators
  for (let i = 0; i < BRANCH_OPERATORS.length; i++) {
    const operator = BRANCH_OPERATORS[i];
    if (!operator) continue;
    const escaped = operator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    const matches = source.match(regex);
    if (matches) {
      branchCount += matches.length;
    }
  }

  return 1 + branchCount;
}
