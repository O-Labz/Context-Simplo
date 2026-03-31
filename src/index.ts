/**
 * Context-Simplo main entry point
 *
 * Boots the MCP server, web dashboard, and file watcher.
 */

import { resolve } from 'path';
import { loadConfig } from './core/config.js';
import { SqliteStorageProvider } from './store/sqlite.js';
import { CodeGraph } from './core/graph.js';
import { Indexer } from './core/indexer.js';
import { MCPServer } from './mcp/server.js';

async function main() {
  console.log('Context-Simplo starting...');

  const config = loadConfig();
  const dataDir = config.dataDir.value;
  const workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';
  const dbPath = resolve(dataDir, 'context-simplo.db');

  console.log(`Data directory: ${dataDir}`);
  console.log(`Workspace root: ${workspaceRoot}`);
  console.log(`Database: ${dbPath}`);

  const storage = new SqliteStorageProvider(dbPath);
  await storage.initialize();

  const graph = new CodeGraph();
  const indexer = new Indexer(storage, graph, workspaceRoot);

  console.log('Storage initialized');
  console.log('Graph engine ready');
  console.log('Indexer ready');

  const mcpServer = new MCPServer({
    storage,
    graph,
    indexer,
    workspaceRoot,
  });

  await mcpServer.start();
  console.log('MCP server started');

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

  console.log('Context-Simplo ready!');

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await mcpServer.close();
    storage.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await mcpServer.close();
    storage.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
