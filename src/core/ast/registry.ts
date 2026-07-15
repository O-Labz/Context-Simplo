/**
 * AST engine registry and selection logic.
 */

import type { AstEngine } from './engine.js';
import { HeuristicEngine } from './heuristic-engine.js';
import { WasmEngine } from './wasm-engine.js';

export interface EngineConfig {
  enableWasm?: boolean;
  enableHeuristic?: boolean;
}

/**
 * Select and return an ordered list of AST engines based on configuration.
 * By default, WASM engine is preferred with heuristic fallback.
 */
export function selectEngine(config: EngineConfig = {}): AstEngine[] {
  const engines: AstEngine[] = [];

  // WASM engine (default enabled)
  if (config.enableWasm !== false) {
    engines.push(new WasmEngine());
  }

  // Heuristic engine as fallback (default enabled)
  if (config.enableHeuristic !== false) {
    engines.push(new HeuristicEngine());
  }

  return engines;
}
