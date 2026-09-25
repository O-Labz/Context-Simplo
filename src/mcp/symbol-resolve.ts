import type { CodeGraphApi } from '../core/graph.js';
import type { CodeNode } from '../core/types.js';
import { NotFoundError } from '../core/errors.js';

export type SymbolResolveResult =
  | { kind: 'single'; node: CodeNode }
  | { kind: 'ambiguous'; candidates: Array<{ name: string; kind: string; filePath: string; lineStart: number }> };

export function resolveSymbolByName(
  graph: CodeGraphApi,
  symbolName: string,
  filePath?: string
): SymbolResolveResult {
  const matches = graph.findByName(symbolName);
  if (matches.length === 0) {
    throw new NotFoundError('Symbol', symbolName);
  }

  if (filePath) {
    const inFile = matches.filter((n) => n.filePath === filePath || n.filePath.endsWith(filePath));
    if (inFile.length === 1) {
      return { kind: 'single', node: inFile[0]! };
    }
    if (inFile.length > 1) {
      return {
        kind: 'ambiguous',
        candidates: inFile.map((n) => ({
          name: n.name,
          kind: n.kind,
          filePath: n.filePath,
          lineStart: n.lineStart,
        })),
      };
    }
  }

  if (matches.length === 1) {
    return { kind: 'single', node: matches[0]! };
  }

  const byFile = new Map<string, CodeNode[]>();
  for (const node of matches) {
    const list = byFile.get(node.filePath) ?? [];
    list.push(node);
    byFile.set(node.filePath, list);
  }
  if (byFile.size === 1) {
    const only = [...byFile.values()][0]!;
    if (only.length === 1) {
      return { kind: 'single', node: only[0]! };
    }
  }

  return {
    kind: 'ambiguous',
    candidates: matches.slice(0, 20).map((n) => ({
      name: n.name,
      kind: n.kind,
      filePath: n.filePath,
      lineStart: n.lineStart,
    })),
  };
}
