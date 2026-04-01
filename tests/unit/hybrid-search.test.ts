/**
 * Hybrid Search Tests
 *
 * Tests RRF fusion, partial failure handling, and score combination.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HybridSearch } from '../../src/search/hybrid.js';
import type { SymbolicSearch } from '../../src/search/symbolic.js';
import type { VectorSearch } from '../../src/search/vector.js';

describe('HybridSearch', () => {
  let mockSymbolicSearch: SymbolicSearch;
  let mockVectorSearch: VectorSearch;
  let hybridSearch: HybridSearch;

  beforeEach(() => {
    mockSymbolicSearch = {
      search: vi.fn(),
    } as any;

    mockVectorSearch = {
      search: vi.fn(),
    } as any;

    hybridSearch = new HybridSearch(mockSymbolicSearch, mockVectorSearch);
  });

  describe('RRF fusion', () => {
    it('should combine results from both searches', async () => {
      vi.mocked(mockSymbolicSearch.search).mockResolvedValue({
        results: [
          { nodeId: 'node1', name: 'func1', qualifiedName: 'mod.func1', kind: 'function', filePath: 'a.ts', lineStart: 1, lineEnd: 10, language: 'typescript', repositoryId: 'repo1' },
          { nodeId: 'node2', name: 'func2', qualifiedName: 'mod.func2', kind: 'function', filePath: 'b.ts', lineStart: 1, lineEnd: 10, language: 'typescript', repositoryId: 'repo1' },
        ],
        total: 2,
        hasMore: false,
      });

      vi.mocked(mockVectorSearch.search).mockResolvedValue({
        results: [
          { nodeId: 'node3', name: 'func3', qualifiedName: 'mod.func3', kind: 'function', filePath: 'c.ts', lineStart: 1, lineEnd: 10, language: 'typescript', repositoryId: 'repo1' },
          { nodeId: 'node1', name: 'func1', qualifiedName: 'mod.func1', kind: 'function', filePath: 'a.ts', lineStart: 1, lineEnd: 10, language: 'typescript', repositoryId: 'repo1' },
        ],
        total: 2,
        hasMore: false,
      });

      const result = await hybridSearch.search('test query', 'repo1', 10, 0);

      expect(result.results).toHaveLength(3);
      expect(result.results.map(r => r.nodeId)).toContain('node1');
      expect(result.results.map(r => r.nodeId)).toContain('node2');
      expect(result.results.map(r => r.nodeId)).toContain('node3');
    });

    it('should prefer symbolic results for duplicates', async () => {
      vi.mocked(mockSymbolicSearch.search).mockResolvedValue({
        results: [
          { nodeId: 'node1', name: 'func1', qualifiedName: 'symbolic.func1', kind: 'function', filePath: 'a.ts', lineStart: 1, lineEnd: 10, language: 'typescript', repositoryId: 'repo1' },
        ],
        total: 1,
        hasMore: false,
      });

      vi.mocked(mockVectorSearch.search).mockResolvedValue({
        results: [
          { nodeId: 'node1', name: 'func1', qualifiedName: 'vector.func1', kind: 'function', filePath: 'a.ts', lineStart: 1, lineEnd: 10, language: 'typescript', repositoryId: 'repo1' },
        ],
        total: 1,
        hasMore: false,
      });

      const result = await hybridSearch.search('test', 'repo1', 10, 0);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.qualifiedName).toBe('symbolic.func1');
    });
  });

  describe('Partial failure handling', () => {
    it('should degrade gracefully when symbolic search fails', async () => {
      vi.mocked(mockSymbolicSearch.search).mockRejectedValue(new Error('DB error'));

      vi.mocked(mockVectorSearch.search).mockResolvedValue({
        results: [
          { nodeId: 'node1', name: 'func1', qualifiedName: 'mod.func1', kind: 'function', filePath: 'a.ts', lineStart: 1, lineEnd: 10, language: 'typescript', repositoryId: 'repo1' },
        ],
        total: 1,
        hasMore: false,
      });

      const result = await hybridSearch.search('test', 'repo1', 10, 0);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.nodeId).toBe('node1');
    });

    it('should degrade gracefully when vector search fails', async () => {
      vi.mocked(mockSymbolicSearch.search).mockResolvedValue({
        results: [
          { nodeId: 'node1', name: 'func1', qualifiedName: 'mod.func1', kind: 'function', filePath: 'a.ts', lineStart: 1, lineEnd: 10, language: 'typescript', repositoryId: 'repo1' },
        ],
        total: 1,
        hasMore: false,
      });

      vi.mocked(mockVectorSearch.search).mockRejectedValue(new Error('LLM error'));

      const result = await hybridSearch.search('test', 'repo1', 10, 0);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.nodeId).toBe('node1');
    });

    it('should return empty results when both searches fail', async () => {
      vi.mocked(mockSymbolicSearch.search).mockRejectedValue(new Error('DB error'));
      vi.mocked(mockVectorSearch.search).mockRejectedValue(new Error('LLM error'));

      const result = await hybridSearch.search('test', 'repo1', 10, 0);

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('Score calculation', () => {
    it('should calculate RRF scores correctly', async () => {
      vi.mocked(mockSymbolicSearch.search).mockResolvedValue({
        results: [
          { nodeId: 'node1', name: 'func1', qualifiedName: 'mod.func1', kind: 'function', filePath: 'a.ts', lineStart: 1, lineEnd: 10, language: 'typescript', repositoryId: 'repo1' },
        ],
        total: 1,
        hasMore: false,
      });

      vi.mocked(mockVectorSearch.search).mockResolvedValue({
        results: [
          { nodeId: 'node1', name: 'func1', qualifiedName: 'mod.func1', kind: 'function', filePath: 'a.ts', lineStart: 1, lineEnd: 10, language: 'typescript', repositoryId: 'repo1' },
        ],
        total: 1,
        hasMore: false,
      });

      const result = await hybridSearch.search('test', 'repo1', 10, 0);

      expect(result.results[0]?.score).toBeGreaterThan(0);
    });
  });
});
