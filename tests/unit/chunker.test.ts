/**
 * Code Chunker Tests
 */

import { describe, it, expect } from 'vitest';
import { chunkCodeForEmbedding } from '../../src/llm/chunker.js';
import type { CodeNode } from '../../src/core/types.js';

describe('Code Chunker', () => {
  it('should chunk small functions as single chunks', () => {
    const parsed = {
      filePath: 'test.ts',
      repositoryId: 'repo1',
      language: 'typescript',
      hash: 'abc123',
      nodes: [
        {
          id: 'node1',
          name: 'hello',
          qualifiedName: 'hello',
          kind: 'function' as const,
          filePath: 'test.ts',
          lineStart: 1,
          lineEnd: 3,
          repositoryId: 'repo1',
          language: 'typescript',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as CodeNode[],
      edges: [],
    };

    const fileContent = `function hello() {\n  console.log('hello');\n}`;

    const chunks = chunkCodeForEmbedding(parsed, fileContent);

    expect(chunks.length).toBe(1);
    expect(chunks[0]?.content).toContain('hello');
    expect(chunks[0]?.symbolContext).toBe('test.ts:hello');
    expect(chunks[0]?.nodeId).toBe('node1');
  });

  it('should split large functions into multiple chunks', () => {
    const longContent = 'function large() {\n' + '  console.log("x");\n'.repeat(100) + '}';

    const parsed = {
      filePath: 'large.ts',
      repositoryId: 'repo1',
      language: 'typescript',
      hash: 'abc123',
      nodes: [
        {
          id: 'node1',
          name: 'large',
          qualifiedName: 'large',
          kind: 'function' as const,
          filePath: 'large.ts',
          lineStart: 1,
          lineEnd: 102,
          repositoryId: 'repo1',
          language: 'typescript',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as CodeNode[],
      edges: [],
    };

    const chunks = chunkCodeForEmbedding(parsed, longContent);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length <= 2000)).toBe(true);
  });

  it('should skip import/export nodes', () => {
    const parsed = {
      filePath: 'test.ts',
      repositoryId: 'repo1',
      language: 'typescript',
      hash: 'abc123',
      nodes: [
        {
          id: 'node1',
          name: 'React',
          qualifiedName: 'React',
          kind: 'import' as const,
          filePath: 'test.ts',
          lineStart: 1,
          lineEnd: 1,
          repositoryId: 'repo1',
          language: 'typescript',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'node2',
          name: 'MyComponent',
          qualifiedName: 'MyComponent',
          kind: 'export' as const,
          filePath: 'test.ts',
          lineStart: 3,
          lineEnd: 5,
          repositoryId: 'repo1',
          language: 'typescript',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as CodeNode[],
      edges: [],
    };

    const fileContent = `import React from 'react';\n\nexport const MyComponent = () => <div />;`;

    const chunks = chunkCodeForEmbedding(parsed, fileContent);

    expect(chunks.length).toBe(0);
  });

  it('should include symbol context in chunks', () => {
    const parsed = {
      filePath: 'services/user.ts',
      repositoryId: 'repo1',
      language: 'typescript',
      hash: 'abc123',
      nodes: [
        {
          id: 'node1',
          name: 'create',
          qualifiedName: 'UserService.create',
          kind: 'method' as const,
          filePath: 'services/user.ts',
          lineStart: 5,
          lineEnd: 10,
          repositoryId: 'repo1',
          language: 'typescript',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as CodeNode[],
      edges: [],
    };

    const fileContent = `class UserService {\n  create() {\n    return {};\n  }\n}`;

    const chunks = chunkCodeForEmbedding(parsed, fileContent);

    expect(chunks[0]?.symbolContext).toBe('services/user.ts:UserService.create');
  });

  it('should handle empty nodes gracefully', () => {
    const parsed = {
      filePath: 'empty.ts',
      repositoryId: 'repo1',
      language: 'typescript',
      hash: 'abc123',
      nodes: [] as CodeNode[],
      edges: [],
    };

    const fileContent = '';

    const chunks = chunkCodeForEmbedding(parsed, fileContent);

    expect(chunks.length).toBe(0);
  });
});
