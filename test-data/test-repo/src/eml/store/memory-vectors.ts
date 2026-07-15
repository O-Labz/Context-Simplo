/**
 * MemoryVectorStore: LanceDB `eml_memory` table for memory embeddings.
 *
 * Rows: { id, memoryId, repositoryId, kind, vector }. Upserts are idempotent by
 * `id`. When no embedding is available (e.g. LLM_PROVIDER=none) upsert is a
 * no-op so the rest of the pipeline degrades gracefully.
 */

import { connect, type Connection, type Table } from '@lancedb/lancedb';
import { StoreError } from '../../core/errors.js';

const TABLE_NAME = 'eml_memory';

export interface MemoryVectorRow {
  id: string;
  memoryId: string;
  repositoryId: string;
  kind: string;
  vector: number[];
}

export interface MemoryVectorHit {
  id: string;
  memoryId: string;
  repositoryId: string;
  kind: string;
  score: number;
}

export class MemoryVectorStore {
  private connection: Connection | null = null;
  private table: Table | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(connection?: Connection): Promise<void> {
    try {
      if (connection) {
        this.connection = connection;
      } else {
        this.connection = await connect(this.dbPath);
      }
    } catch (error) {
      throw new StoreError('initialize', 'Failed to connect to LanceDB (eml_memory)', error as Error);
    }
  }

  /**
   * Idempotently upsert memory vectors. No-op when there are no rows or no
   * usable embeddings (degraded mode).
   */
  async upsert(rows: MemoryVectorRow[]): Promise<void> {
    const usable = rows.filter((r) => Array.isArray(r.vector) && r.vector.length > 0);
    if (usable.length === 0) return;
    if (!this.connection) {
      throw new StoreError('upsert', 'MemoryVectorStore not initialized');
    }

    try {
      const data = usable.map((r) => ({
        id: r.id,
        memoryId: r.memoryId,
        repositoryId: r.repositoryId,
        kind: r.kind,
        vector: r.vector,
      }));

      if (!this.table) {
        const names = await this.connection.tableNames();
        if (names.includes(TABLE_NAME)) {
          this.table = await this.connection.openTable(TABLE_NAME);
        } else {
          this.table = await this.connection.createTable(TABLE_NAME, data);
          return;
        }
      }

      const ids = usable.map((r) => `id = '${r.id.replace(/'/g, "''")}'`).join(' OR ');
      try {
        await this.table.delete(ids);
      } catch {
        // rows may not exist yet
      }
      await this.table.add(data);
    } catch (error) {
      throw new StoreError('upsert', 'Failed to upsert memory vectors', error as Error);
    }
  }

  /**
   * Vector search scoped to a repository. Returns ranked memory ids.
   */
  async search(repositoryId: string, queryVector: number[], limit = 20): Promise<MemoryVectorHit[]> {
    if (!queryVector || queryVector.length === 0) return [];
    if (!this.connection) return [];

    try {
      if (!this.table) {
        const names = await this.connection.tableNames();
        if (!names.includes(TABLE_NAME)) return [];
        this.table = await this.connection.openTable(TABLE_NAME);
      }

      const safeRepo = repositoryId.replace(/'/g, "''");
      const query = this.table
        .search(queryVector)
        .where(`repositoryId = '${safeRepo}'`)
        .limit(limit);

      const hits: MemoryVectorHit[] = [];
      for await (const batch of query) {
        for (let i = 0; i < batch.numRows; i++) {
          const row = batch.get(i) as Record<string, unknown>;
          hits.push({
            id: String(row.id),
            memoryId: String(row.memoryId),
            repositoryId: String(row.repositoryId),
            kind: String(row.kind),
            score: Math.max(0, Math.min(1, 1 / (1 + (Number(row._distance) || 0)))),
          });
        }
      }
      return hits;
    } catch (error) {
      throw new StoreError('search', 'Memory vector search failed', error as Error);
    }
  }

  async deleteByMemoryId(memoryId: string): Promise<void> {
    if (!this.connection || !this.table) return;
    try {
      await this.table.delete(`memoryId = '${memoryId.replace(/'/g, "''")}'`);
    } catch {
      // ignore
    }
  }

  async close(): Promise<void> {
    this.table = null;
    // Only drop reference, don't close shared connection
    this.connection = null;
  }
}
