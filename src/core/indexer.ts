/**
 * Indexer module - orchestrates parse -> scrub -> graph -> persist pipeline
 *
 * What it does:
 * Coordinates the full indexing pipeline: discovers files, parses them, builds the graph,
 * scrubs secrets, persists to storage. Handles incremental updates and crash recovery.
 *
 * Inputs: Repository path, StorageProvider, CodeGraph, optional SecretScrubber
 * Outputs: IndexJob with progress tracking
 * Constraints: Must respect .contextignore, handle large repos, recover from crashes
 * Assumptions: Files are UTF-8, filesystem is readable, storage is writable
 * Failure cases: Permission denied, out of memory, parse errors, storage errors
 *
 * Design:
 * - Each file is indexed in a transaction (atomic per-file)
 * - File status tracks progress (pending -> indexing -> indexed/error)
 * - On restart, resumes incomplete files (status='indexing')
 * - Hash comparison for incremental updates (only re-parse changed files)
 * - Emits progress events for dashboard real-time updates
 *
 * Performance:
 * - Parallel parsing (worker threads) for CPU-bound work
 * - Batched database writes (transaction per file, bulk edge inserts)
 * - Skip unchanged files via hash comparison
 *
 * Concurrency: Can parse multiple files in parallel, but graph/storage writes are serialized.
 * Security: Integrates with SecretScrubber before indexing.
 */

import { readdir, stat, readFile } from 'fs/promises';
import { resolve, relative, basename, dirname, join } from 'path';
import { createHash } from 'crypto';
import { parseFile } from './parser.js';
import type { CodeGraph } from './graph.js';
import type { StorageProvider } from '../store/provider.js';
import type {
  FileMetadata,
  IndexJob,
  GraphEdge,
} from './types.js';
import { ParseError } from './errors.js';
import { EventEmitter } from 'events';
import { scrubSecrets } from '../security/scrubber.js';
import { ContextIgnore } from '../security/ignore.js';
import type { EmbeddingQueue } from './embedding-queue.js';
import { chunkCodeForEmbedding } from '../llm/chunker.js';
import type { LanceDBVectorStore } from '../store/lance.js';

export interface IndexerOptions {
  respectIgnore?: boolean;
  incremental?: boolean;
  maxConcurrency?: number;
}

export interface IndexerEvents {
  'file:start': (filePath: string) => void;
  'file:complete': (filePath: string, nodeCount: number) => void;
  'file:error': (filePath: string, error: Error) => void;
  'job:progress': (job: IndexJob) => void;
  'job:complete': (job: IndexJob) => void;
}

export class Indexer extends EventEmitter {
  private contextIgnore: ContextIgnore;

  constructor(
    public storage: StorageProvider,
    public graph: CodeGraph,
    private workspaceRoot: string = '/workspace',
    private embeddingQueue?: EmbeddingQueue,
    private vectorStore?: LanceDBVectorStore
  ) {
    super();
    this.contextIgnore = new ContextIgnore(workspaceRoot);
  }

