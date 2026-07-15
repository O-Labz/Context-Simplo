/**
 * AST Engine abstraction for pluggable parsing strategies.
 */

export interface AstEngine {
  readonly name: string;
  parse(source: string, language: string): AstResult | null;
}

export interface AstResult {
  calls: Array<{ callerLine: number; calleeName: string }>;
  branchCount: number;
  complexityBySymbol: Map<string, number>;
}

export class AstEngineError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'AstEngineError';
  }
}
