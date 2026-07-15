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
import { parseFile, type ParsedFile } from './parser.js';
import type { CodeGraphApi } from './graph.js';
import type { StorageProvider } from '../store/provider.js';
import type {
  CodeNode,
  FileMetadata,
  IndexJob,
  GraphEdge,
  CodeReference,
} from './types.js';
import { parseCache } from './parse-cache.js';
import { ParseError } from './errors.js';
import { EventEmitter } from 'events';
import { ContextIgnore } from '../security/ignore.js';
import { scrubSecrets } from '../security/scrubber.js';
import type { ParsePool } from './parse-pool.js';

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
  private pendingReferences: Array<{
    calls: Array<{ callerNodeId: string; calleeName: string }>;
    imports: import('./parser.js').ParsedImport[];
    inheritance: import('./parser.js').ParsedInheritance[];
    repositoryId: string;
    filePath: string;
  }> = [];

  constructor(
    public storage: StorageProvider,
    public graph: CodeGraphApi,
    private workspaceRoot: string = '/workspace',
    private memoryGuard?: any,
    private parsePool?: ParsePool
  ) {
    super();
    this.contextIgnore = new ContextIgnore(workspaceRoot);
  }

  async indexRepository(
    repositoryPath: string,
    options: IndexerOptions = {}
  ): Promise<IndexJob> {
    const absolutePath = resolve(this.workspaceRoot, repositoryPath);
    
    // Validate repository path exists
    try {
      const stats = await stat(absolutePath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${absolutePath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Repository path does not exist: ${absolutePath}`);
      }
      // For other errors (permissions, etc.), let the indexing process handle them
    }
    
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

      this.pendingReferences = [];

      const BATCH_SIZE = 50;
      // Bounded worker pool: cap concurrent file parsing so a large repo cannot
      // spawn unbounded async work. Storage/graph writes inside indexFile remain
      // effectively serialized by better-sqlite3's synchronous API.
      const concurrency = Math.max(1, Math.min(options.maxConcurrency ?? 4, 16));
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        let cursor = 0;
        const worker = async (): Promise<void> => {
          while (cursor < batch.length) {
            const filePath = batch[cursor++];
            if (filePath === undefined) break;
            try {
              await this.indexFile(filePath, repositoryId, options.incremental || false);
              job.filesProcessed++;
              this.emit('job:progress', job);
            } catch (error) {
              job.filesFailed++;
              this.emit('file:error', filePath, error as Error);
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, () => worker()));
        if (this.memoryGuard) {
          await this.memoryGuard.relieve();
        }
      }

      const forwardEdges = await this.resolveForwardEdges(repositoryId);
      if (forwardEdges > 0) {
        console.log(`Resolved ${forwardEdges} forward-reference edges`);
      }
      this.pendingReferences = [];

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

    let parsed: ParsedFile;
    try {
      if (this.parsePool) {
        // Use worker pool for parsing
        const workerResult = await this.parsePool.parse({
          filePath: relativePath,
          repositoryId,
          workspaceRoot: this.workspaceRoot,
        });
        
        if (workerResult === null) {
          // Worker reported error or security violation - mark file as skipped
          fileMetadata.status = 'error';
          fileMetadata.lastError = 'parse worker skipped';
          fileMetadata.retryCount++;
          fileMetadata.updatedAt = new Date();
          this.storage.upsertFile(fileMetadata);
          this.emit('file:error', relativePath, new Error('parse worker skipped'));
          return;
        }
        parsed = workerResult;
      } else {
        // Use in-process parsing (fallback when pool size is 0)
        parsed = await parseFile(relativePath, repositoryId, this.workspaceRoot);
      }

      await this.graph.removeNodesInFile(relativePath);

      // Delete stale code_references for this file
      this.storage.deleteCodeReferencesForFile(relativePath);

      // Scrub secrets from docstrings before persisting
      for (const node of parsed.nodes) {
        if (node.docstring) {
          const { scrubbed } = scrubSecrets(node.docstring);
          node.docstring = scrubbed;
        }
      }

      this.storage.bulkWrite(parsed.nodes, []);

      // Add nodes to graph for in-memory queries
      await this.graph.bulkLoad(parsed.nodes, []);

      // Build and persist code_references for later resolution
      const referenceRows = this.buildReferenceRows(
        parsed.calls,
        relativePath,
        repositoryId
      );
      if (referenceRows.length > 0) {
        this.storage.saveCodeReferences(referenceRows);
      }

      // Store references for later resolution (after all files are indexed)
      this.pendingReferences.push({
        calls: parsed.calls,
        imports: parsed.imports,
        inheritance: parsed.inheritance,
        repositoryId,
        filePath: parsed.filePath,
      });

      fileMetadata.hash = parsed.hash;
      fileMetadata.language = parsed.language;
      fileMetadata.nodeCount = parsed.nodes.length;
      fileMetadata.status = 'indexed';
      fileMetadata.lastError = undefined;
      fileMetadata.indexedAt = new Date();
      fileMetadata.updatedAt = new Date();
      fileMetadata.embeddingStatus = 'pending';

      this.storage.transaction(() => {
        this.storage.upsertFile(fileMetadata);
      });

      // Populate parse cache for embedding backfill reuse
      try {
        const fileContent = await readFile(filePath, 'utf-8');
        parseCache.set(relativePath, fileContent, parsed);
      } catch (error) {
        // Non-fatal: cache population is best-effort
        console.warn(`[index.cache.skip] ${relativePath}:`, (error as Error).message);
      }

      console.info('[index.file.persisted]', {
        path: relativePath,
        nodeCount: parsed.nodes.length,
        edgeCount: 0, // Edges will be created in forward resolution pass
      });

      this.emit('file:complete', relativePath, parsed.nodes.length);
    } catch (error) {
      fileMetadata.status = 'error';
      fileMetadata.lastError = (error as Error).message;
      fileMetadata.retryCount++;
      fileMetadata.updatedAt = new Date();
      this.storage.upsertFile(fileMetadata);

      console.warn('[index.file.error]', {
        path: relativePath,
        error: (error as Error).message,
      });

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

  private async resolveForwardEdges(repositoryId: string): Promise<number> {
    let created = 0;
    const now = new Date();
    const newEdges: GraphEdge[] = [];
    
    // Build set of existing edge IDs to avoid duplicates
    const existingEdgeIds = new Set(this.graph.getAllEdges().map(e => e.id));

    for (const ref of this.pendingReferences) {
      if (ref.repositoryId !== repositoryId) continue;

      // Get nodes for this file to build same-file scope
      const nodesInFile = this.graph.getNodesInFile(ref.filePath);
      const sameFileNodes = new Map<string, CodeNode>();
      for (const node of nodesInFile) {
        sameFileNodes.set(node.name, node);
      }

      // Build import map for this file
      const importMap = new Map<string, string>();
      for (const imp of ref.imports) {
        for (const importedName of imp.imported) {
          importMap.set(importedName, imp.source);
        }
      }

      // Resolve calls with scope-aware lookup
      for (const call of ref.calls) {
        if (!this.graph.getNode(call.callerNodeId)) continue;

        const resolved = this.resolveName(
          call.calleeName,
          ref.filePath,
          repositoryId,
          sameFileNodes,
          importMap
        );

        for (const { target, confidence } of resolved) {
          const edgeId = this.generateEdgeId(call.callerNodeId, target.id, 'calls');
          if (existingEdgeIds.has(edgeId)) continue; // Skip if already exists
          existingEdgeIds.add(edgeId);

          newEdges.push({
            id: edgeId,
            sourceId: call.callerNodeId,
            targetId: target.id,
            kind: 'calls',
            confidence,
            repositoryId,
            createdAt: now,
            updatedAt: now,
          });
          created++;
        }
      }

      // Resolve inheritance
      for (const inh of ref.inheritance) {
        if (!this.graph.getNode(inh.childNodeId)) continue;

        const resolved = this.resolveName(
          inh.parentName,
          ref.filePath,
          repositoryId,
          sameFileNodes,
          importMap
        );

        for (const { target, confidence } of resolved) {
          const edgeId = this.generateEdgeId(inh.childNodeId, target.id, inh.kind);
          if (existingEdgeIds.has(edgeId)) continue;
          existingEdgeIds.add(edgeId);

          newEdges.push({
            id: edgeId,
            sourceId: inh.childNodeId,
            targetId: target.id,
            kind: inh.kind,
            confidence,
            repositoryId,
            createdAt: now,
            updatedAt: now,
          });
          created++;
        }
      }

      // Resolve import edges
      for (const imp of ref.imports) {
        if (!imp.source || !imp.source.startsWith('.')) continue;

        const importDir = dirname(ref.filePath);
        const resolvedBase = join(importDir, imp.source).replace(/\\/g, '/');
        const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

        for (const importedName of imp.imported) {
          const targets = this.graph.findByName(importedName);
          for (const target of targets) {
            if (target.repositoryId !== repositoryId) continue;
            if (target.filePath === ref.filePath) continue;

            const targetFileBase = target.filePath.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/\/index$/, '');
            const matchesPath = extensions.some(ext => {
              const candidate = resolvedBase + ext;
              return target.filePath === candidate || targetFileBase === resolvedBase;
            });
            if (!matchesPath) continue;

            const sourceNode = nodesInFile.find(n =>
              n.kind === 'function' || n.kind === 'class' || n.kind === 'method'
            ) || nodesInFile[0];
            if (!sourceNode) continue;

            const edgeId = this.generateEdgeId(sourceNode.id, target.id, 'imports');
            if (existingEdgeIds.has(edgeId)) continue;
            existingEdgeIds.add(edgeId);

            newEdges.push({
              id: edgeId,
              sourceId: sourceNode.id,
              targetId: target.id,
              kind: 'imports',
              confidence: 1.0,
              repositoryId,
              createdAt: now,
              updatedAt: now,
            });
            created++;
          }
        }
      }
    }

    if (newEdges.length > 0) {
      this.storage.upsertEdges(newEdges);
      await this.graph.bulkLoad([], newEdges);
    }

    return created;
  }

  private static readonly SKIP_DIRS = new Set([
    'node_modules', '.git', '.svn', '.hg', 'vendor', '__pycache__',
    '.venv', 'venv', 'dist', 'build', 'out', 'target', '.next',
    '.nuxt', '.cache', '.parcel-cache', 'coverage', '.nyc_output',
    '.tox', '.eggs', 'bower_components', 'jspm_packages',
  ]);

  private static readonly MAX_FILE_SIZE = 1024 * 1024; // 1MB
  private static readonly MAX_FILES = 100_000;

  private async discoverFiles(
    dirPath: string,
    respectIgnore: boolean = true
  ): Promise<string[]> {
    const files: string[] = [];
    await this._walkDir(dirPath, respectIgnore, files);
    return files;
  }

  private async _walkDir(
    dirPath: string,
    respectIgnore: boolean,
    files: string[]
  ): Promise<void> {
    if (files.length >= Indexer.MAX_FILES) return;

    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= Indexer.MAX_FILES) return;

      if (entry.name.startsWith('.') || Indexer.SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = resolve(dirPath, entry.name);
      const relativePath = relative(this.workspaceRoot, fullPath);

      if (respectIgnore && this.contextIgnore.shouldIgnore(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await this._walkDir(fullPath, respectIgnore, files);
      } else if (entry.isFile()) {
        const ext = entry.name.split('.').pop();
        if (this.isSourceFile(ext || '')) {
          try {
            const fileStat = await stat(fullPath);
            if (fileStat.size <= Indexer.MAX_FILE_SIZE) {
              files.push(fullPath);
            }
          } catch {
            // Skip files we can't stat
          }
        }
      }
    }
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

  /**
   * Build code_references rows from parsed calls
   */
  private buildReferenceRows(
    calls: Array<{ callerNodeId: string; calleeName: string; lineNumber?: number }>,
    filePath: string,
    repositoryId: string
  ): CodeReference[] {
    const now = new Date();
    const references: CodeReference[] = [];

    // Build references for calls only (imports are handled differently in the current system)
    for (const call of calls) {
      const refId = createHash('sha256')
        .update(`${call.callerNodeId}:${call.calleeName}:call`)
        .digest('hex')
        .substring(0, 16);
      
      references.push({
        id: refId,
        sourceFile: filePath,
        sourceNodeId: call.callerNodeId,
        targetName: call.calleeName,
        referenceKind: 'call',
        lineNumber: call.lineNumber || 1,
        repositoryId,
        resolved: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    return references;
  }

  /**
   * Resolve references for specific files (incremental resolution)
   * Resolves both outbound (from these files) and inbound (to nodes in these files) edges
   */
  async resolveReferencesForFiles(filePaths: string[], repositoryId: string): Promise<number> {
    let created = 0;
    const now = new Date();
    const newEdges: GraphEdge[] = [];

    // Build set of existing edge IDs ONCE to avoid duplicates
    const existingEdgeIds = new Set(this.graph.getAllEdges().map(e => e.id));

    // Get all nodes in the affected files
    const affectedNodeNames = new Set<string>();
    for (const filePath of filePaths) {
      const nodesInFile = this.graph.getNodesInFile(filePath);
      for (const node of nodesInFile) {
        affectedNodeNames.add(node.name);
      }
    }

    // 1. Resolve outbound references FROM these files
    for (const filePath of filePaths) {
      // Get unresolved references for this file
      const refs = this.storage.getUnresolvedReferencesInRepository(repositoryId)
        .filter(ref => ref.sourceFile === filePath);

      // Build scope for this file
      const nodesInFile = this.graph.getNodesInFile(filePath);
      const sameFileNodes = new Map<string, CodeNode>();
      for (const node of nodesInFile) {
        sameFileNodes.set(node.name, node);
      }

      // Build import map for this file (from pendingReferences if available)
      const importMap = new Map<string, string>();
      const pendingRef = this.pendingReferences.find(r => r.filePath === filePath);
      if (pendingRef) {
        for (const imp of pendingRef.imports) {
          for (const importedName of imp.imported) {
            importMap.set(importedName, imp.source);
          }
        }
      }

      // Resolve each reference
      for (const ref of refs) {
        if (ref.referenceKind === 'call') {
          const resolved = this.resolveName(
            ref.targetName,
            filePath,
            repositoryId,
            sameFileNodes,
            importMap
          );

          for (const { target, confidence } of resolved) {
            const edgeId = this.generateEdgeId(ref.sourceNodeId, target.id, 'calls');
            if (existingEdgeIds.has(edgeId)) continue;
            existingEdgeIds.add(edgeId);

            newEdges.push({
              id: edgeId,
              sourceId: ref.sourceNodeId,
              targetId: target.id,
              kind: 'calls',
              confidence,
              repositoryId,
              createdAt: now,
              updatedAt: now,
            });

            // Mark reference as resolved
            this.storage.markReferenceResolved(ref.id);
            created++;
          }
        }
      }
    }

    // 2. Resolve inbound references TO nodes in these files
    for (const nodeName of affectedNodeNames) {
      // Find all unresolved references to this node
      const inboundRefs = this.storage.getUnresolvedReferencesForTargetName(nodeName, repositoryId);

      for (const ref of inboundRefs) {
        // Build scope for the source file
        const sourceNodesInFile = this.graph.getNodesInFile(ref.sourceFile);
        const sameFileNodes = new Map<string, CodeNode>();
        for (const node of sourceNodesInFile) {
          sameFileNodes.set(node.name, node);
        }

        // Build import map for source file
        const importMap = new Map<string, string>();
        const pendingRef = this.pendingReferences.find(r => r.filePath === ref.sourceFile);
        if (pendingRef) {
          for (const imp of pendingRef.imports) {
            for (const importedName of imp.imported) {
              importMap.set(importedName, imp.source);
            }
          }
        }

        // Resolve the reference
        const resolved = this.resolveName(
          ref.targetName,
          ref.sourceFile,
          repositoryId,
          sameFileNodes,
          importMap
        );

        for (const { target, confidence } of resolved) {
          const edgeId = this.generateEdgeId(ref.sourceNodeId, target.id, 'calls');
          if (existingEdgeIds.has(edgeId)) continue;
          existingEdgeIds.add(edgeId);

          newEdges.push({
            id: edgeId,
            sourceId: ref.sourceNodeId,
            targetId: target.id,
            kind: 'calls',
            confidence,
            repositoryId,
            createdAt: now,
            updatedAt: now,
          });

          // Mark reference as resolved
          this.storage.markReferenceResolved(ref.id);
          created++;
        }
      }
    }

    // Persist all new edges
    if (newEdges.length > 0) {
      this.storage.upsertEdges(newEdges);
      await this.graph.bulkLoad([], newEdges);
    }

    return created;
  }

  /**
   * Resolve a symbol name using scope-aware lookup:
   * 1. Same-file symbols (high confidence)
   * 2. Imported symbols from the import table (high confidence)
   * 3. Global repo-wide search (low confidence)
   */
  private resolveName(
    name: string,
    sourceFilePath: string,
    repositoryId: string,
    sameFileNodes: Map<string, CodeNode>,
    importMap: Map<string, string>
  ): Array<{ target: CodeNode; confidence: number }> {
    const results: Array<{ target: CodeNode; confidence: number }> = [];

    // 1. Check same-file scope first (highest confidence)
    const sameFileNode = sameFileNodes.get(name);
    if (sameFileNode) {
      return [{ target: sameFileNode, confidence: 0.95 }];
    }

    // 2. Check if name is in import table
    const importSource = importMap.get(name);
    if (importSource && importSource.startsWith('.')) {
      // Resolve the import path
      const importDir = dirname(sourceFilePath);
      const resolvedBase = join(importDir, importSource).replace(/\\/g, '/');
      const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

      const candidates = this.graph.findByName(name);
      for (const candidate of candidates) {
        if (candidate.repositoryId !== repositoryId) continue;
        if (candidate.filePath === sourceFilePath) continue;

        const targetFileBase = candidate.filePath.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/\/index$/, '');
        const matchesPath = extensions.some(ext => {
          const candidatePath = resolvedBase + ext;
          return candidate.filePath === candidatePath || targetFileBase === resolvedBase;
        });

        if (matchesPath) {
          results.push({ target: candidate, confidence: 0.9 });
        }
      }

      if (results.length > 0) {
        return results;
      }
    }

    // 3. Fall back to global search (low confidence)
    const globalMatches = this.graph.findByName(name);
    for (const match of globalMatches) {
      if (match.repositoryId === repositoryId) {
        results.push({ target: match, confidence: 0.6 });
      }
    }

    return results;
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