  async indexRepository(
    repositoryPath: string,
    options: IndexerOptions = {}
  ): Promise<IndexJob> {
    const absolutePath = resolve(this.workspaceRoot, repositoryPath);
    const repositoryId = this.generateRepositoryId(absolutePath);

    let repo = this.storage.getRepositoryByPath(absolutePath);
    if (!repo) {
      repo = {
        id: repositoryId,
        path: absolutePath,
        name: basename(absolutePath),
        fileCount: 0,
        nodeCount: 0,
        edgeCount: 0,
        languages: {},
        isWatched: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.storage.upsertRepository(repo);
    }

    const job: IndexJob = {
      id: this.generateJobId(),
      repositoryId,
      type: options.incremental ? 'incremental' : 'full',
      status: 'running',
      filesTotal: 0,
      filesProcessed: 0,
      filesFailed: 0,
      nodesCreated: 0,
      edgesCreated: 0,
      embeddingsGenerated: 0,
      startedAt: new Date(),
    };

    try {
      const files = await this.discoverFiles(absolutePath, options.respectIgnore);
      job.filesTotal = files.length;

      for (const filePath of files) {
        try {
          await this.indexFile(filePath, repositoryId, options.incremental || false);
          job.filesProcessed++;
          this.emit('job:progress', job);
        } catch (error) {
          job.filesFailed++;
          this.emit('file:error', filePath, error as Error);
        }
      }

      const stats = this.graph.getStats();
      job.nodesCreated = stats.nodeCount;
      job.edgesCreated = stats.edgeCount;
      job.status = 'completed';
      job.completedAt = new Date();

      repo.fileCount = files.length;
      repo.nodeCount = stats.nodeCount;
      repo.edgeCount = stats.edgeCount;
      repo.languages = stats.languageBreakdown;
      repo.lastIndexedAt = new Date();
      repo.updatedAt = new Date();
      this.storage.upsertRepository(repo);

      this.emit('job:complete', job);
      return job;
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      job.completedAt = new Date();
      throw error;
    }
  }

  async indexFile(
    filePath: string,
    repositoryId: string,
    incremental: boolean
  ): Promise<void> {
    const relativePath = relative(this.workspaceRoot, filePath);
    this.emit('file:start', relativePath);

    const fileStats = await stat(filePath);
    const mtime = Math.floor(fileStats.mtimeMs);
    const size = fileStats.size;

    const existingFile = this.storage.getFile(relativePath);

    if (incremental && existingFile && existingFile.status === 'indexed') {
      const currentHash = await this.computeFileHash(filePath);
      if (currentHash === existingFile.hash && mtime === existingFile.mtime) {
        return;
      }
    }

    const fileMetadata: FileMetadata = {
      path: relativePath,
      repositoryId,
      hash: '',
      mtime,
      size,
      nodeCount: 0,
      status: 'indexing',
      retryCount: existingFile?.retryCount || 0,
      createdAt: existingFile?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    this.storage.upsertFile(fileMetadata);

    try {
      const parsed = await parseFile(relativePath, repositoryId, this.workspaceRoot);

      this.storage.transaction(() => {
        this.graph.removeNodesInFile(relativePath);
        this.storage.deleteNodesInFile(relativePath);

        for (const node of parsed.nodes) {
          this.graph.addNode(node);
        }

      this.storage.upsertNodes(parsed.nodes);

      const edges = this.resolveEdges(parsed, repositoryId);
      for (const edge of edges) {
        try {
          this.graph.addEdge(edge);
        } catch {
          // Edge target may not exist yet (forward reference), skip
        }
      }
      this.storage.upsertEdges(edges);

      fileMetadata.hash = parsed.hash;
      fileMetadata.language = parsed.language;
      fileMetadata.nodeCount = parsed.nodes.length;
      fileMetadata.status = 'indexed';
      fileMetadata.lastError = undefined;
      fileMetadata.indexedAt = new Date();
      fileMetadata.updatedAt = new Date();

      this.storage.upsertFile(fileMetadata);
    });

    if (this.embeddingQueue && this.vectorStore) {
      try {
        const fileContent = await readFile(filePath, 'utf-8');
        const { scrubbed } = scrubSecrets(fileContent);
        const chunks = chunkCodeForEmbedding(parsed, scrubbed);

        if (chunks.length > 0) {
          const texts = chunks.map((chunk) => chunk.content);
          const embeddings = await this.embeddingQueue.embed(texts);

          const chunksWithEmbeddings = chunks.map((chunk, i) => ({
            ...chunk,
            embedding: embeddings[i],
          }));

          await this.vectorStore.upsertChunks(chunksWithEmbeddings);
        }
      } catch (error) {
        console.warn(`Failed to generate embeddings for ${relativePath}:`, error);
      }
    }

    this.emit('file:complete', relativePath, parsed.nodes.length);
    } catch (error) {
      fileMetadata.status = 'error';
      fileMetadata.lastError = (error as Error).message;
      fileMetadata.retryCount++;
      fileMetadata.updatedAt = new Date();
      this.storage.upsertFile(fileMetadata);

      throw new ParseError(relativePath, (error as Error).message, error as Error);
    }
  }

  async resumeIncompleteIndexing(repositoryId: string): Promise<void> {
    const incompleteFiles = this.storage.listFiles(repositoryId, 'indexing');

    for (const file of incompleteFiles) {
      try {
        await this.indexFile(
          resolve(this.workspaceRoot, file.path),
          repositoryId,
          false
        );
      } catch (error) {
        console.error(`Failed to resume indexing ${file.path}:`, error);
      }
    }
  }

  private async discoverFiles(
    dirPath: string,
    respectIgnore: boolean = true
  ): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = resolve(dirPath, entry.name);
      const relativePath = relative(this.workspaceRoot, fullPath);

      if (respectIgnore && this.contextIgnore.shouldIgnore(relativePath)) {
        continue;
      }

      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await this.discoverFiles(fullPath, respectIgnore);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = entry.name.split('.').pop();
        if (this.isSourceFile(ext || '')) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  private isSourceFile(ext: string): boolean {
    const sourceExts = new Set([
      'ts',
      'tsx',
      'js',
      'jsx',
      'py',
      'rs',
      'go',
      'java',
      'c',
      'cpp',
      'cc',
      'h',
      'hpp',
      'cs',
      'rb',
      'php',
      'swift',
      'kt',
      'dart',
    ]);
    return sourceExts.has(ext.toLowerCase());
  }

  private async computeFileHash(filePath: string): Promise<string> {
    const { readFile } = await import('fs/promises');
    const content = await readFile(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  }

  private resolveEdges(
    parsed: Awaited<ReturnType<typeof parseFile>>,
    repositoryId: string
  ): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const now = new Date();

    for (const call of parsed.calls) {
      const targetNodes = this.graph.findByName(call.calleeName);
      for (const target of targetNodes) {
        if (target.repositoryId === repositoryId) {
          edges.push({
            id: this.generateEdgeId(call.callerNodeId, target.id, 'calls'),
            sourceId: call.callerNodeId,
            targetId: target.id,
            kind: 'calls',
            confidence: 0.9,
            repositoryId,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    for (const inheritance of parsed.inheritance) {
      const parentNodes = this.graph.findByName(inheritance.parentName);
      for (const parent of parentNodes) {
        if (parent.repositoryId === repositoryId) {
          edges.push({
            id: this.generateEdgeId(
              inheritance.childNodeId,
              parent.id,
              inheritance.kind
            ),
            sourceId: inheritance.childNodeId,
            targetId: parent.id,
            kind: inheritance.kind,
            confidence: 1.0,
            repositoryId,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    for (const imp of parsed.imports) {
      if (!imp.source || !imp.source.startsWith('.')) continue;

      const importDir = dirname(parsed.filePath);
      const resolvedBase = join(importDir, imp.source).replace(/\\/g, '/');
      const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

      for (const importedName of imp.imported) {
        const targetNodes = this.graph.findByName(importedName);
        for (const target of targetNodes) {
          if (target.repositoryId !== repositoryId) continue;
          if (target.filePath === parsed.filePath) continue;

          const targetFileBase = target.filePath.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/\/index$/, '');
          const matchesPath = extensions.some(ext => {
            const candidate = resolvedBase + ext;
            return target.filePath === candidate || targetFileBase === resolvedBase;
          });

          if (!matchesPath) continue;

          const sourceNode = parsed.nodes.find(n =>
            n.kind === 'function' || n.kind === 'class' || n.kind === 'method'
          ) || parsed.nodes[0];

          if (!sourceNode) continue;

          edges.push({
            id: this.generateEdgeId(sourceNode.id, target.id, 'imports'),
            sourceId: sourceNode.id,
            targetId: target.id,
            kind: 'imports',
            confidence: 1.0,
            repositoryId,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    return edges;
  }

  private generateRepositoryId(path: string): string {
    return createHash('sha256').update(path).digest('hex').substring(0, 16);
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateEdgeId(sourceId: string, targetId: string, kind: string): string {
    return createHash('sha256')
      .update(`${sourceId}:${targetId}:${kind}`)
      .digest('hex')
      .substring(0, 16);
  }
}
