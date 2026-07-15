/**
 * Test that native tree-sitter engine falls back gracefully when unavailable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { selectEngine } from '../../src/core/ast/registry.js';

describe('Native AST engine fallback', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.AST_ENGINE;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AST_ENGINE;
    } else {
      process.env.AST_ENGINE = originalEnv;
    }
  });

  it('should load native engine when AST_ENGINE=native and deps are present, or fall back to WASM/heuristic', async () => {
    process.env.AST_ENGINE = 'native';

    const engines = await selectEngine();

    // Should have at least one engine
    expect(engines.length).toBeGreaterThan(0);

    // First engine should be native if available, otherwise wasm or heuristic
    const firstEngineName = engines[0]?.name;
    expect(['native', 'wasm', 'heuristic']).toContain(firstEngineName);

    // If native is not first, verify fallback chain is present
    if (firstEngineName !== 'native') {
      expect(['wasm', 'heuristic']).toContain(firstEngineName);
    }
  });

  it('should use WASM by default when AST_ENGINE is not set', async () => {
    delete process.env.AST_ENGINE;

    const engines = await selectEngine();

    expect(engines.length).toBeGreaterThan(0);
    expect(engines[0]?.name).toBe('wasm');
  });

  it('should use WASM when AST_ENGINE=wasm explicitly', async () => {
    process.env.AST_ENGINE = 'wasm';

    const engines = await selectEngine();

    expect(engines.length).toBeGreaterThan(0);
    expect(engines[0]?.name).toBe('wasm');
  });

  it('should use heuristic when AST_ENGINE=heuristic', async () => {
    process.env.AST_ENGINE = 'heuristic';

    const engines = await selectEngine({ enableWasm: false });

    expect(engines.length).toBeGreaterThan(0);
    expect(engines[0]?.name).toBe('heuristic');
  });

  it('should include fallback engines when requested', async () => {
    process.env.AST_ENGINE = 'native';

    const engines = await selectEngine();

    // Should have at least one engine
    expect(engines.length).toBeGreaterThanOrEqual(1);

    // Should have working engines available
    const hasWorkingEngine = engines.some(e => 
      e.name === 'native' || e.name === 'wasm' || e.name === 'heuristic'
    );
    expect(hasWorkingEngine).toBe(true);
  });

  it('should not break with empty config', async () => {
    process.env.AST_ENGINE = 'native';

    await expect(selectEngine()).resolves.toBeDefined();
    const engines = await selectEngine();
    expect(engines.length).toBeGreaterThan(0);
  });
});
