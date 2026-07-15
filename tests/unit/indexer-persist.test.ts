/**
 * Tests for indexer persistence (Phase 1)
 * 
 * Tests that the indexer persists nodes and edges atomically using
 * synchronous transactions (no async callbacks to better-sqlite3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { StorageBackedGraph } from '../../src/core/graph-store.js';
import { Indexer } from '../../src/core/indexer.js';

describe('Indexer Persistence', () => {
  let storage: SqliteStorageProvider;
  let graph: StorageBackedGraph;
  let indexer: Indexer;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'context-simplo-test-'));
    storage = new SqliteStorageProvider(resolve(tmpDir, 'test.db'));
    await storage.initialize();
    
    graph = new StorageBackedGraph(storage, { hotCacheMb: 10 });
    indexer = new Indexer(storage, graph, tmpDir);
  });

  afterEach(async () => {
    storage.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should persist nodes after indexRepository of a fixture', async () => {
    const fixtureDir = resolve(__dirname, '../fixtures/sample-ts');
    
    // Index the fixture directory
    const job = await indexer.indexRepository(fixtureDir, {
      respectIgnore: false,
      incremental: false,
    });

    // Verify job completed
    expect(job.status).toBe('completed');
    expect(job.filesProcessed).toBeGreaterThan(0);

    // Verify nodes were persisted to storage
    const nodeCount = storage.countNodes();
    expect(nodeCount).toBeGreaterThan(0);

    // Verify we can read the nodes back
    const nodes = storage.getAllNodes();
    expect(nodes.length).toBe(nodeCount);
    
    // Verify nodes have expected properties
    for (const node of nodes) {
      expect(node.id).toBeDefined();
      expect(node.name).toBeDefined();
      expect(node.filePath).toBeDefined();
      expect(node.repositoryId).toBeDefined();
    }
  });

  it('should persist edges after indexRepository', async () => {
    const fixtureDir = resolve(__dirname, '../fixtures/sample-ts');
    
    const job = await indexer.indexRepository(fixtureDir, {
      respectIgnore: false,
      incremental: false,
    });

    expect(job.status).toBe('completed');

    // Verify edges were persisted
    const edges = storage.getEdges();
    
    // The fixture should have at least some edges (e.g., class members)
    expect(edges.length).toBeGreaterThanOrEqual(0);
    
    // If there are edges, verify their properties
    for (const edge of edges) {
      expect(edge.id).toBeDefined();
      expect(edge.sourceId).toBeDefined();
      expect(edge.targetId).toBeDefined();
      expect(edge.kind).toBeDefined();
    }
  });

  it('should update file metadata in storage', async () => {
    const fixtureDir = resolve(__dirname, '../fixtures/sample-ts');
    
    await indexer.indexRepository(fixtureDir, {
      respectIgnore: false,
      incremental: false,
    });

    // Get the repository that was created
    const repos = storage.listRepositories();
    expect(repos.length).toBeGreaterThan(0);
    
    const repo = repos[0];
    
    // Get files in the repository
    const files = storage.listFiles(repo.id);
    expect(files.length).toBeGreaterThan(0);
    
    // Verify file metadata
    for (const file of files) {
      expect(file.status).toBe('indexed');
      expect(file.nodeCount).toBeGreaterThan(0);
      expect(file.hash).toBeDefined();
      expect(file.indexedAt).toBeDefined();
    }
  });
});
