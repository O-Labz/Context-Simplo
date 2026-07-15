/**
 * AST engine registry and selection logic.
 */

import type { AstEngine } from './engine.js';
import { AstEngineError } from './engine.js';
import { HeuristicEngine } from './heuristic-engine.js';
import { WasmEngine } from './wasm-engine.js';

export interface EngineConfig {
  enableWasm?: boolean;
  enableHeuristic?: boolean;
  enginePreference?: 'native' | 'wasm' | 'heuristic';
}

/**
 * Select and return an ordered list of AST engines based on configuration.
 * By default, WASM engine is preferred with heuristic fallback.
 * 
 * When AST_ENGINE=native, attempts to load native tree-sitter.
 * On failure, logs warning and falls back to WASM or heuristic.
 */
export async function selectEngine(config: EngineConfig = {}): Promise<AstEngine[]> {
  const engines: AstEngine[] = [];
  const preference = config.enginePreference || process.env.AST_ENGINE;

  // Native engine (opt-in via AST_ENGINE=native)
  if (preference === 'native') {
    try {
      const { NativeEngine } = await import('./native-engine.js');
      engines.push(new NativeEngine());
    } catch (error) {
      if (error instanceof AstEngineError) {
        console.warn('[ast.engine.fallback] Native tree-sitter unavailable, falling back:', error.message);
      } else {
        console.warn('[ast.engine.fallback] Failed to load native engine:', error);
      }
    }
  }

  // WASM engine (default enabled unless explicitly native-only)
  if (config.enableWasm !== false && preference !== 'heuristic') {
    engines.push(new WasmEngine());
  }

  // Heuristic engine as fallback (default enabled)
  if (config.enableHeuristic !== false) {
    engines.push(new HeuristicEngine());
  }

  return engines;
}
