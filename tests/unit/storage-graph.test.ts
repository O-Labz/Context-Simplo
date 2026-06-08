/**
 * Tests for storage-backed graph primitives (Phase 9)
 * 
 * Tests the new StorageProvider methods: getNodesByName, countNodes
 * and verifies migration 003 indexes work correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import type { CodeNode, NodeFilter } from '../../src/core/types.js';

describe('Storage Graph Primitives', () => {
  let storage: SqliteStorageProvider;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'context-simplo-test-'));
    storage = new SqliteStorageProvider(resolve(tmpDir, 'test.db'));
    await storage.initialize();
  });

  afterEach(async () => {
    storage.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should create indexes in migration 003', async () => {
    // Migration should have run during initialize()
    // Check that we can query schema to confirm indexes exist
    const db = (storage as any).db;
    
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'index' AND (
        name = 'idx_nodes_name_lookup' OR 
        name = 'idx_edges_source_lookup' OR 
        name = 'idx_edges_target_lookup'
      )
    `).all();

    expect(indexes).toHaveLength(3);
    expect(indexes.map((i: any) => i.name)).toContain('idx_nodes_name_lookup');
    expect(indexes.map((i: any) => i.name)).toContain('idx_edges_source_lookup');  
    expect(indexes.map((i: any) => i.name)).toContain('idx_edges_target_lookup');
  });

  it('should be idempotent when migration re-applied', async () => {
    // Close and re-initialize to trigger migration again
    storage.close();
    
    storage = new SqliteStorageProvider(resolve(tmpDir, 'test.db'));
    await storage.initialize();
    
    // Should not error and indexes should still exist
    const db = (storage as any).db;
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'index' AND name LIKE '%_lookup'
    `).all();

    expect(indexes.length).toBeGreaterThanOrEqual(3);
  });

  it('should implement getNodesByName with exact match', async () => {
    // Insert test repositories first
    storage.upsertRepository({
      id: 'repo1',
      path: '/test/repo1',
      name: 'Test Repo 1',
      fileCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      isWatched: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    storage.upsertRepository({
      id: 'repo2', 
      path: '/test/repo2',
      name: 'Test Repo 2',
      fileCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      isWatched: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Insert test nodes
    const testNodes: CodeNode[] = [
      {
        id: 'node1',
        name: 'testFunction',
        qualifiedName: 'module.testFunction',
        kind: 'function',
        filePath: '/test/file1.js',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'repo1',
        language: 'javascript',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'node2', 
        name: 'testFunction',
        qualifiedName: 'other.testFunction',
        kind: 'function',
        filePath: '/test/file2.js',
        lineStart: 5,
        lineEnd: 15,
        repositoryId: 'repo2',
        language: 'javascript',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'node3',
        name: 'differentFunction',
        qualifiedName: 'module.differentFunction', 
        kind: 'function',
        filePath: '/test/file1.js',
        lineStart: 20,
        lineEnd: 30,
        repositoryId: 'repo1',
        language: 'javascript',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    storage.upsertNodes(testNodes);

    // Test exact name match
    const results = storage.getNodesByName('testFunction');
    expect(results).toHaveLength(2);
    expect(results.map(n => n.id).sort()).toEqual(['node1', 'node2']);

    // Test with repository filter
    const filteredResults = storage.getNodesByName('testFunction', { repositoryId: 'repo1' });
    expect(filteredResults).toHaveLength(1);
    expect(filteredResults[0].id).toBe('node1');

    // Test with kind filter
    const kindFiltered = storage.getNodesByName('testFunction', { kind: 'function' });
    expect(kindFiltered).toHaveLength(2);

    // Test non-existent name
    const noResults = storage.getNodesByName('nonExistentFunction');
    expect(noResults).toHaveLength(0);
  });

  it('should implement countNodes with filters', async () => {
    // Insert test repositories first
    storage.upsertRepository({
      id: 'repo1',
      path: '/test/repo1',
      name: 'Test Repo 1',
      fileCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      isWatched: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    storage.upsertRepository({
      id: 'repo2',
      path: '/test/repo2', 
      name: 'Test Repo 2',
      fileCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      isWatched: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Insert test nodes
    const testNodes: CodeNode[] = [
      {
        id: 'node1',
        name: 'func1',
        qualifiedName: 'module.func1',
        kind: 'function',
        filePath: '/test/file1.js',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'repo1',
        language: 'javascript',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'node2',
        name: 'class1',
        qualifiedName: 'module.class1',
        kind: 'class',
        filePath: '/test/file1.js',
        lineStart: 15,
        lineEnd: 50,
        repositoryId: 'repo1',
        language: 'javascript',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'node3',
        name: 'func2',
        qualifiedName: 'other.func2',
        kind: 'function', 
        filePath: '/test/file2.py',
        lineStart: 1,
        lineEnd: 20,
        repositoryId: 'repo2',
        language: 'python',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    storage.upsertNodes(testNodes);

    // Test total count
    const totalCount = storage.countNodes();
    expect(totalCount).toBe(3);

    // Test repository filter
    const repo1Count = storage.countNodes({ repositoryId: 'repo1' });
    expect(repo1Count).toBe(2);

    // Test kind filter
    const functionCount = storage.countNodes({ kind: 'function' });
    expect(functionCount).toBe(2);

    // Test language filter
    const jsCount = storage.countNodes({ language: 'javascript' });
    expect(jsCount).toBe(2);

    // Test multiple filters
    const filteredCount = storage.countNodes({ 
      repositoryId: 'repo1', 
      kind: 'function' 
    });
    expect(filteredCount).toBe(1);

    // Test with no results
    const noResultsCount = storage.countNodes({ repositoryId: 'nonexistent' });
    expect(noResultsCount).toBe(0);
  });
});