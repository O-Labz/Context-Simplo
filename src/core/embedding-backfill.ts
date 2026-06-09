/**
 * Embedding Backfiller - Background worker for semantic embeddings
 *
 * What it does:
 * Continuously processes files with embedding_status='pending' from SQLite,
 * generating embeddings and upserting to LanceDB. Decouples semantic indexing
 * from the critical path so structural queries work immediately.
 *
 * Inputs: SQLite storage (source of truth for pending files)
 * Outputs: Embeddings written to LanceDB, files marked done/error
 * Constraints: Bounded concurrency, bounded memory (no unbounded queues)
 * Assumptions: Files are already parsed and in storage
 * Failure cases: File deleted, embedding provider down, vectorStore errors
 *
 * Design:
 * - Pull files in batches from SQLite (bounded memory, survives restart)
 * - Read file content, scrub secrets, chunk by symbols, embed via queue
 * - Upsert to vectorStore, mark file status (done/error)
 * - Bounded concurrency (N files in flight at once)
 * - Graceful error handling (log + mark error + continue, no crash)
 * - Clean start/stop for graceful shutdown
 *
 * Performance: Processes files at the rate the embedding provider allows
 * Concurrency: Async with configurable concurrency limit
 * Security: Scrubs secrets before embedding
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { EventEmitter } from 'events';
import type { StorageProvider } from '../store/provider.js';
import type { EmbeddingQueue } from './embedding-queue.js';
import type { LanceDBVectorStore } from '../store/lance.js';
import { scrubSecrets } from '../security/scrubber.js';
import { chunkCodeForEmbedding } from '../llm/chunker.js';
import { parseFile } from './parser.js';
import { StoreError } from './errors.js';

export interface EmbeddingBackfillOptions {
  concurrency: number;
  batchSize: number;
  pollIntervalMs: number;
  workspaceRoot: string;
}

export interface EmbeddingBackfillStats {
  filesProcessed: number;
  filesErrored: number;
  chunksCreated: number;
  isRunning: boolean;
}

export class EmbeddingBackfiller extends EventEmitter {
  private storage: StorageProvider;
  private embeddingQueue: EmbeddingQueue;
  private vectorStore: LanceDBVectorStore;
  private options: EmbeddingBackfillOptions;
  private running = false;
  private inFlight = 0;
  private filesProcessed = 0;
  private filesErrored = 0;
  private chunksCreated = 0;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    storage: StorageProvider,
    embeddingQueue: EmbeddingQueue,
    vectorStore: LanceDBVectorStore,
    options: EmbeddingBackfillOptions
  ) {
    super();
    this.storage = storage;
    this.embeddingQueue = embeddingQueue;
    this.vectorStore = vectorStore;
    this.options = options;
  }

  start(): void {
    if (this.running) {
      console.warn('EmbeddingBackfiller already running');
      return;
    }

    this.running = true;
    console.log(
      `EmbeddingBackfiller started (concurrency: ${this.options.concurrency}, ` +
      `batch: ${this.options.batchSize}, poll: ${this.options.pollIntervalMs}ms)`
    );
    this.schedulePoll();
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for in-flight operations to complete
    while (this.inFlight > 0) {
      await this.sleep(100);
    }

    console.log('EmbeddingBackfiller stopped');
  }

  getStats(): EmbeddingBackfillStats {
    return {
      filesProcessed: this.filesProcessed,
      filesErrored: this.filesErrored,
      chunksCreated: this.chunksCreated,
      isRunning: this.running,
    };
  }

  private schedulePoll(): void {
    if (!this.running) {
      return;
    }

    this.pollTimer = setTimeout(() => {
      this.poll().catch((error) => {
        console.error('EmbeddingBackfiller poll failed:', error);
      }).finally(() => {
        this.schedulePoll();
      });
    }, this.options.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (!this.running || this.inFlight >= this.options.concurrency) {
      return;
    }

    const availableSlots = this.options.concurrency - this.inFlight;
    const files = this.storage.listPendingEmbeddingFiles(availableSlots);

    if (files.length === 0) {
      return;
    }

    for (const file of files) {
      if (!this.running || this.inFlight >= this.options.concurrency) {
        break;
      }

      this.inFlight++;
      this.processFile(file.path, file.repositoryId)
        .catch((error) => {
          console.error(`EmbeddingBackfiller failed for ${file.path}:`, error);
        })
        .finally(() => {
          this.inFlight--;
        });
    }
  }

  private async processFile(filePath: string, repositoryId: string): Promise<void> {
    try {
      // Read file content
      const absolutePath = resolve(this.options.workspaceRoot, filePath);
      let fileContent: string;
      try {
        fileContent = await readFile(absolutePath, 'utf-8');
      } catch (error) {
        throw new StoreError(
          'readFile',
          `File not readable: ${filePath}`,
          error as Error
        );
      }

      // Scrub secrets
      const { scrubbed } = scrubSecrets(fileContent);

      // Parse file to get AST nodes for chunking
      let parsed;
      try {
        parsed = await parseFile(filePath, repositoryId, this.options.workspaceRoot);
      } catch (error) {
        throw new StoreError(
          'parseFile',
          `Failed to parse ${filePath}`,
          error as Error
        );
      }

      // Chunk code for embedding
      const chunks = chunkCodeForEmbedding(parsed, scrubbed);

      if (chunks.length === 0) {
        // No chunks to embed (e.g., file only has imports)
        this.storage.updateFileEmbeddingStatus(filePath, 'done');
        this.filesProcessed++;
        this.emit('file:complete', filePath, 0);
        return;
      }

      // Embed chunks via the queue (with backpressure)
      const texts = chunks.map((chunk) => chunk.content);
      const embeddings = await this.embeddingQueue.embed(texts);

      // Attach embeddings to chunks
      const chunksWithEmbeddings = chunks.map((chunk, i) => ({
        ...chunk,
        embedding: embeddings[i],
      }));

      // Upsert to vectorStore
      await this.vectorStore.upsertChunks(chunksWithEmbeddings);

      // Mark file as done
      this.storage.updateFileEmbeddingStatus(filePath, 'done');
      this.filesProcessed++;
      this.chunksCreated += chunks.length;
      this.emit('file:complete', filePath, chunks.length);
    } catch (error) {
      // Mark file as error (do not retry in this implementation)
      this.storage.updateFileEmbeddingStatus(filePath, 'error');
      this.filesErrored++;
      this.emit('file:error', filePath, error);
      console.warn(`EmbeddingBackfiller marked ${filePath} as error:`, error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
