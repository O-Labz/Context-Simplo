/**
 * Comprehensive test for all 16 languages - Phase 6C final verification
 * Tests that all tier 1 + tier 2 grammars load and parse successfully
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { WasmEngine } from '../../src/core/ast/wasm-engine.js';

describe('WasmEngine - All Languages (Tier 1 + Tier 2)', () => {
  const engine = new WasmEngine();

  const allLanguages = [
    'ts', 'tsx', 'js', 'jsx',  // Tier 1: TypeScript/JavaScript
    'py',                       // Tier 1: Python
    'rs',                       // Tier 1: Rust
    'go',                       // Tier 1: Go
    'java',                     // Tier 1: Java
    'c', 'cpp', 'cs',          // Tier 2: C/C++/C#
    'rb', 'php',               // Tier 2: Ruby/PHP
    'swift', 'kt', 'dart',     // Tier 2: Swift/Kotlin/Dart
  ];

  beforeAll(async () => {
    // Initialize all languages
    await engine.init(allLanguages);
  }, 60000); // 60s timeout for all grammars

  describe('Grammar Loading and Parsing', () => {
    it.each(allLanguages)('should load and parse %s code', (lang) => {
      // Language-specific test code
      const testCode: Record<string, string> = {
        ts: 'function test() { return 42; }',
        tsx: 'function test() { return <div>test</div>; }',
        js: 'function test() { return 42; }',
        jsx: 'function test() { return <div>test</div>; }',
        py: 'def test():\n    return 42',
        rs: 'fn test() { return 42; }',
        go: 'func test() int { return 42 }',
        java: 'class Test { int test() { return 42; } }',
        c: 'int test() { return 42; }',
        cpp: 'int test() { return 42; }',
        cs: 'class Test { int Test() { return 42; } }',
        rb: 'def test\n  42\nend',
        php: '<?php function test() { return 42; } ?>',
        swift: 'func test() -> Int { return 42 }',
        kt: 'fun test(): Int { return 42 }',
        dart: 'int test() { return 42; }',
      };

      const source = testCode[lang] || 'function test() {}';
      const result = engine.parse(source, lang);
      
      // Should successfully parse
      expect(result).not.toBeNull();
      expect(result!.calls).toBeInstanceOf(Array);
      expect(result!.branchCount).toBeGreaterThanOrEqual(0);
      expect(result!.complexityBySymbol).toBeInstanceOf(Map);
    });
  });

  describe('Complexity Computation', () => {
    it('should compute complexity for branching TypeScript code', () => {
      const source = `
function calculate(x: number): number {
  if (x > 10) {
    return x * 2;
  } else if (x > 5) {
    return x * 3;
  } else {
    return x * 4;
  }
}`;
      const result = engine.parse(source, 'ts');
      expect(result).not.toBeNull();
      
      // Should have non-zero complexity due to branches
      const complexity = 1 + result!.branchCount;
      expect(complexity).toBeGreaterThan(1);
    });

    it('should compute complexity for Python code', () => {
      const source = `
def calculate(x):
    if x > 10:
        return x * 2
    elif x > 5:
        return x * 3
    else:
        return x * 4
`;
      const result = engine.parse(source, 'py');
      expect(result).not.toBeNull();
      
      const complexity = 1 + result!.branchCount;
      expect(complexity).toBeGreaterThan(1);
    });

    it('should compute complexity for Java code', () => {
      const source = `
class Calculator {
    int calculate(int x) {
        if (x > 10) {
            return x * 2;
        } else if (x > 5) {
            return x * 3;
        } else {
            return x * 4;
        }
    }
}`;
      const result = engine.parse(source, 'java');
      expect(result).not.toBeNull();
      
      const complexity = 1 + result!.branchCount;
      expect(complexity).toBeGreaterThan(1);
    });
  });

  describe('Parse Large Files', () => {
    it('should handle moderately large TypeScript file', () => {
      // Generate a 100-line file
      const lines = Array.from({ length: 100 }, (_, i) => 
        `function func${i}() { return ${i}; }`
      );
      const source = lines.join('\n');
      
      const result = engine.parse(source, 'ts');
      expect(result).not.toBeNull();
      expect(result!.branchCount).toBeGreaterThanOrEqual(0);
    });
  });
});
