import { describe, it, expect, beforeAll } from 'vitest';
import { parseFile, isLanguageSupported } from '../../src/core/parser.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = resolve(__dirname, '../fixtures');

describe('Parser', () => {
  describe('parseFile', () => {
    it('should parse TypeScript file and extract classes and methods', async () => {
      const result = await parseFile(
        'sample-ts/index.ts',
        'test-repo',
        fixturesDir
      );

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.language).toBe('typescript');
      expect(result.hash).toBeTruthy();

      const userServiceClass = result.nodes.find(
        (n) => n.name === 'UserService' && n.kind === 'class'
      );
      expect(userServiceClass).toBeDefined();
      expect(userServiceClass?.isExported).toBe(true);

      const fetchUserMethod = result.nodes.find(
        (n) => n.name === 'fetchUser' && n.kind === 'method'
      );
      expect(fetchUserMethod).toBeDefined();
      expect(fetchUserMethod?.qualifiedName).toContain('UserService');

      const validateEmailFunc = result.nodes.find(
        (n) => n.name === 'validateEmail' && n.kind === 'function'
      );
      expect(validateEmailFunc).toBeDefined();
      expect(validateEmailFunc?.isExported).toBe(true);
    });

    it('should parse Python file and extract classes and functions', async () => {
      const result = await parseFile(
        'sample-py/main.py',
        'test-repo',
        fixturesDir
      );

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.language).toBe('python');

      const calculatorClass = result.nodes.find(
        (n) => n.name === 'Calculator' && n.kind === 'class'
      );
      expect(calculatorClass).toBeDefined();

      // Python tree-sitter returns function_definition for methods → mapped to 'function'
      const addMethod = result.nodes.find(
        (n) => n.name === 'add' && (n.kind === 'method' || n.kind === 'function')
      );
      expect(addMethod).toBeDefined();

      const factorialFunc = result.nodes.find(
        (n) => n.name === 'factorial' && n.kind === 'function'
      );
      expect(factorialFunc).toBeDefined();
    });

    it('should extract function calls', async () => {
      const result = await parseFile(
        'sample-py/main.py',
        'test-repo',
        fixturesDir
      );

      expect(result.calls.length).toBeGreaterThan(0);

      const factorialCall = result.calls.find((c) => c.calleeName === 'factorial');
      expect(factorialCall).toBeDefined();
    });

    it('should handle unsupported language gracefully', async () => {
      const result = await parseFile(
        'sample.unknown',
        'test-repo',
        fixturesDir
      );

      expect(result.nodes).toEqual([]);
      expect(result.language).toBe('unknown');
    });
  });

  describe('isLanguageSupported', () => {
    it('should return true for supported languages', async () => {
      expect(await isLanguageSupported('typescript')).toBe(true);
      expect(await isLanguageSupported('python')).toBe(true);
      expect(await isLanguageSupported('rust')).toBe(true);
    });

    it('should return false for unsupported languages', async () => {
      expect(await isLanguageSupported('brainfuck')).toBe(false);
      expect(await isLanguageSupported('unknown')).toBe(false);
    });
  });
});
