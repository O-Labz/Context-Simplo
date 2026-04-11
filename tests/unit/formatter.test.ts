import { describe, it, expect } from 'vitest';
import { compactResponse, formatMCPResponse } from '../../src/mcp/formatter.js';

const mockFindSymbolResult = {
  results: [
    {
      id: 'abc123def456',
      name: 'findSymbol',
      qualifiedName: 'src/mcp/handlers/query.findSymbol',
      kind: 'function',
      filePath: 'src/mcp/handlers/query.ts',
      lineStart: 19,
      lineEnd: 52,
      visibility: 'public',
      isExported: true,
      language: 'typescript',
      repositoryId: 'default-repo',
    },
    {
      id: 'bcd234efg567',
      name: 'findSymbolById',
      qualifiedName: 'src/mcp/handlers/query.findSymbolById',
      kind: 'function',
      filePath: 'src/mcp/handlers/query.ts',
      lineStart: 54,
      lineEnd: 70,
      visibility: null,
      isExported: false,
      language: 'typescript',
      repositoryId: 'default-repo',
    },
  ],
  total: 2,
  limit: 20,
  offset: 0,
  hasMore: false,
};

describe('compactResponse', () => {
  it('shortens keys according to key map', () => {
    const result = compactResponse(mockFindSymbolResult) as Record<string, unknown>;
    expect(result).toHaveProperty('r');
    expect(result).not.toHaveProperty('results');
    expect(result).toHaveProperty('t', 2);
    expect(result).not.toHaveProperty('total');
    expect(result).toHaveProperty('m', false);
    expect(result).not.toHaveProperty('hasMore');
  });

  it('removes id fields from items', () => {
    const result = compactResponse(mockFindSymbolResult) as Record<string, unknown>;
    const items = result['r'] as Record<string, unknown>[];
    expect(items[0]).not.toHaveProperty('id');
    expect(items[1]).not.toHaveProperty('id');
  });

  it('removes null and undefined values', () => {
    const result = compactResponse(mockFindSymbolResult) as Record<string, unknown>;
    const items = result['r'] as Record<string, unknown>[];
    // visibility: null on second item should be dropped
    expect(items[1]).not.toHaveProperty('visibility');
  });

  it('removes visibility field entirely', () => {
    const result = compactResponse(mockFindSymbolResult) as Record<string, unknown>;
    const items = result['r'] as Record<string, unknown>[];
    expect(items[0]).not.toHaveProperty('visibility');
    expect(items[1]).not.toHaveProperty('visibility');
  });

  it('removes limit and offset from envelope', () => {
    const result = compactResponse(mockFindSymbolResult) as Record<string, unknown>;
    expect(result).not.toHaveProperty('limit');
    expect(result).not.toHaveProperty('offset');
  });

  it('shortens item keys', () => {
    const result = compactResponse(mockFindSymbolResult) as Record<string, unknown>;
    const items = result['r'] as Record<string, unknown>[];
    const first = items[0]!;
    expect(first).toHaveProperty('n', 'findSymbol');
    expect(first).toHaveProperty('qn', 'src/mcp/handlers/query.findSymbol');
    expect(first).toHaveProperty('k', 'function');
    expect(first).toHaveProperty('fp', 'src/mcp/handlers/query.ts');
    expect(first).toHaveProperty('ls', 19);
    expect(first).toHaveProperty('le', 52);
    expect(first).toHaveProperty('x', true);
    expect(first).not.toHaveProperty('name');
    expect(first).not.toHaveProperty('qualifiedName');
    expect(first).not.toHaveProperty('filePath');
  });

  it('hoists shared repositoryId and language to envelope', () => {
    const result = compactResponse(mockFindSymbolResult) as Record<string, unknown>;
    // Both items share 'default-repo' and 'typescript'
    expect(result).toHaveProperty('rid', 'default-repo');
    expect(result).toHaveProperty('lang', 'typescript');
    // Items no longer carry rid/lang
    const items = result['r'] as Record<string, unknown>[];
    expect(items[0]).not.toHaveProperty('rid');
    expect(items[0]).not.toHaveProperty('lang');
    expect(items[1]).not.toHaveProperty('rid');
    expect(items[1]).not.toHaveProperty('lang');
  });

  it('does NOT hoist repositoryId when items differ', () => {
    const mixed = {
      results: [
        { ...mockFindSymbolResult.results[0], repositoryId: 'repo-a' },
        { ...mockFindSymbolResult.results[1], repositoryId: 'repo-b' },
      ],
      total: 2,
      hasMore: false,
    };
    const result = compactResponse(mixed) as Record<string, unknown>;
    expect(result).not.toHaveProperty('rid');
    const items = result['r'] as Record<string, unknown>[];
    expect(items[0]).toHaveProperty('rid', 'repo-a');
    expect(items[1]).toHaveProperty('rid', 'repo-b');
  });

  it('handles empty results array', () => {
    const empty = { results: [], total: 0, hasMore: false };
    const result = compactResponse(empty) as Record<string, unknown>;
    expect(result['r']).toEqual([]);
    expect(result['t']).toBe(0);
    expect(result['m']).toBe(false);
  });

  it('handles single result without hoisting errors', () => {
    const single = {
      results: [mockFindSymbolResult.results[0]],
      total: 1,
      hasMore: false,
    };
    const result = compactResponse(single) as Record<string, unknown>;
    const items = result['r'] as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(result).toHaveProperty('rid', 'default-repo');
  });

  it('passes through non-object values unchanged', () => {
    expect(compactResponse('hello')).toBe('hello');
    expect(compactResponse(42)).toBe(42);
    expect(compactResponse(null)).toBe(null);
    expect(compactResponse([1, 2])).toEqual([1, 2]);
  });
});

describe('formatMCPResponse', () => {
  it('full mode: returns pretty-printed JSON with original keys', () => {
    const output = formatMCPResponse(mockFindSymbolResult, 'full');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('results');
    expect(parsed.results[0]).toHaveProperty('name', 'findSymbol');
    expect(parsed.results[0]).toHaveProperty('filePath');
    // Full mode keeps indentation
    expect(output).toContain('\n');
  });

  it('compact mode: returns minified JSON with short keys', () => {
    const output = formatMCPResponse(mockFindSymbolResult, 'compact');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('r');
    expect(parsed).not.toHaveProperty('results');
    // Minified: no leading newline after opening brace
    expect(output).not.toMatch(/\{\n/);
  });

  it('compact mode: output is shorter than full mode', () => {
    const full = formatMCPResponse(mockFindSymbolResult, 'full');
    const compact = formatMCPResponse(mockFindSymbolResult, 'compact');
    expect(compact.length).toBeLessThan(full.length);
  });

  it('full mode: null values preserved', () => {
    const withNull = { result: null, name: 'test' };
    const output = formatMCPResponse(withNull, 'full');
    const parsed = JSON.parse(output);
    expect(parsed.result).toBeNull();
  });

  it('compact mode: null values removed', () => {
    const withNull = { result: null, name: 'test' };
    const output = formatMCPResponse(withNull, 'compact');
    const parsed = JSON.parse(output);
    expect(parsed).not.toHaveProperty('result');
    expect(parsed).toHaveProperty('n', 'test');
  });
});
