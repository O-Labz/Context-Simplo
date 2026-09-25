/**
 * MCP Structural Query Tool Handlers
 */

import {
  FindSymbolInputSchema,
  FindCallersInputSchema,
  FindCalleesInputSchema,
  FindReferencesInputSchema,
  FindPathInputSchema,
  GetImpactRadiusInputSchema,
  ExplainArchitectureInputSchema,
} from '../tools.js';
import type { HandlerContext } from './indexing.js';
import { NotFoundError } from '../../core/errors.js';
import { resolveSymbolByName } from '../symbol-resolve.js';
import { repoRelativeFilePath, attachRepoRootEnvelope } from '../path-display.js';
import type { CodeNode } from '../../core/types.js';

function compactNode(storage: HandlerContext['storage'], node: CodeNode) {
  return {
    name: node.name,
    qualifiedName: node.qualifiedName,
    kind: node.kind,
    filePath: repoRelativeFilePath(storage, node.repositoryId, node.filePath),
    lineStart: node.lineStart,
    lineEnd: node.lineEnd,
    isExported: node.isExported,
    language: node.language,
    repositoryId: node.repositoryId,
    complexity: node.complexity,
  };
}

function ambiguousResponse(
  candidates: Array<{ name: string; kind: string; filePath: string; lineStart: number }>
) {
  return {
    ambiguous: true,
    candidates,
    message: 'Multiple symbols match; pass filePath to disambiguate.',
  };
}

export async function findSymbol(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = FindSymbolInputSchema.parse(args);

  const nodes = context.graph.findByPattern(input.name, {
    kind: input.kind,
  });

  const offset = input.offset || 0;
  const limit = input.limit || 10;
  const paginatedNodes = nodes.slice(offset, offset + limit);

  return {
    results: paginatedNodes.map((node) => compactNode(context.storage, node)),
    total: nodes.length,
    limit,
    offset,
    hasMore: offset + limit < nodes.length,
  };
}

export async function findReferences(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = FindReferencesInputSchema.parse(args);

  const resolved = resolveSymbolByName(context.graph, input.symbolName, input.filePath);
  if (resolved.kind === 'ambiguous') {
    return ambiguousResponse(resolved.candidates);
  }

  const targetNode = resolved.node;
  const offset = input.offset || 0;
  const limit = input.limit || 10;
  const direction = input.direction ?? 'both';

  const envelope: Record<string, unknown> = {
    symbol: compactNode(context.storage, targetNode),
    direction,
    limit,
    offset,
  };

  if (direction === 'in' || direction === 'both') {
    const callers = context.graph.getCallers(targetNode.id);
    const paginatedCallers = callers.slice(offset, offset + limit);
    envelope.callers = paginatedCallers.map((caller) => compactNode(context.storage, caller));
    envelope.totalCallers = callers.length;
    envelope.hasMoreCallers = offset + limit < callers.length;
  }

  if (direction === 'out' || direction === 'both') {
    const callees = context.graph.getCallees(targetNode.id);
    const paginatedCallees = callees.slice(offset, offset + limit);
    envelope.callees = paginatedCallees.map((callee) => compactNode(context.storage, callee));
    envelope.totalCallees = callees.length;
    envelope.hasMoreCallees = offset + limit < callees.length;
  }

  return attachRepoRootEnvelope(context.storage, targetNode.repositoryId, envelope);
}

export async function findCallers(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = FindCallersInputSchema.parse(args);
  return findReferences(
    {
      symbolName: input.symbolName,
      filePath: input.filePath,
      limit: input.limit,
      offset: input.offset,
      direction: 'in',
    },
    context
  );
}

export async function findCallees(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = FindCalleesInputSchema.parse(args);
  return findReferences(
    {
      symbolName: input.symbolName,
      filePath: input.filePath,
      limit: input.limit,
      offset: input.offset,
      direction: 'out',
    },
    context
  );
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
      from: compactNode(context.storage, fromNode),
      to: compactNode(context.storage, toNode),
      message: 'No path found between symbols',
    };
  }

  return attachRepoRootEnvelope(context.storage, fromNode.repositoryId, {
    found: true,
    from: compactNode(context.storage, fromNode),
    to: compactNode(context.storage, toNode),
    path: path.map((node) => compactNode(context.storage, node)),
    length: path.length,
  });
}

function groupImpactByFile(
  storage: HandlerContext['storage'],
  nodes: CodeNode[],
  offset: number,
  limit: number
) {
  const byFile = new Map<string, Array<{ name: string; kind: string; lineStart: number }>>();
  for (const node of nodes) {
    const fp = repoRelativeFilePath(storage, node.repositoryId, node.filePath);
    const list = byFile.get(fp) ?? [];
    list.push({ name: node.name, kind: node.kind, lineStart: node.lineStart });
    byFile.set(fp, list);
  }
  const files = [...byFile.entries()].map(([filePath, symbols]) => ({ filePath, symbols }));
  const page = files.slice(offset, offset + limit);
  return { files: page, totalFiles: files.length };
}

export async function getImpactRadius(
  args: Record<string, unknown>,
  context: HandlerContext
): Promise<unknown> {
  const input = GetImpactRadiusInputSchema.parse(args);

  const resolved = resolveSymbolByName(context.graph, input.symbolName, input.filePath);
  if (resolved.kind === 'ambiguous') {
    return ambiguousResponse(resolved.candidates);
  }

  const targetNode = resolved.node;
  const impact = context.graph.analyzeImpact(targetNode.id, input.maxDepth || 10);

  const offset = input.offset || 0;
  const limit = input.limit || 50;
  const grouped = groupImpactByFile(context.storage, impact.affectedNodes, offset, limit);

  return attachRepoRootEnvelope(context.storage, targetNode.repositoryId, {
    symbol: compactNode(context.storage, targetNode),
    affectedFiles: grouped.files,
    totalAffectedNodes: impact.affectedNodes.length,
    totalAffectedFiles: grouped.totalFiles,
    depth: impact.depth,
    confidence: impact.confidence,
    limit,
    offset,
    hasMore: offset + limit < grouped.totalFiles,
  });
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

  const mapEntry = (node: CodeNode) => compactNode(context.storage, node);

  const modules: Record<string, { nodeCount: number; topSymbols: string[] }> = {};
  for (const [path, nodes] of architecture.modules.entries()) {
    const rel = repoRelativeFilePath(context.storage, input.repositoryId, path);
    modules[rel] = {
      nodeCount: nodes.length,
      topSymbols: nodes.slice(0, 5).map((n) => n.name),
    };
  }

  return attachRepoRootEnvelope(context.storage, input.repositoryId, {
    repository: {
      repositoryId: repo.id,
      name: repo.name,
    },
    entryPoints: architecture.entryPoints.map(mapEntry),
    modules,
    keyAbstractions: architecture.keyAbstractions.map(mapEntry),
  });
}
