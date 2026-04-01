/**
 * CLI Integration Tests
 *
 * Tests CLI commands via spawn for argument parsing and error handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('CLI', () => {
  let tempDir: string;
  const CLI_PATH = join(process.cwd(), 'dist', 'cli', 'index.js');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cli-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve) => {
      const proc = spawn('node', [CLI_PATH, ...args], {
        env: { ...process.env, DATA_DIR: tempDir },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ stdout, stderr, exitCode: null });
      }, 5000);
    });
  }

  describe('status command', () => {
    it('should show status without errors', async () => {
      const result = await runCLI(['status', '--data-dir', tempDir]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('repositories');
    });
  });

  describe('index command', () => {
    it('should reject invalid paths', async () => {
      const result = await runCLI(['index', '/nonexistent/path', '--data-dir', tempDir]);
      
      expect(result.exitCode).not.toBe(0);
    });

    it('should index a valid directory', async () => {
      const testDir = join(tempDir, 'test-repo');
      await mkdir(testDir);
      await writeFile(join(testDir, 'test.ts'), 'export function hello() {}');

      const result = await runCLI(['index', testDir, '--data-dir', tempDir]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('indexed') || expect(result.stdout).toContain('complete');
    });
  });

  describe('search command', () => {
    it('should handle empty database gracefully', async () => {
      const result = await runCLI(['search', 'test', '--data-dir', tempDir]);
      
      expect(result.exitCode).toBe(0);
    });

    it('should reject invalid mode', async () => {
      const result = await runCLI(['search', 'test', '--mode', 'invalid', '--data-dir', tempDir]);
      
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('setup command', () => {
    it('should show help when run without interaction', async () => {
      const result = await runCLI(['setup', '--help']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('setup');
    });
  });
});
