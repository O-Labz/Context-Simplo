/**
 * Context-Simplo main entry point
 *
 * Boots the MCP server, web dashboard, and file watcher with graceful shutdown.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { loadConfig } from './core/config.js';
import { SqliteStorageProvider } from './store/sqlite.js';
import { ParsePool } from './core/parse-pool.js';
import { LanceDBVectorStore } from './store/lance.js';
import { CodeGraph } from './core/graph.js';
import { Indexer } from './core/indexer.js';
import { MCPServer } from './mcp/server.js';
import { FileWatcher } from './core/watcher.js';
import { ShutdownManager } from './core/shutdown.js';
import { sanitizeErrorForLogging } from './core/errors.js';
import { IndexQueue } from './core/index-queue.js';
import { MemoryGuard } from './core/memory-guard.js';
import { createEmbeddingProvider } from './llm/provider.js';
import { EmbeddingQueue } from './core/embedding-queue.js';
import { ConfigManager } from './core/config-manager.js';

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Give a brief window for logs to flush, then exit — continuing
  // after an uncaught exception leaves the process in undefined state.
  setTimeout(() => process.exit(1), 1000);
});

async function main() {
  console.log('Context-Simplo starting...');

  const config = loadConfig();
  const dataDir = config.dataDir.value;
  
  // Support for dynamic workspace switching with backward compatibility
  // mountRoot is the broad directory mounted into the container (e.g., /host for $HOME)
  // workspaceRoot is the active workspace within that mount (can be changed at runtime)
  
  // Backward compatibility: if /host doesn't exist, fall back to /workspace
  let mountRoot: string;
  let initialWorkspace: string;
  
  if (existsSync('/host')) {
    // New mode: dynamic workspace switching
    mountRoot = process.env.MOUNT_ROOT || '/host';
    initialWorkspace = process.env.INITIAL_WORKSPACE || mountRoot;
    console.log('Dynamic workspace mode enabled');
  } else {
    // Legacy mode: single workspace mount
    mountRoot = process.env.WORKSPACE_ROOT || '/workspace';
    initialWorkspace = mountRoot;
    console.log('Legacy workspace mode (single mount)');
  }
  
  let workspaceRoot = initialWorkspace;
  
  const dbPath = resolve(dataDir, 'context-simplo.db');
  const lanceDbPath = resolve(dataDir, 'lancedb');

  console.log(`Data directory: ${dataDir}`);
  console.log(`Mount root: ${mountRoot}`);
  console.log(`Initial workspace: ${workspaceRoot}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Response mode: ${config.responseMode.value}`);

  const storage = new SqliteStorageProvider(dbPath);
  await storage.initialize();
  console.log('SQLite storage initialized');

  const { connect } = await import('@lancedb/lancedb');
  const lanceConnection = await connect(lanceDbPath);
  const vectorStore = new LanceDBVectorStore(lanceDbPath);
  await vectorStore.initialize(lanceConnection);
  console.log('LanceDB vector store initialized');

  const graph = new CodeGraph(config.graphMemoryLimitMb.value);
  console.log(`Graph engine ready (memory limit: ${config.graphMemoryLimitMb.value}MB)`);

  console.log('Hydrating graph from storage...');
  const allNodes = storage.getAllNodes();
  const allEdges = storage.getEdges();
  
  await graph.bulkLoad(allNodes, allEdges);
  
  console.log(`Graph hydrated: ${allNodes.length} nodes, ${allEdges.length} edges`);

  const embeddingProvider = await createEmbeddingProvider(config.llmProvider.value, {
    apiKey: config.llmApiKey.value,
    baseUrl: config.llmBaseUrl.value,
    model: config.llmEmbeddingModel.value,
  });
  console.log(`LLM provider: ${config.llmProvider.value}`);

  if (config.llmProvider.value === 'ollama' && embeddingProvider && 'isEmbeddingModel' in embeddingProvider) {
    const ollamaProvider = embeddingProvider as import('./llm/ollama.js').OllamaEmbeddingProvider;
    if (!ollamaProvider.isEmbeddingModel()) {
      console.warn(
        `WARNING: "${config.llmEmbeddingModel.value}" is not a dedicated embedding model. ` +
        `This will work but is slower and uses more memory. ` +
        `Recommended models: nomic-embed-text, mxbai-embed-large, all-minilm`
      );
    }
  }

  const embeddingQueue = config.llmProvider.value !== 'none'
    ? new EmbeddingQueue(embeddingProvider, {
        concurrency: config.embeddingConcurrency.value,
        batchSize: config.embeddingBatchSize.value,
        maxRetries: 3,
      })
    : undefined;

  if (embeddingQueue) {
    console.log('Embedding queue ready');
  }

  // Derive heap limit from NODE_HEAP_MB env var (used in NODE_OPTIONS)
  const heapLimitMb = parseInt(process.env.NODE_HEAP_MB || '2560', 10);
  const memoryGuard = new MemoryGuard({
    softPct: config.graphMemorySoftPct.value,
    hardPct: config.graphMemoryHardPct.value,
    heapLimitMb,
  });
  console.log(`Memory guard ready (soft: ${config.graphMemorySoftPct.value}%, hard: ${config.graphMemoryHardPct.value}%, limit: ${heapLimitMb}MB)`);

  // Initialize parse pool if enabled
  let parsePool: ParsePool | undefined;
  if (config.parseWorkerPoolSize.value > 0) {
    parsePool = new ParsePool({
      size: config.parseWorkerPoolSize.value,
      recycleAfter: config.parseWorkerRecycleAfter.value,
      workerHeapMb: config.workerHeapMb.value,
      workerPath: resolve(__dirname, 'core/parse-worker.js'),
    });
    console.log(`Parse pool ready (size: ${config.parseWorkerPoolSize.value}, recycle after: ${config.parseWorkerRecycleAfter.value}, heap: ${config.workerHeapMb.value}MB)`);
  } else {
    console.log('Parse pool disabled (PARSE_WORKER_POOL_SIZE=0)');
  }

  const indexer = new Indexer(storage, graph, workspaceRoot, embeddingQueue, vectorStore, memoryGuard, parsePool);
  console.log('Indexer ready');

  const indexQueue = new IndexQueue({
    maxConcurrent: config.indexMaxConcurrentJobs.value,
    maxDepth: config.indexQueueMaxDepth.value,
    memoryGuard,
  });
  console.log(`Index queue ready (max concurrent: ${config.indexMaxConcurrentJobs.value}, max depth: ${config.indexQueueMaxDepth.value})`);

  // --- Engineering Memory Layer (EML) bootstrap ---
  // Always construct the services bundle so REST/MCP surfaces exist and report
  // a 503 when disabled; only start the worker bus when enabled.
  const { EventStore } = await import('./eml/events/store.js');
  const { EventBus } = await import('./eml/events/bus.js');
  const { MemoryRepo } = await import('./eml/store/memory-repo.js');
  const { MemoryVectorStore } = await import('./eml/store/memory-vectors.js');
  const { SqliteGraphStore } = await import('./eml/store/sqlite-graph.js');
  const { HotCache } = await import('./eml/store/hot-cache.js');
  const { DecisionEngine } = await import('./eml/engines/decision.js');
  const { FailureEngine } = await import('./eml/engines/failure.js');
  const { OwnershipEngine } = await import('./eml/engines/ownership.js');
  const { FreshnessEngine } = await import('./eml/engines/freshness.js');
  const { ContradictionEngine } = await import('./eml/engines/contradiction.js');
  let eml: import('./eml/mcp/handlers.js').EmlServices;
  let emlEventBus: any = undefined;
  let emlMemoryVectors: any = undefined;
  let emlEventStore: any = undefined;
  let emlDb: any = undefined;
  try {
    const { IntentEngine } = await import('./eml/engines/intent.js');
    const { TimelineEngine } = await import('./eml/engines/timeline.js');
    const { GapsEngine } = await import('./eml/engines/gaps.js');
    const { DriftEngine } = await import('./eml/engines/drift.js');
    const { ImpactSimEngine } = await import('./eml/engines/impact-sim.js');
    emlDb = storage.getDatabase();
    emlEventStore = new EventStore(emlDb);
    emlEventBus = config.emlEnabled.value
      ? new EventBus(emlEventStore, { concurrency: config.emlWorkerConcurrency.value })
      : undefined;
    emlMemoryVectors = new MemoryVectorStore(lanceDbPath);
    await emlMemoryVectors.initialize(lanceConnection);
    const emlEmbedQuery =
      config.llmProvider.value !== 'none' && embeddingProvider
        ? async (q: string): Promise<number[] | null> => {
            try {
              const vectors = await embeddingProvider.embed([q]);
              return vectors[0] ?? null;
            } catch {
              return null;
            }
          }
        : undefined;
    const emlMemoryRepo = new MemoryRepo(emlDb);
    const emlNow = (): Date => new Date();
    const emlGraph = new SqliteGraphStore(emlDb, { cache: new HotCache(config.emlGraphHotCacheMb.value) });
    const emlIntents = new IntentEngine(emlDb, emlMemoryRepo);
    const emlOwnership = new OwnershipEngine(emlDb, emlGraph, { eventStore: emlEventStore, now: emlNow });
    const emlDrift = new DriftEngine(emlDb, { eventStore: emlEventStore });
    eml = {
      enabled: config.emlEnabled.value,
      extraction: config.emlExtraction.value,
      db: emlDb,
      storage,
      memoryRepo: emlMemoryRepo,
      memoryVectors: emlMemoryVectors,
      graph: emlGraph,
      eventStore: emlEventStore,
      eventBus: emlEventBus,
      decisions: new DecisionEngine(emlDb, emlMemoryRepo, emlNow),
      failures: new FailureEngine(emlDb, emlMemoryRepo),
      ownership: emlOwnership,
      freshness: new FreshnessEngine(emlMemoryRepo, { eventStore: emlEventStore, now: emlNow }),
      contradictions: new ContradictionEngine(emlDb, emlGraph, emlMemoryRepo, {
        eventStore: emlEventStore,
        now: emlNow,
      }),
      intents: emlIntents,
      timeline: new TimelineEngine(emlDb, emlMemoryRepo),
      gaps: new GapsEngine(emlDb, { ownership: emlOwnership }),
      drift: emlDrift,
      impactSim: new ImpactSimEngine(emlDb, { ownership: emlOwnership, drift: emlDrift }),
      vcs: {
        webhookSecret: config.emlWebhookSecret.value,
        githubToken: config.githubToken.value,
        gitlabToken: config.gitlabToken.value,
        gitlabHost: config.gitlabHost.value,
      },
      goalBiasOf: (memory) => emlIntents.goalBiasOf(memory),
      embedQuery: emlEmbedQuery,
      now: emlNow,
    };
    console.log(`EML services ready (enabled: ${eml.enabled}, extraction: ${eml.extraction})`);
  } catch (error) {
    console.warn('boot.eml_degraded', sanitizeErrorForLogging(error as Error));
    eml = {
      enabled: false,
      extraction: 'off',
      db: storage.getDatabase(),
      storage,
      memoryRepo: null as any,
      memoryVectors: null as any,
      graph: null as any,
      eventStore: null as any,
      eventBus: undefined,
      decisions: null as any,
      failures: null as any,
      ownership: null as any,
      freshness: null as any,
      contradictions: null as any,
      intents: null as any,
      timeline: null as any,
      gaps: null as any,
      drift: null as any,
      impactSim: null as any,
      vcs: {
        webhookSecret: config.emlWebhookSecret.value,
        githubToken: config.githubToken.value,
        gitlabToken: config.gitlabToken.value,
        gitlabHost: config.gitlabHost.value,
      },
      goalBiasOf: () => 0,
      embedQuery: undefined,
      now: () => new Date(),
    };
  }

  const { SymbolicSearch } = await import('./search/symbolic.js');
  const symbolicSearch = new SymbolicSearch(storage);

  let vectorSearch: any = undefined;
  let hybridSearch: any = undefined;
  if (config.llmProvider.value !== 'none' && embeddingProvider && vectorStore) {
    const { VectorSearch } = await import('./search/vector.js');
    const { HybridSearch } = await import('./search/hybrid.js');
    vectorSearch = new VectorSearch(vectorStore, embeddingProvider);
    hybridSearch = new HybridSearch(symbolicSearch, vectorSearch);
  }

  const watcher = new FileWatcher(indexer, {
    debounceMs: 200,
  });

  const mcpServer = new MCPServer({
    storage,
    graph,
    indexer,
    workspaceRoot,
    vectorStore: config.llmProvider.value !== 'none' ? vectorStore : undefined,
    embeddingProvider: config.llmProvider.value !== 'none' ? embeddingProvider : undefined,
    watcher,
    responseMode: config.responseMode.value,
    eml,
    indexQueue,
  });

  const configManager = new ConfigManager({
    storage,
    vectorStore,
    indexer,
    watcher,
    onEmbeddingProviderChange: async (provider) => {
      if (indexer) {
        (indexer as any).embeddingProvider = provider;
      }
      if (mcpServer) {
        (mcpServer as any).embeddingProvider = provider;
      }
    },
    onEmbeddingQueueChange: async (queue) => {
      if (indexer) {
        (indexer as any).embeddingQueue = queue;
      }
    },
    onVectorSearchChange: async (newVectorSearch, newHybridSearch) => {
      vectorSearch = newVectorSearch;
      hybridSearch = newHybridSearch;
    },
    onWorkspaceChange: async (newWorkspace) => {
      workspaceRoot = newWorkspace;
      if (indexer) {
        (indexer as any).workspaceRoot = newWorkspace;
      }
      if (mcpServer) {
        (mcpServer as any).workspaceRoot = newWorkspace;
      }
    },
  });

  configManager.setEmbeddingProvider(embeddingProvider);
  configManager.setEmbeddingQueue(embeddingQueue);
  if (vectorSearch && hybridSearch) {
    configManager.setSearchServices(vectorSearch, hybridSearch);
  }

  await mcpServer.start();
  console.log('MCP server started on stdio');

  // Handle watcher errors gracefully
  watcher.on('error', (error) => {
    console.error('FileWatcher error:', error);
  });

  const { fastify: apiServer, broadcaster } = await import('./api/server.js').then((m) =>
    m.createAPIServer({
      storage,
      graph,
      dashboardPath: resolve(__dirname, '../dashboard/dist'),
      workspaceRoot,
      mountRoot,
      getWorkspaceRoot: () => workspaceRoot,
      setWorkspaceRoot: async (newPath: string) => {
        await configManager.reloadWorkspace(newPath);
      },
      templatesPath: resolve(__dirname, '../templates'),
      serverHost: 'localhost',
      serverPort: 3001,
      symbolicSearch,
      vectorSearch,
      hybridSearch,
      indexer,
      watcher,
      embeddingQueue,
      vectorStore,
      embeddingProvider,
      mcpServer,
      configManager,
      eml,
      indexQueue,
    })
  );

  const listenHost = process.env.HOST || (existsSync('/.dockerenv') ? '0.0.0.0' : '127.0.0.1');
  await apiServer.listen({ port: 3001, host: listenHost });
  console.log('API server started on port 3001');
  console.log(`WebSocket clients: ${broadcaster.getClientCount()}`);

  if (emlEventBus) {
    try {
      emlEventBus.on('eml:event_processed', (payload: unknown) => {
        broadcaster.broadcast('eml:event_processed', payload);
      });

      // Subscribe the extraction pipeline: each ingested event is gated, then
      // routed to the LLM or deterministic fallback extractor and resolved.
      const { processEventForExtraction } = await import('./eml/extract/resolve.js');
      const { createChatClient } = await import('./eml/extract/llm-extractor.js');
      const chatClient =
        config.emlExtraction.value === 'llm'
          ? createChatClient(config.llmProvider.value, {
              apiKey: config.llmApiKey.value,
              baseUrl: config.llmBaseUrl.value,
            })
          : null;
      emlEventBus.subscribe(async (event: any) => {
        await processEventForExtraction(event, eml, { chatClient });
      });

      // Observe the latest commit delta + authorship after each indexing job.
      const { DiffObserver, createSimpleGitRunner } = await import('./eml/ingest/diff.js');
      const { GitIngest } = await import('./eml/ingest/git.js');
      const diffObserver = new DiffObserver(emlEventStore);
      const gitIngest = new GitIngest(emlDb, emlEventStore);
      indexer.on('job:complete', (job) => {
        void (async () => {
          try {
            const repo = storage.getRepository(job.repositoryId);
            if (!repo) return;
            const runner = await createSimpleGitRunner(repo.path);
            await diffObserver.observe(runner, job.repositoryId, 'HEAD~1', 'HEAD', {
              authorship: gitIngest,
            });
          } catch (err) {
            // Best-effort: shallow repos / no prior commit / non-git dirs are fine.
            // Surface the reason so a missing `git` binary (e.g. in a container
            // without git installed) is visible instead of silently swallowed.
            console.warn(
              `eml.diff.observe skipped for ${job.repositoryId}: ${(err as Error).message}`
            );
          }
        })();
      });

      emlEventBus.start();
      console.log('EML event bus started');
    } catch (error) {
      console.warn('boot.eml_bus_degraded', sanitizeErrorForLogging(error as Error));
    }
  }

  const shutdownManager = new ShutdownManager(10000);
  if (emlEventBus) {
    shutdownManager.register('EML event bus', () => emlEventBus.stop(), 95);
  }
  shutdownManager.register('EML vector store', () => emlMemoryVectors.close(), 65);
  shutdownManager.register('File watcher', () => watcher.close(), 100);
  if (embeddingQueue) {
    shutdownManager.register('Embedding queue', () => embeddingQueue.drain(), 90);
  }
  shutdownManager.register('API server', () => apiServer.close(), 85);
  shutdownManager.register('MCP server', () => mcpServer.close(), 80);
  shutdownManager.register('Vector store', () => vectorStore.close(), 70);
  shutdownManager.register('SQLite storage', () => storage.close(), 60);
  shutdownManager.register('LanceDB connection', () => lanceConnection.close(), 55);
  if (parsePool) {
    shutdownManager.register('Parse pool', () => parsePool.terminate(), 92);
  }

  if (config.autoIndex.value) {
    console.log('Auto-indexing /workspace...');
    try {
      const job = await indexer.indexRepository(workspaceRoot, {
        incremental: false,
        respectIgnore: true,
      });
      console.log(`Indexing complete: ${job.filesProcessed} files, ${job.nodesCreated} nodes`);
    } catch (error) {
      console.error('Auto-indexing failed:', error);
    }
  }

  if (config.watchEnabled.value) {
    watcher.watch(workspaceRoot, 'default-repo');
    console.log('File watching enabled');
  }

  console.log('Context-Simplo ready!');
  console.log('MCP endpoint: stdio (for native) or http://localhost:3001/mcp (for Docker)');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
