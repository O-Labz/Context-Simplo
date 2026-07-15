/**
 * Cyclomatic complexity computation.
 *
 * The existing analysis surface reads `node.complexity`, which the indexer
 * never populates. This computes a real McCabe-style cyclomatic complexity from
 * source text: 1 + the number of independent decision points. It is a
 * language-agnostic approximation (counts the common branch keywords/operators)
 * and is deterministic.
 */

export interface ComplexityNodeLike {
  name?: string;
  startLine?: number;
  endLine?: number;
}

const DECISION_PATTERNS: RegExp[] = [
  /\bif\b/g,
  /\belse\s+if\b/g,
  /\bfor\b/g,
  /\bwhile\b/g,
  /\bcase\b/g,
  /\bcatch\b/g,
  /\b(?:and|or)\b/g, // python-style boolean ops
  /&&/g,
  /\|\|/g,
  /\?\?/g,
  /\?[^.]/g, // ternary (avoid optional-chaining `?.`)
];

/** Strip line/block comments and string literals to avoid false positives. */
function stripNoise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

/**
 * Compute cyclomatic complexity of a source fragment. Returns an integer >= 1.
 */
export function computeCyclomatic(source: string): number {
  if (!source || !source.trim()) return 1;
  const cleaned = stripNoise(source);
  let decisions = 0;
  for (const pattern of DECISION_PATTERNS) {
    const matches = cleaned.match(pattern);
    if (matches) decisions += matches.length;
  }
  return 1 + decisions;
}

/**
 * Complexity for a node given the full file source. Slices the node's line
 * range when available, otherwise scores the whole source.
 */
export function complexityOfNode(node: ComplexityNodeLike, source: string): number {
  if (node.startLine && node.endLine && node.endLine >= node.startLine) {
    const lines = source.split('\n').slice(node.startLine - 1, node.endLine);
    return computeCyclomatic(lines.join('\n'));
  }
  return computeCyclomatic(source);
}
