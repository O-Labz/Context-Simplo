/**
 * StorageProvider interface
 *
 * Abstract interface for storage backends. SQLite is the v1 implementation.
 * PostgreSQL can be added later by implementing this interface.
 *
 * Design: All database operations go through this interface to enable swapping backends.
 * Contract: All methods are synchronous (better-sqlite3 is sync). Transactions are explicit.
 */

import type {
  CodeNode,
  GraphEdge,
  FileMetadata,
  RepositoryInfo,
  NodeFilter,
  SearchResult,
} from '../core/types.js';

export interface StorageProvider {
  initialize(): Promise<void>;

  transaction<T>(fn: () => T): T;

  getRepository(id: string): RepositoryInfo | null;
  getRepositoryByPath(path: string): RepositoryInfo | null;
  listRepositories(): RepositoryInfo[];
  upsertRepository(repo: RepositoryInfo): void;
  deleteRepository(id: string): void;

  getFile(path: string): FileMetadata | null;
  listFiles(repositoryId: string, status?: string): FileMetadata[];
  upsertFile(file: FileMetadata): void;
  deleteFile(path: string): void;
  deleteFilesInRepository(repositoryId: string): void;

  getNode(id: string): CodeNode | null;
  getNodes(filter: NodeFilter): CodeNode[];
  getAllNodes(): CodeNode[];
  getNodesInFile(filePath: string): CodeNode[];
  upsertNodes(nodes: CodeNode[]): void;
  deleteNode(id: string): void;
  deleteNodesInFile(filePath: string): void;
  deleteNodesInRepository(repositoryId: string): void;

  getEdge(id: string): GraphEdge | null;
  getEdges(sourceId?: string, targetId?: string): GraphEdge[];
  upsertEdges(edges: GraphEdge[]): void;
  deleteEdge(id: string): void;
  deleteEdgesForNode(nodeId: string): void;
  deleteEdgesInRepository(repositoryId: string): void;

  search(query: string, limit: number, offset: number): SearchResult[];
  indexNodeForSearch(node: CodeNode): void;

  getConfig(key?: string): Record<string, unknown>;
  updateConfig(updates: Record<string, unknown>): void;
  setConfig(key: string, value: string): void;
  deleteConfig(key: string): void;

  updateRepositoryWatchStatus(id: string, watching: boolean): void;

  getStats(): {
    repositoryCount: number;
    fileCount: number;
    nodeCount: number;
    edgeCount: number;
    databaseSize: number;
    lastIndexTime?: string;
    filesIndexing?: number;
    filesPending?: number;
    filesError?: number;
  };

  close(): void;
}
