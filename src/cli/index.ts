#!/usr/bin/env node

/**
 * Context-Simplo CLI
 *
 * Commands:
 * - serve: Start MCP server + dashboard
 * - index <path>: Index a repository
 * - search <query>: Search indexed code
 * - status: Show indexing status
 * - setup: Interactive LLM provider setup
 *
 * Security:
 * - Path validation (no traversal)
 * - Input sanitization
 * - Graceful error handling
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get package.json for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('context-simplo')
  .description('Portable code intelligence MCP server')
  .version(packageJson.version);

/**
 * serve command - Start MCP server + dashboard
 */
program
  .command('serve')
  .description('Start MCP server and web dashboard')
  .option('-p, --port <number>', 'Dashboard port', '3001')
  .option('--data-dir <path>', 'Data directory', './data')
  .option('--workspace <path>', 'Workspace root', process.cwd())
  .option('--no-watch', 'Disable file watching')
  .action(async (options) => {
    const spinner = ora('Starting Context-Simplo...').start();

    try {
      const { resolve } = await import('path');
      const dataDir = resolve(options.dataDir);
      const workspaceRoot = resolve(options.workspace);
      const port = parseInt(options.port);

      process.env.CONTEXT_SIMPLO_DATA_DIR = dataDir;
      process.env.WORKSPACE_ROOT = workspaceRoot;
      if (!options.watch) {
        process.env.CONTEXT_SIMPLO_WATCH = 'false';
      }

      const { loadConfig } = await import('../core/config.js');
      const { SqliteStorageProvider } = await import('../store/sqlite.js');
      const { LanceDBVectorStore } = await import('../store/lance.js');
      const { CodeGraph } = await import('../core/graph.js');
      const { Indexer } = await import('../core/indexer.js');
      const { FileWatcher } = await import('../core/watcher.js');
      const { createEmbeddingProvider } = await import('../llm/provider.js');
      const { EmbeddingQueue } = await import('../core/embedding-queue.js');
      const { SymbolicSearch } = await import('../search/symbolic.js');
      const { VectorSearch } = await import('../search/vector.js');
      const { HybridSearch } = await import('../search/hybrid.js');
      const { createAPIServer } = await import('../api/server.js');

      const config = loadConfig();
      const dbPath = resolve(dataDir, 'context-simplo.db');
      const lanceDbPath = resolve(dataDir, 'lancedb');

      const storage = new SqliteStorageProvider(dbPath);
      await storage.initialize();

      const vectorStore = new LanceDBVectorStore(lanceDbPath);
      await vectorStore.initialize();

      const graph = new CodeGraph();

      const embeddingProvider = await createEmbeddingProvider(config.llmProvider.value, {
        apiKey: config.llmApiKey.value,
        baseUrl: config.llmBaseUrl.value,
        model: config.llmEmbeddingModel.value,
      });

      const embeddingQueue = config.llmProvider.value !== 'none'
        ? new EmbeddingQueue(embeddingProvider, {
            concurrency: config.embeddingConcurrency.value,
            batchSize: config.embeddingBatchSize.value,
            maxRetries: 3,
          })
        : undefined;

      const indexer = new Indexer(storage, graph, workspaceRoot, embeddingQueue, vectorStore);
      const watcher = new FileWatcher(indexer, { debounceMs: 200 });

      // Handle watcher errors gracefully
      watcher.on('error', (error) => {
        console.error('FileWatcher error:', error);
      });

      const symbolicSearch = new SymbolicSearch(storage);
      let vectorSearch;
      let hybridSearch;
      if (config.llmProvider.value !== 'none' && embeddingProvider && vectorStore) {
        vectorSearch = new VectorSearch(vectorStore, embeddingProvider);
        hybridSearch = new HybridSearch(symbolicSearch, vectorSearch);
      }

      const { MCPServer } = await import('../mcp/server.js');
      const mcpServer = new MCPServer({
        storage,
        graph,
        indexer,
        workspaceRoot,
        vectorStore: config.llmProvider.value !== 'none' ? vectorStore : undefined,
        embeddingProvider: config.llmProvider.value !== 'none' ? embeddingProvider : undefined,
        watcher,
      });

      const { fastify: apiServer } = await createAPIServer({
        storage,
        graph,
        dashboardPath: resolve(__dirname, '../../dashboard/dist'),
        workspaceRoot,
        templatesPath: resolve(__dirname, '../../templates'),
        serverHost: 'localhost',
        serverPort: port,
        symbolicSearch,
        vectorSearch,
        hybridSearch,
        indexer,
        watcher,
        embeddingQueue,
        vectorStore,
        embeddingProvider,
        mcpServer,
      });

      await apiServer.listen({ port, host: '0.0.0.0' });

      spinner.succeed('Server started');

      console.log();
      console.log(chalk.bold('Context-Simplo is running:'));
      console.log();
      console.log(
        `  ${chalk.cyan('Dashboard:')}    http://localhost:${port}`
      );
      console.log(
        `  ${chalk.cyan('Data dir:')}     ${dataDir}`
      );
      console.log(
        `  ${chalk.cyan('Workspace:')}    ${workspaceRoot}`
      );
      console.log(
        `  ${chalk.cyan('LLM Provider:')} ${config.llmProvider.value}`
      );
      console.log();
      console.log(chalk.dim('Press Ctrl+C to stop'));

      // Keep process alive
      await new Promise(() => {});
    } catch (error) {
      spinner.fail('Failed to start server');
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });

/**
 * index command - Index a repository
 */
program
  .command('index')
  .description('Index a repository')
  .argument('<path>', 'Repository path to index')
  .option('-i, --incremental', 'Only re-index changed files', false)
  .option('--data-dir <path>', 'Data directory', './data')
  .action(async (repoPath, options) => {
    const spinner = ora(`Indexing ${repoPath}...`).start();

    try {
      const { resolve } = await import('path');
      const dataDir = resolve(options.dataDir);
      const absolutePath = resolve(repoPath);

      const { loadConfig } = await import('../core/config.js');
      const { SqliteStorageProvider } = await import('../store/sqlite.js');
      const { LanceDBVectorStore } = await import('../store/lance.js');
      const { CodeGraph } = await import('../core/graph.js');
      const { Indexer } = await import('../core/indexer.js');
      const { createEmbeddingProvider } = await import('../llm/provider.js');
      const { EmbeddingQueue } = await import('../core/embedding-queue.js');

      const config = loadConfig();
      const dbPath = resolve(dataDir, 'context-simplo.db');
      const lanceDbPath = resolve(dataDir, 'lancedb');

      const storage = new SqliteStorageProvider(dbPath);
      await storage.initialize();

      const vectorStore = new LanceDBVectorStore(lanceDbPath);
      await vectorStore.initialize();

      const graph = new CodeGraph();

      const embeddingProvider = await createEmbeddingProvider(config.llmProvider.value, {
        apiKey: config.llmApiKey.value,
        baseUrl: config.llmBaseUrl.value,
        model: config.llmEmbeddingModel.value,
      });

      const embeddingQueue = config.llmProvider.value !== 'none'
        ? new EmbeddingQueue(embeddingProvider, {
            concurrency: config.embeddingConcurrency.value,
            batchSize: config.embeddingBatchSize.value,
            maxRetries: 3,
          })
        : undefined;

      const indexer = new Indexer(storage, graph, process.cwd(), embeddingQueue, vectorStore);

      const job = await indexer.indexRepository(absolutePath, {
        incremental: options.incremental,
        respectIgnore: true,
      });

      spinner.succeed(`Indexed ${repoPath}`);

      console.log();
      console.log(chalk.bold('Indexing complete:'));
      console.log(`  ${chalk.cyan('Files:')}      ${job.filesProcessed}`);
      console.log(`  ${chalk.cyan('Nodes:')}      ${job.nodesCreated}`);
      console.log(`  ${chalk.cyan('Edges:')}      ${job.edgesCreated}`);
      console.log(`  ${chalk.cyan('Embeddings:')} ${job.embeddingsGenerated || 0}`);
      console.log();

      await storage.close();
      await vectorStore.close();
    } catch (error) {
      spinner.fail('Indexing failed');
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });

/**
 * search command - Search indexed code
 */
program
  .command('search')
  .description('Search indexed code')
  .argument('<query>', 'Search query')
  .option('-m, --mode <type>', 'Search mode (exact|semantic|hybrid)', 'hybrid')
  .option('-l, --limit <number>', 'Maximum results', '20')
  .option('--data-dir <path>', 'Data directory', './data')
  .action(async (query, options) => {
    const spinner = ora(`Searching for "${query}"...`).start();

    try {
      const { resolve } = await import('path');
      const dataDir = resolve(options.dataDir);
      const limit = parseInt(options.limit);

      const { loadConfig } = await import('../core/config.js');
      const { SqliteStorageProvider } = await import('../store/sqlite.js');
      const { LanceDBVectorStore } = await import('../store/lance.js');
      const { createEmbeddingProvider } = await import('../llm/provider.js');
      const { SymbolicSearch } = await import('../search/symbolic.js');
      const { VectorSearch } = await import('../search/vector.js');
      const { HybridSearch } = await import('../search/hybrid.js');

      const config = loadConfig();
      const dbPath = resolve(dataDir, 'context-simplo.db');
      const lanceDbPath = resolve(dataDir, 'lancedb');

      const storage = new SqliteStorageProvider(dbPath);
      await storage.initialize();

      const symbolicSearch = new SymbolicSearch(storage);

      let results: any[] = [];
      if (options.mode === 'exact') {
        const response = symbolicSearch.search(query, limit, 0);
        results = response.results;
      } else if (options.mode === 'semantic' || options.mode === 'hybrid') {
        const vectorStore = new LanceDBVectorStore(lanceDbPath);
        await vectorStore.initialize();

        const embeddingProvider = await createEmbeddingProvider(config.llmProvider.value, {
          apiKey: config.llmApiKey.value,
          baseUrl: config.llmBaseUrl.value,
          model: config.llmEmbeddingModel.value,
        });

        if (options.mode === 'semantic') {
          const vectorSearch = new VectorSearch(vectorStore, embeddingProvider);
          const response = await vectorSearch.search(query, '', limit, 0);
          results = response.results;
        } else {
          const vectorSearch = new VectorSearch(vectorStore, embeddingProvider);
          const hybridSearch = new HybridSearch(symbolicSearch, vectorSearch);
          const response = await hybridSearch.search(query, '', limit, 0);
          results = response.results;
        }

        await vectorStore.close();
      }

      spinner.succeed(`Found ${results.length} results for "${query}"`);

      console.log();
      console.log(chalk.bold('Search Results:'));
      console.log();

      results.forEach((result: any, i: number) => {
        console.log(
          `${chalk.gray(`${i + 1}.`)} ${chalk.bold(result.name)} ${chalk.dim(
            `(${result.kind})`
          )} ${chalk.yellow(`[${(result.score * 100).toFixed(1)}%]`)}`
        );
        console.log(
          `   ${chalk.cyan(result.filePath)}:${chalk.yellow(result.lineStart)}`
        );
        if (result.qualifiedName) {
          console.log(`   ${chalk.dim(result.qualifiedName)}`);
        }
        console.log();
      });

      await storage.close();
    } catch (error) {
      spinner.fail('Search failed');
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });

/**
 * status command - Show indexing status
 */
program
  .command('status')
  .description('Show indexing status')
  .option('--data-dir <path>', 'Data directory', './data')
  .action(async (options) => {
    const spinner = ora('Loading status...').start();

    try {
      const { resolve } = await import('path');
      const { stat } = await import('fs/promises');
      const dataDir = resolve(options.dataDir);

      const { loadConfig } = await import('../core/config.js');
      const { SqliteStorageProvider } = await import('../store/sqlite.js');

      const config = loadConfig();
      const dbPath = resolve(dataDir, 'context-simplo.db');

      const storage = new SqliteStorageProvider(dbPath);
      await storage.initialize();

      const dbStats = storage.getStats();

      // Build language breakdown from stored nodes rather than an empty in-memory graph
      const repos = storage.listRepositories();
      const languageBreakdown: Record<string, number> = {};
      for (const repo of repos) {
        if (repo.languages) {
          for (const [lang, count] of Object.entries(repo.languages)) {
            languageBreakdown[lang] = (languageBreakdown[lang] || 0) + count;
          }
        }
      }

      let dbSize = 0;
      try {
        const stats = await stat(dbPath);
        dbSize = stats.size;
      } catch {
        // Database doesn't exist yet
      }

      spinner.succeed('Status loaded');

      console.log();
      console.log(chalk.bold('Context-Simplo Status:'));
      console.log();
      console.log(
        `  ${chalk.cyan('Repositories:')}  ${dbStats.repositoryCount} indexed`
      );
      console.log(
        `  ${chalk.cyan('Files:')}         ${dbStats.fileCount} indexed`
      );
      console.log(
        `  ${chalk.cyan('Nodes:')}         ${dbStats.nodeCount.toLocaleString()}`
      );
      console.log(
        `  ${chalk.cyan('Edges:')}         ${dbStats.edgeCount.toLocaleString()}`
      );
      
      const languages = Object.entries(languageBreakdown)
        .map(([lang, count]) => `${lang} (${count})`)
        .join(', ');
      console.log(
        `  ${chalk.cyan('Languages:')}     ${languages || 'None'}`
      );
      
      const sizeMB = (dbSize / 1024 / 1024).toFixed(1);
      console.log(
        `  ${chalk.cyan('Storage:')}       ${sizeMB} MB`
      );
      
      const providerDisplay = config.llmProvider.value === 'none' 
        ? 'None configured'
        : `${config.llmProvider.value} (${config.llmEmbeddingModel.value || 'default'})`;
      console.log(
        `  ${chalk.cyan('LLM Provider:')}  ${providerDisplay}`
      );
      console.log();

      await storage.close();
    } catch (error) {
      spinner.fail('Failed to load status');
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });

/**
 * setup command - Interactive LLM provider setup
 */
program
  .command('setup')
  .description('Interactive LLM provider setup')
  .option('--data-dir <path>', 'Data directory', './data')
  .action(async (options) => {
    console.log(chalk.bold('Context-Simplo Setup'));
    console.log();

    try {
      const { default: inquirer } = await import('inquirer');
      const { resolve } = await import('path');
      const dataDir = resolve(options.dataDir);

      const { loadConfig } = await import('../core/config.js');
      const { SqliteStorageProvider } = await import('../store/sqlite.js');

      const config = loadConfig();
      const dbPath = resolve(dataDir, 'context-simplo.db');

      const storage = new SqliteStorageProvider(dbPath);
      await storage.initialize();

      console.log(chalk.cyan('LLM Provider Configuration'));
      console.log();

      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Choose your LLM provider:',
          choices: [
            { name: 'OpenAI (requires API key)', value: 'openai' },
            { name: 'Ollama (local, free)', value: 'ollama' },
            { name: 'Azure OpenAI (requires endpoint + key)', value: 'azure' },
            { name: 'None (disable vector search)', value: 'none' },
          ],
          default: config.llmProvider.value,
        },
      ]);

      if (answers.provider === 'none') {
        storage.updateConfig({ llmProvider: 'none' });
        console.log();
        console.log(chalk.green('✓ Configuration saved'));
        console.log(chalk.dim('Vector search disabled. Only exact search will be available.'));
        await storage.close();
        return;
      }

      let providerConfig: any = {};

      if (answers.provider === 'openai') {
        const openaiAnswers = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'OpenAI API Key:',
            validate: (input) => input.length > 0 || 'API key is required',
          },
          {
            type: 'input',
            name: 'model',
            message: 'Embedding model:',
            default: 'text-embedding-3-small',
          },
        ]);
        providerConfig = {
          llmProvider: 'openai',
          llmApiKey: openaiAnswers.apiKey,
          llmEmbeddingModel: openaiAnswers.model,
          llmBaseUrl: 'https://api.openai.com/v1',
        };
      } else if (answers.provider === 'ollama') {
        const ollamaAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'baseUrl',
            message: 'Ollama base URL:',
            default: 'http://localhost:11434',
          },
          {
            type: 'input',
            name: 'model',
            message: 'Embedding model:',
            default: 'nomic-embed-text',
          },
        ]);
        providerConfig = {
          llmProvider: 'ollama',
          llmBaseUrl: ollamaAnswers.baseUrl,
          llmEmbeddingModel: ollamaAnswers.model,
        };
      } else if (answers.provider === 'azure') {
        const azureAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'baseUrl',
            message: 'Azure OpenAI endpoint:',
            validate: (input) => input.startsWith('https://') || 'Must be a valid HTTPS URL',
          },
          {
            type: 'password',
            name: 'apiKey',
            message: 'Azure OpenAI API Key:',
            validate: (input) => input.length > 0 || 'API key is required',
          },
          {
            type: 'input',
            name: 'model',
            message: 'Deployment name:',
            default: 'text-embedding-ada-002',
          },
        ]);
        providerConfig = {
          llmProvider: 'azure',
          llmBaseUrl: azureAnswers.baseUrl,
          llmApiKey: azureAnswers.apiKey,
          llmEmbeddingModel: azureAnswers.model,
        };
      }

      // Test connection
      const spinner = ora('Testing connection...').start();
      try {
        const { createEmbeddingProvider } = await import('../llm/provider.js');
        const testProvider = await createEmbeddingProvider(providerConfig.llmProvider, {
          apiKey: providerConfig.llmApiKey,
          baseUrl: providerConfig.llmBaseUrl,
          model: providerConfig.llmEmbeddingModel,
        });

        const healthy = await testProvider.healthCheck();
        if (!healthy) {
          throw new Error('Health check failed');
        }

        await testProvider.embed(['test']);
        spinner.succeed('Connection successful');
      } catch (error) {
        spinner.fail('Connection failed');
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
        console.log();
        console.log(chalk.yellow('Configuration not saved. Please check your settings and try again.'));
        await storage.close();
        process.exit(1);
      }

      // Save configuration
      storage.updateConfig(providerConfig);

      console.log();
      console.log(chalk.green('✓ Configuration saved'));
      console.log();
      console.log(chalk.bold('Next steps:'));
      console.log(`  1. Start the server: ${chalk.cyan('context-simplo serve')}`);
      console.log(`  2. Index a repository: ${chalk.cyan('context-simplo index <path>')}`);
      console.log(`  3. Search: ${chalk.cyan('context-simplo search <query>')}`);
      console.log();

      await storage.close();
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
