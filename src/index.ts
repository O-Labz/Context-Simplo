/**
 * Context-Simplo main entry point
 *
 * Boots the MCP server, web dashboard, and file watcher with graceful shutdown.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit immediately - let shutdown manager handle it
});

async function main() {
  console.log('Context-Simplo starting...');

  const config = loadConfig();
  const dataDir = config.dataDir.value;
  const workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';
  const dbPath = resolve(dataDir, 'context-simplo.db');
  const lanceDbPath = resolve(dataDir, 'lancedb');

  console.log(`Data directory: ${dataDir}`);
  console.log(`Workspace root: ${workspaceRoot}`);
  console.log(`Database: ${dbPath}`);

  const storage = new SqliteStorageProvider(dbPath);
  await storage.initialize();
  console.log('SQLite storage initialized');

  const vectorStore = new LanceDBVectorStore(lanceDbPath);
  await vectorStore.initialize();
  console.log('LanceDB vector store initialized');

  const graph = new CodeGraph(config.graphMemoryLimitMb.value);
  console.log(`Graph engine ready (memory limit: ${config.graphMemoryLimitMb.value}MB)`);

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
  });

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
    })
  );

  await apiServer.listen({ port: 3001, host: '0.0.0.0' });
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
