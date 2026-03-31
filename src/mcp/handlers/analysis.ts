/**
 * MCP Analysis Tool Handlers
 *
 * Implements: find_dead_code, calculate_complexity, find_complex_functions,
 * lint_context, query_graph
 */

import {
  FindDeadCodeInputSchema,
  CalculateComplexityInputSchema,
  FindComplexFunctionsInputSchema,
  LintContextInputSchema,
  QueryGraphInputSchema,
} from '../tools.js';
import type { HandlerContext } from './indexing.js';
import { NotFoundError } from '../../core/errors.js';

export async function findDeadCode(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = FindDeadCodeInputSchema.parse(args);

  const deadNodes = context.graph.findDeadCode(input.repositoryId);

  const offset = input.offset || 0;
  const limit = input.limit || 20;
  const paginatedNodes = deadNodes.slice(offset, offset + limit);

  return {
    results: paginatedNodes.map((node) => ({
      id: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      kind: node.kind,
      filePath: node.filePath,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
      language: node.language,
    })),
    total: deadNodes.length,
    limit,
    offset,
    hasMore: offset + limit < deadNodes.length,
  };
}

export async function calculateComplexity(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = CalculateComplexityInputSchema.parse(args);

  const nodes = context.graph.findByName(input.symbolName);
  if (nodes.length === 0) {
    throw new NotFoundError('Symbol', input.symbolName);
  }

  const node = nodes[0];
  if (!node) {
    throw new NotFoundError('Symbol', input.symbolName);
  }

  return {
    symbol: {
      id: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      kind: node.kind,
      filePath: node.filePath,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
    },
    complexity: node.complexity || 1,
    rating:
      !node.complexity || node.complexity <= 5
        ? 'simple'
        : node.complexity <= 10
        ? 'moderate'
        : node.complexity <= 20
        ? 'complex'
        : 'very complex',
  };
}

export async function findComplexFunctions(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = FindComplexFunctionsInputSchema.parse(args);

  const allNodes = context.graph.getAllNodes({
    repositoryId: input.repositoryId,
  });

  const functionsWithComplexity = allNodes
    .filter((node) => node.kind === 'function' || node.kind === 'method')
    .filter((node) => node.complexity !== undefined)
    .sort((a, b) => (b.complexity || 0) - (a.complexity || 0));

  const offset = input.offset || 0;
  const limit = input.limit || 20;
  const paginatedFunctions = functionsWithComplexity.slice(offset, offset + limit);

  return {
    results: paginatedFunctions.map((node) => ({
      id: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      kind: node.kind,
      filePath: node.filePath,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
      complexity: node.complexity,
      language: node.language,
    })),
    total: functionsWithComplexity.length,
    limit,
    offset,
    hasMore: offset + limit < functionsWithComplexity.length,
  };
}

export async function lintContext(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = LintContextInputSchema.parse(args);

  const checks: Array<{ rule: string; passed: boolean; message: string }> = [];

  const fileNodes = context.graph.getAllNodes({
    repositoryId: input.repositoryId || 'default-repo',
  }).filter((node) => node.filePath === input.filePath);

  if (fileNodes.length === 0) {
    return {
      filePath: input.filePath,
      proposedChange: input.proposedChange,
      checks: [
        {
          rule: 'file_exists',
          passed: false,
          message: 'File not found in indexed repository',
        },
      ],
      passed: false,
    };
  }

  const fileLanguage = fileNodes[0]?.language || 'unknown';
  const proposedLower = input.proposedChange.toLowerCase();

  if (proposedLower.includes('any') && fileLanguage === 'typescript') {
    checks.push({
      rule: 'no_explicit_any',
      passed: false,
      message: 'TypeScript: Avoid using explicit "any" type',
    });
  }

  if (proposedLower.includes('console.log') || proposedLower.includes('print(')) {
    checks.push({
      rule: 'no_debug_statements',
      passed: false,
      message: 'Remove debug statements before committing',
    });
  }

  if (proposedLower.includes('todo') || proposedLower.includes('fixme')) {
    checks.push({
      rule: 'no_todos',
      passed: false,
      message: 'Resolve TODO/FIXME comments before committing',
    });
  }

  const passed = checks.every((check) => check.passed);

  return {
    filePath: input.filePath,
    proposedChange: input.proposedChange,
    checks,
    passed,
    message: passed ? 'All checks passed' : 'Some checks failed',
  };
}

