import { describe, it, expect, beforeEach } from 'vitest';
import { CodeGraph } from '../../src/core/graph.js';
import { resolveSymbolByName } from '../../src/mcp/symbol-resolve.js';
import type { CodeNode } from '../../src/core/types.js';

function node(partial: Partial<CodeNode> & Pick<CodeNode, 'id' | 'name' | 'filePath'>): CodeNode {
  const now = new Date();
  return {
    qualifiedName: partial.qualifiedName ?? partial.name,
    kind: partial.kind ?? 'function',
    lineStart: partial.lineStart ?? 1,
    lineEnd: partial.lineEnd ?? 2,
    repositoryId: partial.repositoryId ?? 'repo1',
    language: partial.language ?? 'typescript',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('resolveSymbolByName', () => {
  let graph: CodeGraph;

  beforeEach(async () => {
    graph = new CodeGraph();
    await graph.addNode(
      node({ id: 'a', name: 'foo', filePath: 'src/a.ts', qualifiedName: 'foo' })
    );
    await graph.addNode(
      node({ id: 'b', name: 'foo', filePath: 'src/b.ts', qualifiedName: 'foo' })
    );
  });

  it('returns ambiguous when the same name exists in multiple files', () => {
    const result = resolveSymbolByName(graph, 'foo');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.length).toBe(2);
    }
  });

  it('disambiguates with filePath', () => {
    const result = resolveSymbolByName(graph, 'foo', 'src/a.ts');
    expect(result.kind).toBe('single');
    if (result.kind === 'single') {
      expect(result.node.id).toBe('a');
    }
  });
});
