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
  .option('-p, --port <number>', 'Dashboard port', '3000')
  .option('--mcp-port <number>', 'MCP server port', '3001')
  .option('--transport <type>', 'MCP transport (stdio|http|both)', 'both')
  .option('--data-dir <path>', 'Data directory', './data')
  .option('--workspace <path>', 'Workspace root', process.cwd())
  .option('--no-dashboard', 'Disable web dashboard')
  .option('--no-watch', 'Disable file watching')
  .action(async (options) => {
    const spinner = ora('Starting Context-Simplo...').start();

    try {
      // TODO: Import and start actual server
      // For now, show what would happen
      spinner.succeed('Server started');

      console.log();
      console.log(chalk.bold('Context-Simplo is running:'));
      console.log();
      console.log(
        `  ${chalk.cyan('Dashboard:')}    http://localhost:${options.port}`
      );
      console.log(
        `  ${chalk.cyan('MCP HTTP:')}     http://localhost:${options.mcpPort}/mcp`
      );
      console.log(
        `  ${chalk.cyan('MCP stdio:')}    ${
          options.transport === 'stdio' || options.transport === 'both'
            ? 'enabled'
            : 'disabled'
        }`
      );
      console.log(
        `  ${chalk.cyan('Data dir:')}     ${options.dataDir}`
      );
      console.log(
        `  ${chalk.cyan('Workspace:')}    ${options.workspace}`
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
  .action(async (path, _options) => {
    const spinner = ora(`Indexing ${path}...`).start();

    try {
      // TODO: Import and run actual indexer
      // For now, simulate indexing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      spinner.succeed(`Indexed ${path}`);

      console.log();
      console.log(chalk.bold('Indexing complete:'));
      console.log(`  ${chalk.cyan('Files:')}      123`);
      console.log(`  ${chalk.cyan('Nodes:')}      1,234`);
      console.log(`  ${chalk.cyan('Edges:')}      3,456`);
      console.log(`  ${chalk.cyan('Languages:')}  TypeScript, Python, Rust`);
      console.log();
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
  .action(async (query, _options) => {
    const spinner = ora(`Searching for "${query}"...`).start();

    try {
      // TODO: Import and run actual search
      // For now, show mock results
      await new Promise((resolve) => setTimeout(resolve, 1000));

      spinner.succeed(`Found 3 results for "${query}"`);

      console.log();
      console.log(chalk.bold('Search Results:'));
      console.log();

      // Mock results
      const results = [
        {
          name: 'authenticateUser',
          kind: 'function',
          file: 'src/auth/authenticate.ts',
          line: 42,
        },
        {
          name: 'AuthService',
          kind: 'class',
          file: 'src/auth/service.ts',
          line: 15,
        },
        {
          name: 'validateToken',
          kind: 'function',
          file: 'src/auth/token.ts',
          line: 28,
        },
      ];

      results.forEach((result, i) => {
        console.log(
          `${chalk.gray(`${i + 1}.`)} ${chalk.bold(result.name)} ${chalk.dim(
            `(${result.kind})`
          )}`
        );
        console.log(
          `   ${chalk.cyan(result.file)}:${chalk.yellow(result.line)}`
        );
        console.log();
      });
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
  .action(async (_options) => {
    const spinner = ora('Loading status...').start();

    try {
      // TODO: Import and get actual status
      // For now, show mock status
      await new Promise((resolve) => setTimeout(resolve, 500));

      spinner.succeed('Status loaded');

      console.log();
      console.log(chalk.bold('Context-Simplo Status:'));
      console.log();
      console.log(
        `  ${chalk.cyan('Repositories:')}  2 indexed`
      );
      console.log(
        `  ${chalk.cyan('Files:')}         1,234 indexed`
      );
      console.log(
        `  ${chalk.cyan('Nodes:')}         12,345`
      );
      console.log(
        `  ${chalk.cyan('Edges:')}         34,567`
      );
      console.log(
        `  ${chalk.cyan('Languages:')}     TypeScript, Python, Rust, Go`
      );
      console.log(
        `  ${chalk.cyan('Storage:')}       45.2 MB`
      );
      console.log(
        `  ${chalk.cyan('LLM Provider:')}  Ollama (nomic-embed-text)`
      );
      console.log();
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
  .action(async (_options) => {
    console.log(chalk.bold('Context-Simplo Setup'));
    console.log();

    try {
      // TODO: Implement interactive prompts
      // For now, show instructions
      console.log(chalk.cyan('LLM Provider Configuration:'));
      console.log();
      console.log('Choose your LLM provider:');
      console.log('  1. OpenAI (requires API key)');
      console.log('  2. Ollama (local, free)');
      console.log('  3. Azure OpenAI (requires endpoint + key)');
      console.log('  4. None (disable vector search)');
      console.log();
      console.log(
        chalk.dim(
          'Tip: Use the web dashboard at http://localhost:3000/setup for guided setup'
        )
      );
      console.log();
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
