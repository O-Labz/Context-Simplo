/**
 * Unit test for WASM engine - Phase 6A
 * Tests basic functionality with JavaScript grammar
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { WasmEngine } from '../../src/core/ast/wasm-engine.js';

describe('WasmEngine - Phase 6A', () => {
  const engine = new WasmEngine();

  beforeAll(async () => {
    // Initialize engine with JS grammar
    await engine.init(['js']);
  }, 10000); // 10s timeout for grammar loading

  it('should extract a call from JavaScript code', async () => {
    const source = `
function example() {
  console.log('hello');
  processData();
}
    `.trim();

    const result = engine.parse(source, 'js');
    
    // Should successfully parse
    expect(result).not.toBeNull();
    
    // Should extract function calls
    const callNames = result!.calls.map(c => c.calleeName);
    expect(callNames).toContain('log');
    expect(callNames).toContain('processData');
  });

  it('should compute complexity from AST node count', () => {
    const source = `
function calculate(x) {
  if (x > 0) {
    return x * 2;
  } else {
    return x * -2;
  }
}
    `.trim();

    const result = engine.parse(source, 'js');
    expect(result).not.toBeNull();
    
    // Complexity should be > 1 due to if/else branches
    const complexity = 1 + result!.branchCount;
    expect(complexity).toBeGreaterThan(1);
  });
});
