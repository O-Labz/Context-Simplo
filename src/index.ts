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
import { LanceDBVectorStore } from './store/lance.js';
import { CodeGraph } from './core/graph.js';
import { Indexer } from './core/indexer.js';
import { MCPServer } from './mcp/server.js';
import { FileWatcher } from './core/watcher.js';
import { ShutdownManager } from './core/shutdown.js';
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

  const storage = new SqliteStorageProvider(dbPath);
  await storage.initialize();
  console.log('SQLite storage initialized');

  const vectorStore = new LanceDBVectorStore(lanceDbPath);
  await vectorStore.initialize();
  console.log('LanceDB vector store initialized');

  const graph = new CodeGraph(config.graphMemoryLimitMb.value);
  console.log(`Graph engine ready (memory limit: ${config.graphMemoryLimitMb.value}MB)`);

  console.log('Hydrating graph from storage...');
  const allNodes = storage.getAllNodes();
  const allEdges = storage.getEdges();
  
  for (const node of allNodes) {
    try {
      await graph.addNode(node);
    } catch (error) {
      console.warn(`Failed to restore node ${node.id}:`, (error as Error).message);
    }
  }
  
  for (const edge of allEdges) {
    try {
      await graph.addEdge(edge);
    } catch (error) {
      console.warn(`Failed to restore edge ${edge.id}:`, (error as Error).message);
    }
  }
  
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

  const indexer = new Indexer(storage, graph, workspaceRoot, embeddingQueue, vectorStore);
  console.log('Indexer ready');

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
    })
  );

  const listenHost = process.env.HOST || (existsSync('/.dockerenv') ? '0.0.0.0' : '127.0.0.1');
  await apiServer.listen({ port: 3001, host: listenHost });
  console.log('API server started on port 3001');
  console.log(`WebSocket clients: ${broadcaster.getClientCount()}`);

  const shutdownManager = new ShutdownManager(10000);
  shutdownManager.register('File watcher', () => watcher.close(), 100);
  if (embeddingQueue) {
    shutdownManager.register('Embedding queue', () => embeddingQueue.drain(), 90);
  }
  shutdownManager.register('API server', () => apiServer.close(), 85);
  shutdownManager.register('MCP server', () => mcpServer.close(), 80);
  shutdownManager.register('Vector store', () => vectorStore.close(), 70);
  shutdownManager.register('SQLite storage', () => storage.close(), 60);

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
