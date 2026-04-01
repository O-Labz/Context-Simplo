/**
 * LanceDB Vector Store
 *
 * What it does:
 * Manages vector embeddings in LanceDB for semantic search.
 * Supports idempotent upserts and ANN search with pagination.
 *
 * Inputs: EmbeddingChunk with embeddings
 * Outputs: SearchResult with similarity scores
 * Constraints: LanceDB file-based storage
 * Assumptions: @lancedb/lancedb v0.27 API
 * Failure cases: Disk full, corrupted index, dimension mismatch
 *
 * Design:
 * - One table per repository
 * - Upserts by chunk ID (idempotent)
 * - ANN search with configurable limit
 * - Metadata stored alongside vectors
 */

import { connect, type Connection, type Table } from '@lancedb/lancedb';
import type { EmbeddingChunk, SearchResult } from '../core/types.js';
import { StoreError } from '../core/errors.js';

export class LanceDBVectorStore {
  private connection: Connection | null = null;
  private tables: Map<string, Table> = new Map();
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    try {
      this.connection = await connect(this.dbPath);
    } catch (error) {
      throw new StoreError('initialize', 'Failed to connect to LanceDB', error as Error);
    }
  }

  async upsertChunks(chunks: EmbeddingChunk[]): Promise<void> {
    if (!this.connection) {
      throw new StoreError('upsertChunks', 'LanceDB not initialized');
    }

    if (chunks.length === 0) return;

    const repositoryId = chunks[0]?.repositoryId;
    if (!repositoryId) return;

    try {
      let table = this.tables.get(repositoryId);

      const newDims = chunks[0]?.embedding?.length ?? 0;
      if (newDims === 0) return;

      if (!table) {
        const tableNames = await this.connection.tableNames();
        if (tableNames.includes(repositoryId)) {
          table = await this.connection.openTable(repositoryId);

          const existingDims = await this.detectTableDimensions(table);
          if (existingDims > 0 && existingDims !== newDims) {
            console.warn(
              `Embedding dimensions changed (${existingDims} → ${newDims}) for table ${repositoryId}. ` +
              `Dropping and recreating table to avoid native crash.`
            );
            await this.connection.dropTable(repositoryId);
            table = undefined;
          }
        }

        if (!table) {
          const data = chunks.map((chunk) => ({
            id: chunk.id,
            nodeId: chunk.nodeId || '',
            filePath: chunk.filePath,
            content: chunk.content,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            language: chunk.language,
            symbolContext: chunk.symbolContext || '',
            vector: chunk.embedding || [],
          }));

          table = await this.connection.createTable(repositoryId, data);
        }

        this.tables.set(repositoryId, table);
      }

      // Delete existing rows for these chunks to achieve true upsert (idempotent)
      const chunkIds = chunks.map(c => c.id);
      try {
        const idFilter = chunkIds.map(id => `id = '${id.replace(/'/g, "''")}'`).join(' OR ');
        await table.delete(idFilter);
      } catch {
        // Table may not support delete or rows may not exist yet
      }

      const data = chunks.map((chunk) => ({
        id: chunk.id,
        nodeId: chunk.nodeId || '',
        filePath: chunk.filePath,
        content: chunk.content,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        language: chunk.language,
        symbolContext: chunk.symbolContext || '',
        vector: chunk.embedding || [],
      }));

      await table.add(data);
    } catch (error) {
      throw new StoreError('upsertChunks', 'Failed to upsert chunks', error as Error);
    }
  }

  async search(
    repositoryId: string,
    queryVector: number[],
    limit: number = 20,
    offset: number = 0
  ): Promise<SearchResult[]> {
    if (!this.connection) {
      throw new StoreError('search', 'LanceDB not initialized');
    }

    try {
      let table = this.tables.get(repositoryId);

      if (!table) {
        const tableNames = await this.connection.tableNames();
        if (!tableNames.includes(repositoryId)) {
          return [];
        }
        table = await this.connection.openTable(repositoryId);
        this.tables.set(repositoryId, table);
      }

      const query = table.search(queryVector).limit(limit + offset);
      const results: any[] = [];

      for await (const batch of query) {
        for (let i = 0; i < batch.numRows; i++) {
          results.push(batch.get(i));
        }
      }

      const paginatedResults = results.slice(offset, offset + limit);

      return paginatedResults.map((row: any) => ({
        nodeId: row.nodeId || row.id,
        name: row.symbolContext?.split(':').pop() || '',
        qualifiedName: row.symbolContext || '',
        kind: 'function' as const,
        filePath: row.filePath,
        lineStart: row.startLine,
        lineEnd: row.endLine,
        score: 1 - (row._distance || 0),
        language: row.language,
        repositoryId,
      }));
    } catch (error) {
      throw new StoreError('search', 'Vector search failed', error as Error);
    }
  }

  private async detectTableDimensions(table: Table): Promise<number> {
    try {
      const results = await table.query().limit(1).toArray();
      if (results.length > 0) {
        const row = results[0] as any;
        if (row?.vector && Array.isArray(row.vector)) {
          return row.vector.length;
        }
      }
    } catch {
      // Table might be empty or schema-only
    }
    return 0;
  }

  async deleteRepository(repositoryId: string): Promise<void> {
    if (!this.connection) return;

    try {
      await this.connection.dropTable(repositoryId);
      this.tables.delete(repositoryId);
    } catch (error) {
      console.warn(`Failed to delete LanceDB table ${repositoryId}:`, error);
    }
  }

  async getSize(): Promise<number> {
    if (!this.connection) {
      return 0;
    }

    try {
      const { stat } = await import('fs/promises');
      const { join } = await import('path');
      
      let totalSize = 0;
      const tableNames = await this.connection.tableNames();
      
      for (const tableName of tableNames) {
        try {
          const tablePath = join(this.dbPath, `${tableName}.lance`);
          const stats = await stat(tablePath);
          totalSize += stats.size;
        } catch {
          // Table file might not exist yet
        }
      }
      
      return totalSize;
    } catch (error) {
      console.warn('Failed to calculate LanceDB size:', error);
      return 0;
    }
  }

  async close(): Promise<void> {
    this.tables.clear();
    this.connection = null;
  }
}
