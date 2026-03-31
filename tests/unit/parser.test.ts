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
      expect(result.language).toBe('ts');
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
      expect(result.language).toBe('py');

      const calculatorClass = result.nodes.find(
        (n) => n.name === 'Calculator' && n.kind === 'class'
      );
      expect(calculatorClass).toBeDefined();
      expect(calculatorClass?.docstring).toContain('calculator');

      const addMethod = result.nodes.find(
        (n) => n.name === 'add' && n.kind === 'method'
      );
      expect(addMethod).toBeDefined();

      const factorialFunc = result.nodes.find(
        (n) => n.name === 'factorial' && n.kind === 'function'
      );
      expect(factorialFunc).toBeDefined();
      expect(factorialFunc?.docstring).toContain('factorial');
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
    it('should return true for supported languages', () => {
      expect(isLanguageSupported('typescript')).toBe(true);
      expect(isLanguageSupported('python')).toBe(true);
      expect(isLanguageSupported('rust')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      expect(isLanguageSupported('brainfuck')).toBe(false);
      expect(isLanguageSupported('unknown')).toBe(false);
    });
  });
});
