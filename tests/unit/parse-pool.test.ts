import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { ParsePool } from '../../src/core/parse-pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('ParsePool', () => {
  let parsePool: ParsePool;
  let tempDir: string;
  let testFilePath: string;
  const workerPath = resolve(__dirname, '../../dist/core/parse-worker.js');

  beforeEach(() => {
    // Create a temporary directory and test file
    tempDir = resolve(__dirname, '../fixtures/temp-parse-test');
    mkdirSync(tempDir, { recursive: true });
    testFilePath = resolve(tempDir, 'test.js');
    
    // Write a simple test file
    writeFileSync(testFilePath, `
function hello() {
  return "world";
}

module.exports = { hello };
`);

    parsePool = new ParsePool({
      size: 2,
      recycleAfter: 3,
      workerHeapMb: 512,
      workerPath,
    });
  });

  afterEach(async () => {
    if (parsePool) {
      await parsePool.terminate();
    }
    
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should parse a real fixture file', async () => {
    const result = await parsePool.parse({
      filePath: testFilePath,
      repositoryId: 'test-repo',
      workspaceRoot: tempDir,
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result?.filePath).toBe('test.js');
    expect(result?.language).toBe('javascript');
  });

  it('should handle multiple concurrent requests', async () => {
    const requests = Array.from({ length: 4 }, (_, i) => ({
      filePath: testFilePath,
      repositoryId: `test-repo-${i}`,
      workspaceRoot: tempDir,
    }));

    const results = await Promise.all(
      requests.map(req => parsePool.parse(req))
    );

    expect(results).toHaveLength(4);
    expect(results.every(r => r !== null)).toBe(true);
  });

  it('should recycle workers after reaching recycleAfter count', async () => {
    const initialStats = parsePool.getStats();
    expect(initialStats.size).toBe(2);
    expect(initialStats.totalParsed).toBe(0);

    // Parse enough files to trigger recycling (3 files per worker to trigger recycle)
    const requests = Array.from({ length: 6 }, (_, i) => ({
      filePath: testFilePath,
      repositoryId: `test-repo-${i}`,
      workspaceRoot: tempDir,
    }));

    await Promise.all(requests.map(req => parsePool.parse(req)));

    const finalStats = parsePool.getStats();
    expect(finalStats.totalParsed).toBe(6);
    expect(finalStats.size).toBe(2); // Pool size should remain the same
  });

  it('should handle security violations gracefully', async () => {
    // Try to parse a file outside the workspace
    const outsideFile = resolve('/tmp/outside-file.js');
    
    const result = await parsePool.parse({
      filePath: outsideFile,
      repositoryId: 'test-repo',
      workspaceRoot: tempDir,
    });

    // Should return null for security violations (file skipped)
    expect(result).toBeNull();
  });

  it('should provide accurate stats', async () => {
    const initialStats = parsePool.getStats();
    expect(initialStats.size).toBe(2);
    expect(initialStats.busy).toBe(0);
    expect(initialStats.queued).toBe(0);
    expect(initialStats.totalParsed).toBe(0);

    // Start a parse operation
    const parsePromise = parsePool.parse({
      filePath: testFilePath,
      repositoryId: 'test-repo',
      workspaceRoot: tempDir,
    });

    // Check stats while operation is in progress (may be 0 or 1 depending on timing)
    const duringStats = parsePool.getStats();
    expect(duringStats.size).toBe(2);
    expect(duringStats.busy).toBeGreaterThanOrEqual(0);
    expect(duringStats.busy).toBeLessThanOrEqual(1);

    await parsePromise;

    const finalStats = parsePool.getStats();
    expect(finalStats.busy).toBe(0);
    expect(finalStats.totalParsed).toBe(1);
  });

  it('should terminate gracefully', async () => {
    const stats = parsePool.getStats();
    expect(stats.size).toBe(2);

    await parsePool.terminate();

    const finalStats = parsePool.getStats();
    expect(finalStats.size).toBe(0);

    // Should reject new requests after termination
    await expect(
      parsePool.parse({
        filePath: testFilePath,
        repositoryId: 'test-repo',
        workspaceRoot: tempDir,
      })
    ).rejects.toThrow('Parse pool is terminated');
  });
});