export async function queryGraph(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = QueryGraphInputSchema.parse(args);

  const query = input.query.trim().toLowerCase();
  const params = input.parameters || {};
  const repoId = params.repositoryId as string | undefined;
  const limit = Math.min((params.limit as number) || 100, 500);

  const formatNodes = (nodes: any[]) =>
    nodes.slice(0, limit).map((node: any) => ({
      id: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      kind: node.kind,
      filePath: node.filePath,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
      language: node.language,
    }));

  // MATCH (n:kind) — filter by node kind
  const matchKindMatch = query.match(/match\s*\(\s*\w+\s*:\s*(\w+)\s*\)/);
  if (matchKindMatch?.[1]) {
    const kind = matchKindMatch[1];
    const validKinds = ['function', 'method', 'class', 'interface', 'type', 'variable', 'constant', 'import', 'export', 'module', 'namespace'];
    if (validKinds.includes(kind)) {
      const nodes = context.graph.getAllNodes({ repositoryId: repoId, kind: kind as any });
      return { query: input.query, parameters: params, results: formatNodes(nodes), count: nodes.length };
    }
  }

  // MATCH (n {name: "X"}) — find by name
  const matchNameMatch = query.match(/match\s*\(\s*\w+\s*\{\s*name\s*:\s*["']([^"']+)["']\s*\}\s*\)/);
  if (matchNameMatch?.[1]) {
    const nodes = context.graph.findByName(matchNameMatch[1], { repositoryId: repoId });
    return { query: input.query, parameters: params, results: formatNodes(nodes), count: nodes.length };
  }

  // MATCH (n) WHERE n.name =~ "pattern" — regex pattern match
  const matchPatternMatch = query.match(/where\s+\w+\.name\s*=~\s*["']([^"']+)["']/);
  if (matchPatternMatch?.[1]) {
    const nodes = context.graph.findByPattern(matchPatternMatch[1], { repositoryId: repoId });
    return { query: input.query, parameters: params, results: formatNodes(nodes), count: nodes.length };
  }

  // MATCH (n) WHERE n.filePath CONTAINS "path" — file filter
  const matchFileMatch = query.match(/where\s+\w+\.filepath\s+contains\s+["']([^"']+)["']/);
  if (matchFileMatch?.[1]) {
    const nodes = context.graph.getAllNodes({ repositoryId: repoId, filePath: matchFileMatch[1] });
    return { query: input.query, parameters: params, results: formatNodes(nodes), count: nodes.length };
  }

  // MATCH (n) WHERE n.language = "lang" — language filter
  const matchLangMatch = query.match(/where\s+\w+\.language\s*=\s*["']([^"']+)["']/);
  if (matchLangMatch?.[1]) {
    const nodes = context.graph.getAllNodes({ repositoryId: repoId, language: matchLangMatch[1] });
    return { query: input.query, parameters: params, results: formatNodes(nodes), count: nodes.length };
  }

  // MATCH (n)-->(m) — get callers/callees for a named node
  const matchRelMatch = query.match(/match\s*\(\s*\w+\s*\{\s*name\s*:\s*["']([^"']+)["']\s*\}\s*\)\s*-+>?\s*\(\s*\w+\s*\)/);
  if (matchRelMatch?.[1]) {
    const sourceNodes = context.graph.findByName(matchRelMatch[1], { repositoryId: repoId });
    const first = sourceNodes[0];
    if (first) {
      const callees = context.graph.getCallees(first.id, ['calls', 'imports', 'extends', 'implements', 'references']);
      return { query: input.query, parameters: params, results: formatNodes(callees), count: callees.length };
    }
  }

  // MATCH (m)-->(n) — get callers of a named node
  const matchInRelMatch = query.match(/match\s*\(\s*\w+\s*\)\s*-+>?\s*\(\s*\w+\s*\{\s*name\s*:\s*["']([^"']+)["']\s*\}\s*\)/);
  if (matchInRelMatch?.[1]) {
    const targetNodes = context.graph.findByName(matchInRelMatch[1], { repositoryId: repoId });
    const first = targetNodes[0];
    if (first) {
      const callers = context.graph.getCallers(first.id, ['calls', 'imports', 'extends', 'implements', 'references']);
      return { query: input.query, parameters: params, results: formatNodes(callers), count: callers.length };
    }
  }

  // MATCH (n:exported) — exported nodes only
  if (query.includes('exported') || query.includes('is_exported')) {
    const allNodes = context.graph.getAllNodes({ repositoryId: repoId })
      .filter(n => n.isExported);
    return { query: input.query, parameters: params, results: formatNodes(allNodes), count: allNodes.length };
  }

  // MATCH (n) — all nodes (no filter)
  if (query.startsWith('match') && !query.includes(':') && !query.includes('{') && !query.includes('where')) {
    const allNodes = context.graph.getAllNodes({ repositoryId: repoId });
    return { query: input.query, parameters: params, results: formatNodes(allNodes), count: allNodes.length };
  }

  // Fallback: try treating the query as a name pattern search
  const fallbackNodes = context.graph.findByPattern(input.query.replace(/[^a-zA-Z0-9_.*]/g, ''), { repositoryId: repoId });
  if (fallbackNodes.length > 0) {
    return { query: input.query, parameters: params, results: formatNodes(fallbackNodes), count: fallbackNodes.length };
  }

  return {
    query: input.query,
    parameters: params,
    results: [],
    count: 0,
    message: 'No results. Supported patterns: MATCH (n:kind), MATCH (n {name: "X"}), MATCH (n) WHERE n.name =~ "pattern", MATCH (n) WHERE n.filePath CONTAINS "path", MATCH (n) WHERE n.language = "lang", MATCH (n {name: "X"})-->(m), MATCH (m)-->(n {name: "X"}), MATCH (n:exported), MATCH (n)',
  };
}
