/**
 * Heuristic AST engine that strips comments/strings and extracts calls using regex.
 * No external dependencies.
 */

import type { AstEngine, AstResult } from './engine.js';
import { computeComplexityFromSource } from './complexity.js';

interface LanguageDelimiters {
  lineComment?: string[];
  blockComment?: Array<{ start: string; end: string }>;
  stringDelimiters?: string[];
}

const LANGUAGE_DELIMITERS: Record<string, LanguageDelimiters> = {
  ts: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
  },
  tsx: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
  },
  js: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
  },
  jsx: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'", '`'],
  },
  py: {
    lineComment: ['#'],
    blockComment: [{ start: '"""', end: '"""' }, { start: "'''", end: "'''" }],
    stringDelimiters: ['"', "'"],
  },
  rs: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"'],
  },
  go: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', '`'],
  },
  java: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"'],
  },
  c: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"'],
  },
  cpp: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"'],
  },
  cs: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"'],
  },
  rb: {
    lineComment: ['#'],
    blockComment: [{ start: '=begin', end: '=end' }],
    stringDelimiters: ['"', "'"],
  },
  php: {
    lineComment: ['//', '#'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'"],
  },
  swift: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"'],
  },
  kt: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"'],
  },
  dart: {
    lineComment: ['//'],
    blockComment: [{ start: '/*', end: '*/' }],
    stringDelimiters: ['"', "'"],
  },
};

export class HeuristicEngine implements AstEngine {
  readonly name = 'heuristic';

  parse(source: string, language: string): AstResult | null {
    const delimiters = LANGUAGE_DELIMITERS[language];
    if (!delimiters) {
      // Fallback for unknown languages
      return this.parseFallback(source);
    }

    const stripped = this.stripCommentsAndStrings(source, delimiters);
    const calls = this.extractCalls(stripped);
    const complexity = computeComplexityFromSource(stripped);

    return {
      calls,
      branchCount: complexity - 1,
      complexityBySymbol: new Map(), // Populated by parser with line span context
    };
  }

  private parseFallback(source: string): AstResult {
    // Basic fallback: strip C-style comments and strings
    const delimiters: LanguageDelimiters = {
      lineComment: ['//'],
      blockComment: [{ start: '/*', end: '*/' }],
      stringDelimiters: ['"', "'"],
    };
    const stripped = this.stripCommentsAndStrings(source, delimiters);
    const calls = this.extractCalls(stripped);
    const complexity = computeComplexityFromSource(stripped);

    return {
      calls,
      branchCount: complexity - 1,
      complexityBySymbol: new Map(),
    };
  }

  private stripCommentsAndStrings(source: string, delimiters: LanguageDelimiters): string {
    let result = source;

    // Remove block comments first
    if (delimiters.blockComment) {
      for (const { start, end } of delimiters.blockComment) {
        const startEsc = this.escapeRegex(start);
        const endEsc = this.escapeRegex(end);
        const regex = new RegExp(`${startEsc}[\\s\\S]*?${endEsc}`, 'g');
        result = result.replace(regex, ' ');
      }
    }

    // Remove line comments
    if (delimiters.lineComment) {
      for (const prefix of delimiters.lineComment) {
        const escaped = this.escapeRegex(prefix);
        const regex = new RegExp(`${escaped}.*$`, 'gm');
        result = result.replace(regex, ' ');
      }
    }

    // Remove strings
    if (delimiters.stringDelimiters) {
      for (const delim of delimiters.stringDelimiters) {
        const escaped = this.escapeRegex(delim);
        // Match string literals, handling basic escapes
        const regex = new RegExp(`${escaped}(?:\\\\.|[^${escaped}\\\\])*${escaped}`, 'g');
        result = result.replace(regex, ' ');
      }
    }

    return result;
  }

  private extractCalls(source: string): Array<{ callerLine: number; calleeName: string }> {
    const calls: Array<{ callerLine: number; calleeName: string }> = [];
    const lines = source.split('\n');

    const callRegex = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
    const keywords = new Set([
      'if', 'for', 'while', 'switch', 'catch', 'return', 'throw',
      'new', 'typeof', 'instanceof', 'function', 'class', 'import',
      'export', 'const', 'let', 'var', 'await', 'async', 'yield',
      'def', 'lambda', 'pass', 'break', 'continue', 'del', 'raise',
      'try', 'except', 'finally', 'with', 'assert', 'match', 'case',
      'fn', 'pub', 'mod', 'use', 'impl', 'trait', 'struct', 'enum',
      'func', 'package', 'interface', 'defer', 'go', 'select', 'chan',
      'public', 'private', 'protected', 'static', 'final', 'abstract',
      'extends', 'implements', 'void', 'int', 'bool', 'string', 'float',
    ]);

    const seen = new Set<string>();

    lines.forEach((line, idx) => {
      let match: RegExpExecArray | null;
      const lineRegex = new RegExp(callRegex.source, 'g');
      
      while ((match = lineRegex.exec(line)) !== null) {
        const calleeName = match[1];
        if (!calleeName || keywords.has(calleeName) || seen.has(calleeName)) continue;
        seen.add(calleeName);
        calls.push({ callerLine: idx + 1, calleeName });
      }

      // Member calls
      const memberCallRegex = /\.([a-zA-Z_$][\w$]*)\s*\(/g;
      let memberMatch: RegExpExecArray | null;
      while ((memberMatch = memberCallRegex.exec(line)) !== null) {
        const calleeName = memberMatch[1];
        if (!calleeName || seen.has(calleeName)) continue;
        seen.add(calleeName);
        calls.push({ callerLine: idx + 1, calleeName });
      }
    });

    return calls;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
