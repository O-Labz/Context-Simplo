/**
 * MCP Structural Query Tool Handlers
 *
 * Implements: find_symbol, find_callers, find_callees, find_path,
 * get_impact_radius, explain_architecture
 */

import {
  FindSymbolInputSchema,
  FindCallersInputSchema,
  FindCalleesInputSchema,
  FindPathInputSchema,
  GetImpactRadiusInputSchema,
  ExplainArchitectureInputSchema,
} from '../tools.js';
import type { HandlerContext } from './indexing.js';
import { NotFoundError } from '../../core/errors.js';

export async function findSymbol(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = FindSymbolInputSchema.parse(args);

  const nodes = context.graph.findByPattern(input.name, {
    kind: input.kind,
  });

  const offset = input.offset || 0;
  const limit = input.limit || 20;
  const paginatedNodes = nodes.slice(offset, offset + limit);

  return {
    results: paginatedNodes.map((node) => ({
      id: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      kind: node.kind,
      filePath: node.filePath,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
      visibility: node.visibility,
      isExported: node.isExported,
      language: node.language,
      repositoryId: node.repositoryId,
    })),
    total: nodes.length,
    limit,
    offset,
    hasMore: offset + limit < nodes.length,
  };
}

export async function findCallers(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = FindCallersInputSchema.parse(args);

  const nodes = context.graph.findByName(input.symbolName);
  if (nodes.length === 0) {
    throw new NotFoundError('Symbol', input.symbolName);
  }

  const targetNode = nodes[0];
  if (!targetNode) {
    throw new NotFoundError('Symbol', input.symbolName);
  }

  const callers = context.graph.getCallers(targetNode.id);

  const offset = input.offset || 0;
  const limit = input.limit || 20;
  const paginatedCallers = callers.slice(offset, offset + limit);

  return {
    symbol: {
      id: targetNode.id,
      name: targetNode.name,
      qualifiedName: targetNode.qualifiedName,
      kind: targetNode.kind,
      filePath: targetNode.filePath,
    },
    callers: paginatedCallers.map((caller) => ({
      id: caller.id,
      name: caller.name,
      qualifiedName: caller.qualifiedName,
      kind: caller.kind,
      filePath: caller.filePath,
      lineStart: caller.lineStart,
      lineEnd: caller.lineEnd,
    })),
    total: callers.length,
    limit,
    offset,
    hasMore: offset + limit < callers.length,
  };
}

export async function findCallees(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = FindCalleesInputSchema.parse(args);

  const nodes = context.graph.findByName(input.symbolName);
  if (nodes.length === 0) {
    throw new NotFoundError('Symbol', input.symbolName);
  }

  const targetNode = nodes[0];
  if (!targetNode) {
    throw new NotFoundError('Symbol', input.symbolName);
  }

  const callees = context.graph.getCallees(targetNode.id);

  const offset = input.offset || 0;
  const limit = input.limit || 20;
  const paginatedCallees = callees.slice(offset, offset + limit);

  return {
    symbol: {
      id: targetNode.id,
      name: targetNode.name,
      qualifiedName: targetNode.qualifiedName,
      kind: targetNode.kind,
      filePath: targetNode.filePath,
    },
    callees: paginatedCallees.map((callee) => ({
      id: callee.id,
      name: callee.name,
      qualifiedName: callee.qualifiedName,
      kind: callee.kind,
      filePath: callee.filePath,
      lineStart: callee.lineStart,
      lineEnd: callee.lineEnd,
    })),
    total: callees.length,
    limit,
    offset,
    hasMore: offset + limit < callees.length,
  };
}

export async function findPath(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = FindPathInputSchema.parse(args);

  const fromNodes = context.graph.findByName(input.fromSymbol);
  const toNodes = context.graph.findByName(input.toSymbol);

  if (fromNodes.length === 0) {
    throw new NotFoundError('Symbol', input.fromSymbol);
  }
  if (toNodes.length === 0) {
    throw new NotFoundError('Symbol', input.toSymbol);
  }

  const fromNode = fromNodes[0];
  const toNode = toNodes[0];

  if (!fromNode || !toNode) {
    throw new NotFoundError('Symbol', 'from or to');
  }

  const path = context.graph.findShortestPath(fromNode.id, toNode.id);

  if (!path) {
    return {
      found: false,
      from: {
        name: fromNode.name,
        filePath: fromNode.filePath,
      },
      to: {
        name: toNode.name,
        filePath: toNode.filePath,
      },
      message: 'No path found between symbols',
    };
  }

  return {
    found: true,
    from: {
      name: fromNode.name,
      filePath: fromNode.filePath,
    },
    to: {
      name: toNode.name,
      filePath: toNode.filePath,
    },
    path: path.map((node) => ({
      id: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      kind: node.kind,
      filePath: node.filePath,
      lineStart: node.lineStart,
    })),
    length: path.length,
  };
}

export async function getImpactRadius(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = GetImpactRadiusInputSchema.parse(args);

  const nodes = context.graph.findByName(input.symbolName);
  if (nodes.length === 0) {
    throw new NotFoundError('Symbol', input.symbolName);
  }

  const targetNode = nodes[0];
  if (!targetNode) {
    throw new NotFoundError('Symbol', input.symbolName);
  }

  const impact = context.graph.analyzeImpact(targetNode.id, input.maxDepth || 10);

  return {
    symbol: {
      id: targetNode.id,
      name: targetNode.name,
      qualifiedName: targetNode.qualifiedName,
      kind: targetNode.kind,
      filePath: targetNode.filePath,
    },
    affectedNodes: impact.affectedNodes.map((node) => ({
      id: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      kind: node.kind,
      filePath: node.filePath,
      lineStart: node.lineStart,
    })),
    affectedFiles: Array.from(impact.affectedFiles),
    depth: impact.depth,
    confidence: impact.confidence,
    summary: {
      totalNodes: impact.affectedNodes.length,
      totalFiles: impact.affectedFiles.size,
      maxDepth: impact.depth,
    },
  };
}

export async function explainArchitecture(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = ExplainArchitectureInputSchema.parse(args);

  const repo = context.storage.getRepository(input.repositoryId);
  if (!repo) {
    throw new NotFoundError('Repository', input.repositoryId);
  }

  const architecture = context.graph.explainArchitecture(
    input.repositoryId,
    input.detailLevel || 1
  );

  return {
    repository: {
      id: repo.id,
      name: repo.name,
      path: repo.path,
    },
    entryPoints: architecture.entryPoints.map((node) => ({
      name: node.name,
      qualifiedName: node.qualifiedName,
      kind: node.kind,
      filePath: node.filePath,
      lineStart: node.lineStart,
    })),
    modules: Object.fromEntries(
      Array.from(architecture.modules.entries()).map(([path, nodes]) => [
        path,
        {
          nodeCount: nodes.length,
          topSymbols: nodes.slice(0, 5).map((n) => n.name),
        },
      ])
    ),
    keyAbstractions: architecture.keyAbstractions.map((node) => ({
      name: node.name,
      qualifiedName: node.qualifiedName,
      kind: node.kind,
      filePath: node.filePath,
    })),
    packageStructure: architecture.packageStructure,
  };
}
