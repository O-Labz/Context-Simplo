/**
 * Code Snippet Extractor
 * 
 * Extracts code snippets from source files for search results.
 * Provides context-aware truncation and formatting.
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';

export interface SnippetOptions {
  maxLines?: number;
  maxChars?: number;
  contextLines?: number;
}

const DEFAULT_OPTIONS: Required<SnippetOptions> = {
  maxLines: 10,
  maxChars: 500,
  contextLines: 2,
};

/**
 * Extract code snippet from a file
 * 
 * @param workspaceRoot - Root directory of the workspace
 * @param filePath - Relative path to the file
 * @param lineStart - Starting line number (1-indexed)
 * @param lineEnd - Ending line number (1-indexed)
 * @param options - Snippet extraction options
 * @returns Code snippet or undefined if file cannot be read
 */
export async function extractSnippet(
  workspaceRoot: string,
  filePath: string,
  lineStart: number,
  lineEnd: number,
  options: SnippetOptions = {}
): Promise<string | undefined> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    const fullPath = resolve(workspaceRoot, filePath);
    const content = await readFile(fullPath, 'utf-8');
    const lines = content.split('\n');
    
    // Calculate actual range with context
    const startIdx = Math.max(0, lineStart - 1 - opts.contextLines);
    const endIdx = Math.min(lines.length, lineEnd + opts.contextLines);
    
    let snippetLines = lines.slice(startIdx, endIdx);
    
    // Truncate if too many lines
    if (snippetLines.length > opts.maxLines) {
      const half = Math.floor(opts.maxLines / 2);
      snippetLines = [
        ...snippetLines.slice(0, half),
        '  // ... truncated ...',
        ...snippetLines.slice(-half),
      ];
    }
    
    let snippet = snippetLines.join('\n');
    
    // Truncate if too long
    if (snippet.length > opts.maxChars) {
      snippet = snippet.substring(0, opts.maxChars) + '\n  // ... truncated ...';
    }
    
    return snippet;
  } catch (error) {
    // File might not be accessible, return undefined
    return undefined;
  }
}

/**
 * Extract snippets for multiple search results in batch
 * More efficient than calling extractSnippet multiple times
 */
export async function extractSnippetsBatch(
  workspaceRoot: string,
  results: Array<{ filePath: string; lineStart: number; lineEnd: number }>,
  options: SnippetOptions = {}
): Promise<Map<string, string>> {
  const snippets = new Map<string, string>();
  const fileCache = new Map<string, string[]>();
  
  for (const result of results) {
    const key = `${result.filePath}:${result.lineStart}:${result.lineEnd}`;
    
    try {
      // Check cache first
      let lines = fileCache.get(result.filePath);
      if (!lines) {
        const fullPath = resolve(workspaceRoot, result.filePath);
        const content = await readFile(fullPath, 'utf-8');
        lines = content.split('\n');
        fileCache.set(result.filePath, lines);
      }
      
      const snippet = await extractSnippetFromLines(
        lines,
        result.lineStart,
        result.lineEnd,
        options
      );
      
      if (snippet) {
        snippets.set(key, snippet);
      }
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }
  
  return snippets;
}

function extractSnippetFromLines(
  lines: string[],
  lineStart: number,
  lineEnd: number,
  options: SnippetOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const startIdx = Math.max(0, lineStart - 1 - opts.contextLines);
  const endIdx = Math.min(lines.length, lineEnd + opts.contextLines);
  
  let snippetLines = lines.slice(startIdx, endIdx);
  
  if (snippetLines.length > opts.maxLines) {
    const half = Math.floor(opts.maxLines / 2);
    snippetLines = [
      ...snippetLines.slice(0, half),
      '  // ... truncated ...',
      ...snippetLines.slice(-half),
    ];
  }
  
  let snippet = snippetLines.join('\n');
  
  if (snippet.length > opts.maxChars) {
    snippet = snippet.substring(0, opts.maxChars) + '\n  // ... truncated ...';
  }
  
  return snippet;
}
