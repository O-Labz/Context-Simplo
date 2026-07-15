/**
 * Smoke test for WASM grammars - Phase 6B
 * Verifies all tier 1 grammars load successfully under web-tree-sitter
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { WasmEngine } from '../../src/core/ast/wasm-engine.js';

describe('WasmEngine - Tier 1 Grammar Smoke Test', () => {
  const engine = new WasmEngine();

  const tier1Languages = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java'];

  beforeAll(async () => {
    // Initialize all tier 1 languages
    await engine.init(tier1Languages);
  }, 30000); // 30s timeout for all grammars

  describe('Grammar Loading', () => {
    it.each(tier1Languages)('should load %s grammar', (lang) => {
      const source = lang === 'py' ? 'def test():\n    pass' : 'function test() {}';
      const result = engine.parse(source, lang);
      
      // Should successfully parse (not null)
      expect(result).not.toBeNull();
      expect(result!.calls).toBeInstanceOf(Array);
      expect(result!.branchCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Call Extraction', () => {
    it('should extract TypeScript calls', () => {
      const source = `
function example() {
  console.log('test');
  processData();
}`;
      const result = engine.parse(source, 'ts');
      expect(result).not.toBeNull();
      const calls = result!.calls.map(c => c.calleeName);
      expect(calls).toContain('log');
      expect(calls).toContain('processData');
    });

    it('should extract Python calls', () => {
      const source = `
def example():
    print("test")
    process_data()
`;
      const result = engine.parse(source, 'py');
      expect(result).not.toBeNull();
      const calls = result!.calls.map(c => c.calleeName);
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should extract Rust calls', () => {
      const source = `
fn example() {
    println!("test");
    process_data();
}`;
      const result = engine.parse(source, 'rs');
      expect(result).not.toBeNull();
      expect(result!.calls).toBeInstanceOf(Array);
    });

    it('should extract Go calls', () => {
      const source = `
func example() {
    fmt.Println("test")
    processData()
}`;
      const result = engine.parse(source, 'go');
      expect(result).not.toBeNull();
      const calls = result!.calls.map(c => c.calleeName);
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should extract Java calls', () => {
      const source = `
class Example {
    void example() {
        System.out.println("test");
        processData();
    }
}`;
      const result = engine.parse(source, 'java');
      expect(result).not.toBeNull();
      const calls = result!.calls.map(c => c.calleeName);
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  describe('Complexity Computation', () => {
    it('should compute complexity for branching code', () => {
      const source = `
function complex(x) {
  if (x > 0) {
    return x * 2;
  } else if (x < 0) {
    return x * -2;
  } else {
    return 0;
  }
}`;
      const result = engine.parse(source, 'js');
      expect(result).not.toBeNull();
      
      // Should detect branches and compute complexity > 1
      const complexity = 1 + result!.branchCount;
      expect(complexity).toBeGreaterThan(1);
    });
  });
});
