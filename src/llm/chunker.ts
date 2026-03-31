/**
 * Syntax-Aware Code Chunker
 *
 * What it does:
 * Splits code into chunks at function/class boundaries for embedding.
 * Each chunk includes symbol context (file path, parent class, function name).
 *
 * Inputs: ParsedFile from parser
 * Outputs: Array of EmbeddingChunk
 * Constraints: Max chunk size ~500 tokens (~2000 chars)
 * Assumptions: tree-sitter provides accurate line ranges
 * Failure cases: Very large functions (split at arbitrary boundaries)
 *
 * Design:
 * - Prefer function/class boundaries over arbitrary splits
 * - Include context (file path, parent symbol) in each chunk
 * - Generate unique chunk IDs for idempotent upserts
 */

import { createHash } from 'crypto';
import type { CodeNode, EmbeddingChunk } from '../core/types.js';
import type { parseFile } from '../core/parser.js';

const MAX_CHUNK_SIZE = 2000;

export function chunkCodeForEmbedding(
  parsed: Awaited<ReturnType<typeof parseFile>>,
  fileContent: string
): EmbeddingChunk[] {
  const chunks: EmbeddingChunk[] = [];
  const lines = fileContent.split('\n');
  const repositoryId = parsed.nodes[0]?.repositoryId || 'default-repo';

  for (const node of parsed.nodes) {
    if (node.kind === 'import' || node.kind === 'export') {
      continue;
    }

    const startIdx = node.lineStart - 1;
    const endIdx = Math.min(node.lineEnd, lines.length);
    const content = lines.slice(startIdx, endIdx).join('\n');

    if (content.length === 0) continue;

    if (content.length <= MAX_CHUNK_SIZE) {
      chunks.push(createChunk(node, content, parsed.filePath, repositoryId));
    } else {
      const subChunks = splitLargeContent(content, MAX_CHUNK_SIZE);
      for (let i = 0; i < subChunks.length; i++) {
        chunks.push(
          createChunk(
            node,
            subChunks[i]!,
            parsed.filePath,
            repositoryId,
            i
          )
        );
      }
    }
  }

  return chunks;
}

function createChunk(
  node: CodeNode,
  content: string,
  filePath: string,
  repositoryId: string,
  partIndex?: number
): EmbeddingChunk {
  const chunkId = generateChunkId(node.id, partIndex);
  const symbolContext = `${filePath}:${node.qualifiedName}`;

  return {
    id: chunkId,
    nodeId: node.id,
    filePath,
    repositoryId,
    content,
    startLine: node.lineStart,
    endLine: node.lineEnd,
    language: node.language,
    symbolContext,
    createdAt: new Date(),
  };
}

function generateChunkId(nodeId: string, partIndex?: number): string {
  const base = partIndex !== undefined ? `${nodeId}:${partIndex}` : nodeId;
  return createHash('sha256').update(base).digest('hex').substring(0, 16);
}

function splitLargeContent(content: string, maxSize: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  const lines = content.split('\n');
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      if (line.length > maxSize) {
        chunks.push(line.substring(0, maxSize));
      } else {
        currentChunk = line;
      }
    } else {
      currentChunk += (currentChunk.length > 0 ? '\n' : '') + line;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
