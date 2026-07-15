/**
 * Native tree-sitter AST engine using node-gyp bindings.
 * Only used when AST_ENGINE=native. Guarded dynamic import ensures
 * a failed/absent native build never breaks startup or Docker.
 */

import type { AstEngine, AstResult } from './engine.js';
import { AstEngineError } from './engine.js';

// Type declarations for optional tree-sitter dependency
interface TreeSitterNode {
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  startIndex: number;
  endIndex: number;
  childCount: number;
  child(index: number): TreeSitterNode | null;
}

interface TreeSitterTree {
  rootNode: TreeSitterNode;
}

interface TreeSitterQuery {
  captures(node: TreeSitterNode): Array<{ node: TreeSitterNode; name: string }>;
}

interface TreeSitterLanguage {
  query(source: string): TreeSitterQuery;
}

interface TreeSitterParser {
  setLanguage(language: TreeSitterLanguage): void;
  parse(source: string): TreeSitterTree;
}

interface TreeSitterParserConstructor {
  new (): TreeSitterParser;
}

let Parser: TreeSitterParserConstructor | null = null;
let initPromise: Promise<void> | null = null;

async function initParser(): Promise<void> {
  if (Parser) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // @ts-ignore - tree-sitter is an optional dependency
      const TreeSitter = await import('tree-sitter');
      Parser = (TreeSitter.default || TreeSitter) as unknown as TreeSitterParserConstructor;
      
      if (!Parser || typeof Parser !== 'function') {
        throw new AstEngineError('Failed to load native tree-sitter Parser');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AstEngineError(
        `Native tree-sitter unavailable: ${message}. Install with 'npm install tree-sitter' or use AST_ENGINE=wasm`,
        error
      );
    }
  })();

  return initPromise;
}

const LANGUAGE_GRAMMAR_MAP: Record<string, string> = {
  ts: 'tree-sitter-typescript',
  tsx: 'tree-sitter-tsx',
  js: 'tree-sitter-javascript',
  jsx: 'tree-sitter-javascript',
  py: 'tree-sitter-python',
  rs: 'tree-sitter-rust',
  go: 'tree-sitter-go',
  java: 'tree-sitter-java',
  c: 'tree-sitter-c',
  cpp: 'tree-sitter-cpp',
  cs: 'tree-sitter-c-sharp',
  rb: 'tree-sitter-ruby',
  php: 'tree-sitter-php',
  swift: 'tree-sitter-swift',
  kt: 'tree-sitter-kotlin',
  dart: 'tree-sitter-dart',
};

const CALL_QUERIES: Record<string, string> = {
  ts: '(call_expression function: [(identifier) (member_expression)] @call)',
  tsx: '(call_expression function: [(identifier) (member_expression)] @call)',
  js: '(call_expression function: [(identifier) (member_expression)] @call)',
  jsx: '(call_expression function: [(identifier) (member_expression)] @call)',
  py: '(call function: [(identifier) (attribute)] @call)',
  rs: '(call_expression function: [(identifier) (field_expression)] @call)',
  go: '(call_expression function: [(identifier) (selector_expression)] @call)',
  java: '(method_invocation name: (identifier) @call)',
  c: '(call_expression function: [(identifier) (field_expression)] @call)',
  cpp: '(call_expression function: [(identifier) (field_expression)] @call)',
  cs: '(invocation_expression function: [(identifier) (member_access_expression)] @call)',
  rb: '(call method: [(identifier) (call)] @call)',
  php: '(function_call_expression function: [(name) (qualified_name)] @call)',
  swift: '(call_expression function: [(identifier) (navigation_expression)] @call)',
  kt: '(call_expression function: [(identifier) (navigation_expression)] @call)',
  dart: '(function_expression_body (identifier) @call)',
};

interface LanguageCache {
  language: TreeSitterLanguage;
  query?: TreeSitterQuery;
}

const languageCache = new Map<string, LanguageCache>();

async function loadLanguage(language: string): Promise<LanguageCache | null> {
  if (languageCache.has(language)) {
    return languageCache.get(language)!;
  }

  const grammarName = LANGUAGE_GRAMMAR_MAP[language];
  if (!grammarName) {
    return null;
  }

  try {
    await initParser();
    if (!Parser) return null;

    // @ts-ignore - native grammars are optional dependencies
    const grammarModule = await import(grammarName);
    const languageInstance = grammarModule.default || grammarModule;

    let query: TreeSitterQuery | undefined;
    const queryString = CALL_QUERIES[language];
    if (queryString) {
      try {
        query = languageInstance.query(queryString);
      } catch (error) {
        console.warn(`Failed to load query for ${language}:`, error);
      }
    }

    const cache: LanguageCache = { language: languageInstance, query };
    languageCache.set(language, cache);
    return cache;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AstEngineError(
      `Failed to load native grammar for ${language}: ${message}`,
      error
    );
  }
}

function computeComplexityFromTree(tree: TreeSitterTree): number {
  const root = tree.rootNode;
  let nodeCount = 0;

  function traverse(node: TreeSitterNode): void {
    nodeCount++;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) traverse(child);
    }
  }

  traverse(root);
  return Math.max(1, Math.floor(1 + nodeCount / 10));
}

function extractCallsFromQuery(
  tree: TreeSitterTree,
  query: TreeSitterQuery,
  source: string
): Array<{ callerLine: number; calleeName: string }> {
  const calls: Array<{ callerLine: number; calleeName: string }> = [];
  const seen = new Set<string>();

  const captures = query.captures(tree.rootNode);
  for (const capture of captures) {
    const node = capture.node;
    const line = node.startPosition.row + 1;
    let calleeName = source.slice(node.startIndex, node.endIndex);

    if (calleeName.includes('.')) {
      const parts = calleeName.split('.');
      calleeName = parts[parts.length - 1] || calleeName;
    }

    const key = `${line}:${calleeName}`;
    if (!seen.has(key) && calleeName && /^[a-zA-Z_$][\w$]*$/.test(calleeName)) {
      seen.add(key);
      calls.push({ callerLine: line, calleeName });
    }
  }

  return calls;
}

export class NativeEngine implements AstEngine {
  readonly name = 'native';

  parse(source: string, language: string): AstResult | null {
    const cache = languageCache.get(language);
    if (!cache || !Parser) {
      return null;
    }

    try {
      const parserInstance = new Parser();
      parserInstance.setLanguage(cache.language);

      const tree = parserInstance.parse(source);
      if (!tree) return null;

      const calls = cache.query
        ? extractCallsFromQuery(tree, cache.query, source)
        : [];

      const complexity = computeComplexityFromTree(tree);

      return {
        calls,
        branchCount: Math.max(0, complexity - 1),
        complexityBySymbol: new Map(),
      };
    } catch (error) {
      console.warn(`Native parse error for ${language}:`, error);
      return null;
    }
  }

  async init(languages: string[]): Promise<void> {
    await initParser();
    await Promise.all(languages.map(lang => loadLanguage(lang)));
  }
}
