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
  _context: HandlerContext
): Promise<unknown> {
  const input = LintContextInputSchema.parse(args);

  return {
    filePath: input.filePath,
    proposedChange: input.proposedChange,
    checks: [],
    passed: true,
    message: 'Lint context analysis will be implemented in Phase 9',
  };
}

export async function queryGraph(
  args: Record<string, unknown>,
  _context: HandlerContext
): Promise<unknown> {
  const input = QueryGraphInputSchema.parse(args);

  return {
    query: input.query,
    parameters: input.parameters,
    results: [],
    message: 'Graph query DSL will be implemented in Phase 9',
  };
}
