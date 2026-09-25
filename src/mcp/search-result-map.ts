import type { SearchResult } from '../core/types.js';
import type { StorageProvider } from '../store/provider.js';
import { repoRelativeFilePath } from './path-display.js';

export function mapSearchHit(
  storage: StorageProvider,
  row: SearchResult & { snippet?: string },
  opts: { includeSnippets: boolean }
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    nodeId: row.nodeId,
    name: row.name,
    qualifiedName: row.qualifiedName,
    kind: row.kind,
    filePath: repoRelativeFilePath(storage, row.repositoryId, row.filePath),
    lineStart: row.lineStart,
    lineEnd: row.lineEnd,
    score: row.score,
    language: row.language,
    repositoryId: row.repositoryId,
    complexity: row.complexity,
    isExported: row.isExported,
  };
  if (opts.includeSnippets && row.snippet) {
    base.snippet = row.snippet;
  }
  return base;
}
