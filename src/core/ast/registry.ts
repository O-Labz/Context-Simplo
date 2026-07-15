/**
 * AST engine registry and selection logic.
 */

import type { AstEngine } from './engine.js';
import { HeuristicEngine } from './heuristic-engine.js';

export interface EngineConfig {
  enableHeuristic?: boolean;
  // Future: enableTreeSitter, enableBabel, etc.
}

/**
 * Select and return an ordered list of AST engines based on configuration.
 * Phase 5: only heuristic engine is available.
 */
export function selectEngine(config: EngineConfig = {}): AstEngine[] {
  const engines: AstEngine[] = [];

  if (config.enableHeuristic !== false) {
    engines.push(new HeuristicEngine());
  }

  return engines;
}
