/**
 * Unit tests for heuristic AST engine
 */

import { describe, it, expect } from 'vitest';
import { HeuristicEngine } from '../../src/core/ast/heuristic-engine.js';

describe('HeuristicEngine', () => {
  const engine = new HeuristicEngine();

  it('should compute complexity 4 for function with 3 branches', () => {
    const source = `
function example() {
  if (condition1) {
    doSomething();
  }
  for (let i = 0; i < 10; i++) {
    process(i);
  }
  while (running) {
    update();
  }
  return result;
}
    `.trim();

    const result = engine.parse(source, 'ts');
    expect(result).not.toBeNull();
    expect(result!.branchCount).toBe(3);
    
    // Complexity = 1 + branchCount
    const complexity = 1 + result!.branchCount;
    expect(complexity).toBe(4);
  });

  it('should NOT capture calls inside line comments', () => {
    const source = `
function test() {
  // ignoredCall();
  actualCall();
}
    `.trim();

    const result = engine.parse(source, 'ts');
    expect(result).not.toBeNull();
    
    const callNames = result!.calls.map(c => c.calleeName);
    expect(callNames).toContain('actualCall');
    expect(callNames).not.toContain('ignoredCall');
  });

  it('should NOT capture calls inside block comments', () => {
    const source = `
function test() {
  /* ignoredCall(); */
  actualCall();
}
    `.trim();

    const result = engine.parse(source, 'ts');
    expect(result).not.toBeNull();
    
    const callNames = result!.calls.map(c => c.calleeName);
    expect(callNames).toContain('actualCall');
    expect(callNames).not.toContain('ignoredCall');
  });

  it('should NOT capture calls inside strings', () => {
    const source = `
function test() {
  const str = "ignoredCall()";
  actualCall();
}
    `.trim();

    const result = engine.parse(source, 'ts');
    expect(result).not.toBeNull();
    
    const callNames = result!.calls.map(c => c.calleeName);
    expect(callNames).toContain('actualCall');
    expect(callNames).not.toContain('ignoredCall');
  });

  it('should handle Python syntax', () => {
    const source = `
def example():
    # ignored_call()
    if condition:
        actual_call()
    for i in range(10):
        process(i)
    `.trim();

    const result = engine.parse(source, 'py');
    expect(result).not.toBeNull();
    expect(result!.branchCount).toBeGreaterThan(0);
    
    const callNames = result!.calls.map(c => c.calleeName);
    expect(callNames).toContain('actual_call');
    expect(callNames).not.toContain('ignored_call');
  });

  it('should handle Rust syntax', () => {
    const source = `
fn example() {
    // ignored_call();
    if condition {
        actual_call();
    }
    for i in 0..10 {
        process(i);
    }
}
    `.trim();

    const result = engine.parse(source, 'rs');
    expect(result).not.toBeNull();
    expect(result!.branchCount).toBeGreaterThan(0);
    
    const callNames = result!.calls.map(c => c.calleeName);
    expect(callNames).toContain('actual_call');
    expect(callNames).not.toContain('ignored_call');
  });

  it('should count branch operators (&&, ||, ?)', () => {
    const source = `
function test() {
  if (a && b || c) {
    return x ? y : z;
  }
}
    `.trim();

    const result = engine.parse(source, 'ts');
    expect(result).not.toBeNull();
    
    // Should count: if (1) + && (1) + || (1) + ? (1) = 4 branches
    expect(result!.branchCount).toBeGreaterThanOrEqual(4);
  });
});
