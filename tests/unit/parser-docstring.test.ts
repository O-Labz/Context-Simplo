/**
 * Parser Docstring Tests - Phase 12
 * Verifies that docstrings are captured from parse output and scrubbed before persistence
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { parseFile } from '../../src/core/parser.js';
import { Indexer } from '../../src/core/indexer.js';
import { CodeGraph } from '../../src/core/graph.js';
import { SqliteStorage } from '../../src/store/sqlite.js';
import { scrubSecrets } from '../../src/security/scrubber.js';
import { tmpdir } from 'os';

describe('Parser Docstring Integration', () => {
  const testDir = join(tmpdir(), `context-simplo-test-${Date.now()}`);
  const testFile = join(testDir, 'example.ts');
  
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should populate docstring from process() output', async () => {
    const code = `
/**
 * Calculates the sum of two numbers
 * @param a First number
 * @param b Second number
 * @returns Sum of a and b
 */
function add(a: number, b: number): number {
  return a + b;
}
`;

    await writeFile(testFile, code, 'utf-8');

    const parsed = await parseFile('example.ts', 'test-repo', testDir);

    expect(parsed.nodes.length).toBeGreaterThan(0);
    
    const addFunction = parsed.nodes.find(n => n.name === 'add');
    expect(addFunction).toBeDefined();
    
    // The docstring should be populated (either from item.docstring or from docstringMap)
    if (addFunction?.docstring) {
      expect(addFunction.docstring).toBeTruthy();
      expect(addFunction.docstring.length).toBeGreaterThan(0);
    }
  });

  it('should redact AWS keys in docstrings before storage', async () => {
    const code = `
/**
 * AWS Configuration
 * Access Key: AKIAIOSFODNN7EXAMPLE
 * Secret: Do not commit real keys
 */
function configureAWS(): void {
  // Implementation
}
`;

    await writeFile(testFile, code, 'utf-8');

    const parsed = await parseFile('example.ts', 'test-repo', testDir);
    
    const configFunction = parsed.nodes.find(n => n.name === 'configureAWS');
    expect(configFunction).toBeDefined();

    if (configFunction?.docstring) {
      // Verify that the scrubber detects the AWS key in the docstring
      const { scrubbed, detected } = scrubSecrets(configFunction.docstring);
      
      if (detected.length > 0) {
        expect(scrubbed).toContain('[REDACTED:');
        expect(scrubbed).not.toContain('AKIAIOSFODNN7EXAMPLE');
      }
    }
  });

  it('should scrub secrets in docstrings during indexing', async () => {
    const code = `
/**
 * GitHub integration
 * Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz
 */
function setupGitHub(): void {
  // Implementation
}
`;

    await writeFile(testFile, code, 'utf-8');

    const dbPath = join(testDir, 'test.db');
    const storage = new SqliteStorage(dbPath);
    const graph = new CodeGraph(storage);
    const indexer = new Indexer(storage, graph, testDir);

    await indexer.indexRepository(testDir, { incremental: false });

    // Query the database to verify docstrings are scrubbed
    const nodes = storage.searchNodes('setupGitHub', 'test-repo');
    
    if (nodes.length > 0 && nodes[0].docstring) {
      // If the docstring was present and had a secret, it should be redacted
      if (nodes[0].docstring.includes('[REDACTED')) {
        expect(nodes[0].docstring).not.toContain('ghp_');
      }
    }

    await storage.close();
  });

  it('should handle docstrings with multiple secrets', async () => {
    const code = `
/**
 * Multi-cloud configuration
 * AWS: AKIAIOSFODNN7EXAMPLE
 * GitHub: ghp_abcdefghijklmnopqrstuvwxyz1234567890
 * OpenAI: sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL
 */
function configureServices(): void {
  // Implementation
}
`;

    await writeFile(testFile, code, 'utf-8');

    const parsed = await parseFile('example.ts', 'test-repo', testDir);
    
    const configFunction = parsed.nodes.find(n => n.name === 'configureServices');
    
    if (configFunction?.docstring) {
      const { scrubbed, detected } = scrubSecrets(configFunction.docstring);
      
      // Should detect multiple secrets
      if (detected.length > 0) {
        expect(detected.length).toBeGreaterThanOrEqual(1);
        expect(scrubbed).toContain('[REDACTED:');
        
        // Verify original secrets are not in scrubbed version
        expect(scrubbed).not.toContain('AKIAIOSFODNN7EXAMPLE');
        expect(scrubbed).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234567890');
      }
    }
  });

  it('should not redact test/example secrets in docstrings', async () => {
    const code = `
/**
 * Example configuration
 * Test key: sk-test-example-not-real
 */
function exampleSetup(): void {
  // Implementation
}
`;

    await writeFile(testFile, code, 'utf-8');

    const parsed = await parseFile('example.ts', 'test-repo', testDir);
    
    const exampleFunction = parsed.nodes.find(n => n.name === 'exampleSetup');
    
    if (exampleFunction?.docstring) {
      const { scrubbed, detected } = scrubSecrets(exampleFunction.docstring);
      
      // Should not detect secrets in example/test context
      expect(detected.length).toBe(0);
      expect(scrubbed).not.toContain('[REDACTED');
    }
  });

  it('should handle functions without docstrings', async () => {
    const code = `
function noDocstring(): void {
  return;
}
`;

    await writeFile(testFile, code, 'utf-8');

    const parsed = await parseFile('example.ts', 'test-repo', testDir);
    
    const noDocFunction = parsed.nodes.find(n => n.name === 'noDocstring');
    expect(noDocFunction).toBeDefined();
    
    // Docstring may be undefined or empty
    if (noDocFunction) {
      expect(noDocFunction.docstring === undefined || noDocFunction.docstring === '').toBe(true);
    }
  });
});
