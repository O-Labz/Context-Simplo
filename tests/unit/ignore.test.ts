/**
 * ContextIgnore Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ContextIgnore } from '../../src/security/ignore.js';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { resolve } from 'path';

const TEST_DIR = resolve(__dirname, '../fixtures/ignore-test');
const IGNORE_FILE = resolve(TEST_DIR, '.contextignore');

describe('ContextIgnore', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    try {
      unlinkSync(IGNORE_FILE);
    } catch {}
    try {
      rmdirSync(TEST_DIR);
    } catch {}
  });

  it('should ignore node_modules by default', () => {
    const ignore = new ContextIgnore(TEST_DIR);

    expect(ignore.shouldIgnore('node_modules/package/index.js')).toBe(true);
    expect(ignore.shouldIgnore('src/node_modules/test.js')).toBe(true);
  });

  it('should ignore .git by default', () => {
    const ignore = new ContextIgnore(TEST_DIR);

    expect(ignore.shouldIgnore('.git/config')).toBe(true);
    expect(ignore.shouldIgnore('src/.git/HEAD')).toBe(true);
  });

  it('should ignore .env files by default', () => {
    const ignore = new ContextIgnore(TEST_DIR);

    expect(ignore.shouldIgnore('.env')).toBe(true);
    expect(ignore.shouldIgnore('.env.local')).toBe(true);
    expect(ignore.shouldIgnore('.env.production')).toBe(true);
  });

  it('should respect custom .contextignore patterns', () => {
    writeFileSync(
      IGNORE_FILE,
      `
# Custom patterns
secrets/
*.key
*.pem
test-data/
    `.trim()
    );

    const ignore = new ContextIgnore(TEST_DIR);

    expect(ignore.shouldIgnore('secrets/api-keys.txt')).toBe(true);
    expect(ignore.shouldIgnore('certs/private.key')).toBe(true);
    expect(ignore.shouldIgnore('certs/cert.pem')).toBe(true);
    expect(ignore.shouldIgnore('test-data/sample.json')).toBe(true);
    expect(ignore.shouldIgnore('src/index.ts')).toBe(false);
  });

  it('should support negation patterns', () => {
    writeFileSync(
      IGNORE_FILE,
      `
*.log
!important.log
    `.trim()
    );

    const ignore = new ContextIgnore(TEST_DIR);

    expect(ignore.shouldIgnore('debug.log')).toBe(true);
    expect(ignore.shouldIgnore('important.log')).toBe(false);
  });

  it('should filter arrays of paths', () => {
    writeFileSync(
      IGNORE_FILE,
      `
node_modules/
*.test.ts
    `.trim()
    );

    const ignore = new ContextIgnore(TEST_DIR);

    const paths = [
      'src/index.ts',
      'src/index.test.ts',
      'node_modules/package/index.js',
      'src/utils.ts',
    ];

    const filtered = ignore.filter(paths);

    expect(filtered).toEqual(['src/index.ts', 'src/utils.ts']);
  });

  it('should handle directory patterns', () => {
    writeFileSync(
      IGNORE_FILE,
      `
dist/
build/
    `.trim()
    );

    const ignore = new ContextIgnore(TEST_DIR);

    expect(ignore.shouldIgnore('dist/index.js')).toBe(true);
    expect(ignore.shouldIgnore('build/output.js')).toBe(true);
    expect(ignore.shouldIgnore('src/dist.ts')).toBe(false);
  });
});
