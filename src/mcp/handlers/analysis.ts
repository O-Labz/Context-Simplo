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

  if (query.startsWith('match') && query.includes('function')) {
    const nodes = context.graph.getAllNodes({
      repositoryId: params.repositoryId as string,
    }).filter((node) => node.kind === 'function');

    return {
      query: input.query,
      parameters: params,
      results: nodes.slice(0, 100).map((node) => ({
        id: node.id,
        name: node.name,
        qualifiedName: node.qualifiedName,
        kind: node.kind,
        filePath: node.filePath,
        lineStart: node.lineStart,
        lineEnd: node.lineEnd,
      })),
      count: nodes.length,
    };
  }

  if (query.startsWith('match') && query.includes('class')) {
    const nodes = context.graph.getAllNodes({
      repositoryId: params.repositoryId as string,
    }).filter((node) => node.kind === 'class');

    return {
      query: input.query,
      parameters: params,
      results: nodes.slice(0, 100).map((node) => ({
        id: node.id,
        name: node.name,
        qualifiedName: node.qualifiedName,
        kind: node.kind,
        filePath: node.filePath,
        lineStart: node.lineStart,
        lineEnd: node.lineEnd,
      })),
      count: nodes.length,
    };
  }

  return {
    query: input.query,
    parameters: params,
    results: [],
    message: 'Cypher-like DSL supports: MATCH (n:function), MATCH (n:class)',
  };
}
