/**
 * WASM-based AST engine using web-tree-sitter.
 * Provides high-accuracy parsing with compiled grammar files.
 */

import type { AstEngine, AstResult } from './engine.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Lazy-init classes
let ParserClass: any = null;
let LanguageClass: any = null;
let initPromise: Promise<void> | null = null;

async function initParser(): Promise<void> {
  if (ParserClass && LanguageClass) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const TreeSitter = await import('web-tree-sitter');
    const Parser = TreeSitter.Parser;
    const Language = TreeSitter.Language;
    
    if (!Parser || typeof Parser !== 'function') {
      throw new Error('Failed to load web-tree-sitter Parser');
    }
    
    if (!Language || typeof Language !== 'function') {
      throw new Error('Failed to load web-tree-sitter Language');
    }
    
    // Initialize the parser with the WASM binary
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const wasmPath = join(__dirname, '../../../node_modules/web-tree-sitter/web-tree-sitter.wasm');
    
    try {
      await Parser.init({
        locateFile() {
          return wasmPath;
        },
      });
    } catch (error) {
      console.error('Failed to initialize web-tree-sitter:', error);
      throw error;
    }
    
    // Set classes after successful init
    ParserClass = Parser;
    LanguageClass = Language;
  })();

  return initPromise;
}

interface LanguageCache {
  language: any;
  query?: any;
}

const languageCache = new Map<string, LanguageCache>();

// Map our language codes to grammar file names
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

// Per-language call queries (tree-sitter query syntax)
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
    if (!LanguageClass) return null;

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const grammarPath = join(__dirname, 'grammars', `${grammarName}.wasm`);

    const languageInstance = await LanguageClass.load(grammarPath);
    
    // Load query if available
    let query: any | undefined;
    const queryString = CALL_QUERIES[language];
    if (queryString) {
      try {
        query = languageInstance.query(queryString);
      } catch (error) {
        // Query loading can fail for some grammars, that's OK
        // We'll still be able to parse and compute complexity
        console.warn(`Failed to load query for ${language}:`, error);
      }
    }

    const cache: LanguageCache = { language: languageInstance, query };
    languageCache.set(language, cache);
    return cache;
  } catch (error) {
    console.warn(`Failed to load WASM grammar for ${language}:`, error);
    return null;
  }
}

/**
 * Count AST node types to estimate complexity.
 * Higher node count = more complex code structure.
 */
function computeComplexityFromTree(tree: any): number {
  const root = tree.rootNode;
  let nodeCount = 0;

  function traverse(node: any): void {
    nodeCount++;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) traverse(child);
    }
  }

  traverse(root);
  
  // Normalize: complexity = 1 + (nodes / 10)
  return Math.max(1, Math.floor(1 + nodeCount / 10));
}

/**
 * Extract function/method call names from query captures.
 */
function extractCallsFromQuery(
  tree: any,
  query: any,
  source: string
): Array<{ callerLine: number; calleeName: string }> {
  const calls: Array<{ callerLine: number; calleeName: string }> = [];
  const seen = new Set<string>();

  const captures = query.captures(tree.rootNode);
  for (const capture of captures) {
    const node = capture.node;
    const line = node.startPosition.row + 1;
    let calleeName = source.slice(node.startIndex, node.endIndex);

    // Extract final identifier from member expressions
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

export class WasmEngine implements AstEngine {
  readonly name = 'wasm';

  parse(source: string, language: string): AstResult | null {
    // Return null if not yet initialized (will fall back to heuristic)
    // Proper async initialization should happen before first parse
    const cache = languageCache.get(language);
    if (!cache || !ParserClass) {
      return null;
    }

    try {
      const parserInstance = new ParserClass();
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
      console.warn(`WASM parse error for ${language}:`, error);
      return null;
    }
  }

  /**
   * Async initialization helper - must be called before parse().
   * Typically called at app startup or in test setup.
   */
  async init(languages: string[]): Promise<void> {
    await initParser();
    await Promise.all(languages.map(lang => loadLanguage(lang)));
  }
}
