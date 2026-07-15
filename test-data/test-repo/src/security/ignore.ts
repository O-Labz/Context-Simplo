/**
 * Contextignore Parser - .gitignore-style exclusion patterns
 *
 * What it does:
 * Parses .contextignore files and filters file paths using pathspec-compatible
 * glob matching.
 *
 * Inputs: .contextignore file content, file paths to test
 * Outputs: Boolean (should ignore this path?)
 * Constraints: Must match .gitignore semantics exactly
 * Assumptions: ignore package handles pathspec correctly
 * Failure cases: Malformed patterns, conflicting rules
 *
 * Design:
 * - Uses 'ignore' npm package (same engine as .gitignore)
 * - Loads .contextignore from repository root
 * - Falls back to .contextignore.default if not found
 * - Supports negation patterns (!pattern)
 * - Supports directory patterns (dir/)
 *
 * Performance: O(p * n) where p=patterns, n=path segments
 * Concurrency: Stateless after initialization, thread-safe
 * Security: Prevents indexing sensitive directories
 */

import ignore, { type Ignore } from 'ignore';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ContextIgnore {
  private ig: Ignore;

  constructor(workspaceRoot: string, defaultIgnorePath?: string) {
    this.ig = ignore();

    const contextIgnorePath = resolve(workspaceRoot, '.contextignore');
    const hasCustomIgnore = existsSync(contextIgnorePath);

    if (hasCustomIgnore) {
      try {
        const content = readFileSync(contextIgnorePath, 'utf-8');
        this.ig.add(content);
      } catch (error) {
        console.warn('Failed to read .contextignore, using defaults:', error);
        this.loadDefaults(defaultIgnorePath);
      }
    } else {
      this.loadDefaults(defaultIgnorePath);
    }
  }

  private loadDefaults(defaultIgnorePath?: string): void {
    const defaultPath =
      defaultIgnorePath || resolve(__dirname, '../../.contextignore.default');

    if (existsSync(defaultPath)) {
      try {
        const content = readFileSync(defaultPath, 'utf-8');
        this.ig.add(content);
      } catch (error) {
        console.warn('Failed to read .contextignore.default:', error);
      }
    }

    this.ig.add([
      'node_modules/',
      '.git/',
      'dist/',
      'build/',
      '.env*',
      '*.pem',
      '*.key',
      '*.p12',
    ]);
  }

  shouldIgnore(filePath: string): boolean {
    return this.ig.ignores(filePath);
  }

  filter(filePaths: string[]): string[] {
    return filePaths.filter((path) => !this.shouldIgnore(path));
  }
}
