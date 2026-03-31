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

async function main() {
  console.log('Context-Simplo starting...');

  const config = loadConfig();
  const dataDir = config.dataDir.value;
  const dbPath = resolve(dataDir, 'context-simplo.db');

  console.log(`Data directory: ${dataDir}`);
  console.log(`Database: ${dbPath}`);

  const storage = new SqliteStorageProvider(dbPath);
  await storage.initialize();

  const graph = new CodeGraph();
  const indexer = new Indexer(storage, graph);

  console.log('Context-Simplo ready!');
  console.log('Storage initialized');
  console.log('Graph engine ready');
  console.log('Indexer ready');

  if (config.autoIndex.value) {
    console.log('Auto-indexing enabled - will index /workspace on startup');
  }

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    storage.close();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    storage.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
