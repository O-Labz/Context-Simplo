/**
 * Vector Search Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VectorSearch } from '../../src/search/vector.js';
import { LanceDBVectorStore } from '../../src/store/lance.js';
import type { EmbeddingProvider } from '../../src/llm/provider.js';
import { resolve } from 'path';
import { rmSync, mkdirSync } from 'fs';

const TEST_DB_PATH = resolve(__dirname, '../fixtures/test-lancedb');

const mockProvider: EmbeddingProvider = {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return Array.from({ length: 384 }, (_, i) => (hash + i) / 1000);
    });
  },
  dimensions: () => 384,
  modelName: () => 'mock-384',
  healthCheck: async () => true,
};

describe('Vector Search Integration', () => {
  let vectorStore: LanceDBVectorStore;
  let vectorSearch: VectorSearch;

  beforeAll(async () => {
    rmSync(TEST_DB_PATH, { recursive: true, force: true });
    mkdirSync(TEST_DB_PATH, { recursive: true });

    vectorStore = new LanceDBVectorStore(TEST_DB_PATH);
    await vectorStore.initialize();

    vectorSearch = new VectorSearch(vectorStore, mockProvider);

    const chunks = [
      {
        id: 'chunk1',
        nodeId: 'node1',
        filePath: 'auth.ts',
        repositoryId: 'repo1',
        content: 'function authenticate(user, password) { return jwt.sign(user); }',
        startLine: 1,
        endLine: 3,
        language: 'typescript',
        symbolContext: 'auth.ts:authenticate',
        createdAt: new Date(),
      },
      {
        id: 'chunk2',
        nodeId: 'node2',
        filePath: 'user.ts',
        repositoryId: 'repo1',
        content: 'function createUser(data) { return db.insert(data); }',
        startLine: 5,
        endLine: 7,
        language: 'typescript',
        symbolContext: 'user.ts:createUser',
        createdAt: new Date(),
      },
    ];

    const embeddings = await mockProvider.embed(chunks.map((c) => c.content));
    const chunksWithEmbeddings = chunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddings[i],
    }));

    await vectorStore.upsertChunks(chunksWithEmbeddings);
  });

  afterAll(async () => {
    await vectorStore.close();
    rmSync(TEST_DB_PATH, { recursive: true, force: true });
  });

  it('should find semantically similar code', async () => {
    const result = await vectorSearch.search('user authentication', 'repo1', 10, 0);

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]?.filePath).toBeDefined();
  });

  it('should return paginated results', async () => {
    const result = await vectorSearch.search('function', 'repo1', 1, 0);

    expect(result.results.length).toBeLessThanOrEqual(1);
    expect(result.limit).toBe(1);
    expect(result.offset).toBe(0);
  });

  it('should handle empty results gracefully', async () => {
    const result = await vectorSearch.search('nonexistent query xyz', 'repo1', 10, 0);

    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('should handle non-existent repository', async () => {
    const result = await vectorSearch.search('test', 'nonexistent-repo', 10, 0);

    expect(result.results.length).toBe(0);
    expect(result.total).toBe(0);
  });
});
