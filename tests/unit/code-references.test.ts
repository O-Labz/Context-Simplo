/**
 * Code References CRUD Tests
 *
 * Tests the code_references table and CRUD operations:
 * - saveCodeReferences
 * - deleteCodeReferencesForFile
 * - getUnresolvedReferencesForTargetName
 * - markReferenceResolved
 * - getUnresolvedReferencesInRepository
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type { CodeReference, RepositoryInfo } from '../../src/core/types.js';

describe('Code References CRUD', () => {
  let storage: SqliteStorageProvider;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'code-refs-test-'));
    const dbPath = join(tmpDir, 'test.db');
    storage = new SqliteStorageProvider(dbPath);
    await storage.initialize();

    // Create a test repository
    const repo: RepositoryInfo = {
      id: 'test-repo',
      path: '/test/path',
      name: 'Test Repo',
      fileCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      languages: {},
      isWatched: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    storage.upsertRepository(repo);
  });

  afterEach(() => {
    storage.close();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should save and retrieve code references', () => {
    const now = new Date();
    
    // Create nodes first to satisfy foreign key constraints
    storage.upsertNodes([
      {
        id: 'node-1',
        name: 'func1',
        qualifiedName: 'func1',
        kind: 'function',
        filePath: '/test/file1.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'node-2',
        name: 'func2',
        qualifiedName: 'func2',
        kind: 'function',
        filePath: '/test/file2.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const refs: CodeReference[] = [
      {
        id: 'ref-1',
        sourceFile: '/test/file1.ts',
        sourceNodeId: 'node-1',
        targetName: 'SomeFunction',
        referenceKind: 'call',
        lineNumber: 42,
        repositoryId: 'test-repo',
        resolved: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ref-2',
        sourceFile: '/test/file2.ts',
        sourceNodeId: 'node-2',
        targetName: 'AnotherFunction',
        referenceKind: 'import',
        lineNumber: 10,
        repositoryId: 'test-repo',
        resolved: false,
        createdAt: now,
        updatedAt: now,
      },
    ];

    storage.saveCodeReferences(refs);

    const unresolved = storage.getUnresolvedReferencesInRepository('test-repo');
    expect(unresolved).toHaveLength(2);
    expect(unresolved[0].targetName).toBe('SomeFunction');
    expect(unresolved[1].targetName).toBe('AnotherFunction');
  });

  it('should delete code references for a file', () => {
    const now = new Date();
    
    // Create nodes first
    storage.upsertNodes([
      {
        id: 'node-1',
        name: 'func1',
        qualifiedName: 'func1',
        kind: 'function',
        filePath: '/test/file1.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'node-2',
        name: 'func2',
        qualifiedName: 'func2',
        kind: 'function',
        filePath: '/test/file2.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const refs: CodeReference[] = [
      {
        id: 'ref-1',
        sourceFile: '/test/file1.ts',
        sourceNodeId: 'node-1',
        targetName: 'SomeFunction',
        referenceKind: 'call',
        lineNumber: 42,
        repositoryId: 'test-repo',
        resolved: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ref-2',
        sourceFile: '/test/file2.ts',
        sourceNodeId: 'node-2',
        targetName: 'AnotherFunction',
        referenceKind: 'import',
        lineNumber: 10,
        repositoryId: 'test-repo',
        resolved: false,
        createdAt: now,
        updatedAt: now,
      },
    ];

    storage.saveCodeReferences(refs);
    storage.deleteCodeReferencesForFile('/test/file1.ts');

    const remaining = storage.getUnresolvedReferencesInRepository('test-repo');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sourceFile).toBe('/test/file2.ts');
  });

  it('should find unresolved references by target name', () => {
    const now = new Date();
    
    // Create nodes first
    storage.upsertNodes([
      {
        id: 'node-1',
        name: 'func1',
        qualifiedName: 'func1',
        kind: 'function',
        filePath: '/test/file1.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'node-2',
        name: 'func2',
        qualifiedName: 'func2',
        kind: 'function',
        filePath: '/test/file2.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'node-3',
        name: 'func3',
        qualifiedName: 'func3',
        kind: 'function',
        filePath: '/test/file3.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const refs: CodeReference[] = [
      {
        id: 'ref-1',
        sourceFile: '/test/file1.ts',
        sourceNodeId: 'node-1',
        targetName: 'MyFunction',
        referenceKind: 'call',
        lineNumber: 42,
        repositoryId: 'test-repo',
        resolved: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ref-2',
        sourceFile: '/test/file2.ts',
        sourceNodeId: 'node-2',
        targetName: 'MyFunction',
        referenceKind: 'call',
        lineNumber: 10,
        repositoryId: 'test-repo',
        resolved: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ref-3',
        sourceFile: '/test/file3.ts',
        sourceNodeId: 'node-3',
        targetName: 'OtherFunction',
        referenceKind: 'call',
        lineNumber: 20,
        repositoryId: 'test-repo',
        resolved: false,
        createdAt: now,
        updatedAt: now,
      },
    ];

    storage.saveCodeReferences(refs);

    const myFunctionRefs = storage.getUnresolvedReferencesForTargetName('MyFunction', 'test-repo');
    expect(myFunctionRefs).toHaveLength(2);
    expect(myFunctionRefs.every(ref => ref.targetName === 'MyFunction')).toBe(true);
  });

  it('should mark references as resolved', () => {
    const now = new Date();
    
    // Create node first
    storage.upsertNodes([
      {
        id: 'node-1',
        name: 'func1',
        qualifiedName: 'func1',
        kind: 'function',
        filePath: '/test/file1.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const refs: CodeReference[] = [
      {
        id: 'ref-1',
        sourceFile: '/test/file1.ts',
        sourceNodeId: 'node-1',
        targetName: 'SomeFunction',
        referenceKind: 'call',
        lineNumber: 42,
        repositoryId: 'test-repo',
        resolved: false,
        createdAt: now,
        updatedAt: now,
      },
    ];

    storage.saveCodeReferences(refs);
    storage.markReferenceResolved('ref-1');

    const unresolved = storage.getUnresolvedReferencesInRepository('test-repo');
    expect(unresolved).toHaveLength(0);
  });

  it('should only return unresolved references', () => {
    const now = new Date();
    
    // Create nodes first
    storage.upsertNodes([
      {
        id: 'node-1',
        name: 'func1',
        qualifiedName: 'func1',
        kind: 'function',
        filePath: '/test/file1.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'node-2',
        name: 'func2',
        qualifiedName: 'func2',
        kind: 'function',
        filePath: '/test/file2.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const refs: CodeReference[] = [
      {
        id: 'ref-1',
        sourceFile: '/test/file1.ts',
        sourceNodeId: 'node-1',
        targetName: 'MyFunction',
        referenceKind: 'call',
        lineNumber: 42,
        repositoryId: 'test-repo',
        resolved: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ref-2',
        sourceFile: '/test/file2.ts',
        sourceNodeId: 'node-2',
        targetName: 'MyFunction',
        referenceKind: 'call',
        lineNumber: 10,
        repositoryId: 'test-repo',
        resolved: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    storage.saveCodeReferences(refs);

    const unresolved = storage.getUnresolvedReferencesForTargetName('MyFunction', 'test-repo');
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].id).toBe('ref-1');
  });

  it('should upsert references on conflict', () => {
    const now = new Date();
    
    // Create node first
    storage.upsertNodes([
      {
        id: 'node-1',
        name: 'func1',
        qualifiedName: 'func1',
        kind: 'function',
        filePath: '/test/file1.ts',
        lineStart: 1,
        lineEnd: 10,
        repositoryId: 'test-repo',
        language: 'typescript',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const ref1: CodeReference = {
      id: 'ref-1',
      sourceFile: '/test/file1.ts',
      sourceNodeId: 'node-1',
      targetName: 'OldName',
      referenceKind: 'call',
      lineNumber: 42,
      repositoryId: 'test-repo',
      resolved: false,
      createdAt: now,
      updatedAt: now,
    };

    storage.saveCodeReferences([ref1]);

    // Update the same reference
    const ref1Updated: CodeReference = {
      ...ref1,
      targetName: 'NewName',
      updatedAt: new Date(),
    };

    storage.saveCodeReferences([ref1Updated]);

    const refs = storage.getUnresolvedReferencesInRepository('test-repo');
    expect(refs).toHaveLength(1);
    expect(refs[0].targetName).toBe('NewName');
  });

  it('should handle empty reference arrays', () => {
    storage.saveCodeReferences([]);
    const refs = storage.getUnresolvedReferencesInRepository('test-repo');
    expect(refs).toHaveLength(0);
  });
});
