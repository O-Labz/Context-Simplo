/**
 * MCP Configuration Generator API Routes
 *
 * GET /api/mcp-config/:ide - Generate IDE-specific MCP config
 *
 * Supported IDEs:
 * - cursor (.cursor/mcp.json)
 * - vscode (.vscode/mcp.json)
 * - claude-desktop (claude_desktop_config.json)
 * - claude-code (.mcp.json)
 *
 * Security:
 * - Returns localhost URLs only
 * - No sensitive data in configs
 * - IDE validation
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

const IDESchema = z.enum(['cursor', 'vscode', 'claude-desktop', 'claude-code']);

export interface McpConfigRouteOptions {
  serverHost: string;
  serverPort: number;
  templatesPath: string;
}

/**
 * Register MCP config generator routes
 */
export async function registerMcpConfigRoutes(
  fastify: FastifyInstance,
  options: McpConfigRouteOptions
): Promise<void> {
  /**
   * GET /api/mcp-config/:ide
   *
   * Generates IDE-specific MCP configuration JSON.
   * Dynamically injects current server hostname and port.
   */
  fastify.get<{ Params: { ide: string } }>(
    '/api/mcp-config/:ide',
    async (request, reply) => {
      const ideResult = IDESchema.safeParse(request.params.ide);

      if (!ideResult.success) {
        return reply.status(400).send({
          error: 'Invalid IDE',
          supported: ['cursor', 'vscode', 'claude-desktop', 'claude-code'],
        });
      }

      const ide = ideResult.data;
      const serverUrl = `http://${options.serverHost}:${options.serverPort}/mcp`;

      try {
        // Load template
        const templatePath = path.join(
          options.templatesPath,
          'mcp',
          `${ide}.json`
        );
        const template = await fs.readFile(templatePath, 'utf-8');
        const config = JSON.parse(template);

        // Inject server URL
        if (ide === 'vscode') {
          config.servers['context-simplo'].url = serverUrl;
        } else {
          config.mcpServers['context-simplo'].url = serverUrl;
        }

        // Return config with metadata
        return {
          ide,
          config,
          configPath: getConfigPath(ide),
          instructions: getInstructions(ide),
        };
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to generate config',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/mcp-config
   *
   * Returns configs for all supported IDEs.
   */
  fastify.get('/api/mcp-config', async () => {
    const ides: Array<z.infer<typeof IDESchema>> = [
      'cursor',
      'vscode',
      'claude-desktop',
      'claude-code',
    ];

    const configs = await Promise.all(
      ides.map(async (ide) => {
        const serverUrl = `http://${options.serverHost}:${options.serverPort}/mcp`;

        try {
          const templatePath = path.join(
            options.templatesPath,
            'mcp',
            `${ide}.json`
          );
          const template = await fs.readFile(templatePath, 'utf-8');
          const config = JSON.parse(template);

          // Inject server URL
          if (ide === 'vscode') {
            config.servers['context-simplo'].url = serverUrl;
          } else {
            config.mcpServers['context-simplo'].url = serverUrl;
          }

          return {
            ide,
            config,
            configPath: getConfigPath(ide),
            instructions: getInstructions(ide),
          };
        } catch (error) {
          return {
            ide,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return { configs };
  });
}

/**
 * Get config file path for IDE
 */
function getConfigPath(ide: z.infer<typeof IDESchema>): string {
  switch (ide) {
    case 'cursor':
      return '.cursor/mcp.json';
    case 'vscode':
      return '.vscode/mcp.json';
    case 'claude-desktop':
      return '~/Library/Application Support/Claude/claude_desktop_config.json';
    case 'claude-code':
      return '.mcp.json';
  }
}

/**
 * Get setup instructions for IDE
 */
function getInstructions(ide: z.infer<typeof IDESchema>): string {
  switch (ide) {
    case 'cursor':
      return 'Create .cursor/mcp.json in your project root, paste the config, and restart Cursor.';
    case 'vscode':
      return 'Create .vscode/mcp.json in your project root, paste the config, and restart VS Code.';
    case 'claude-desktop':
      return 'Open ~/Library/Application Support/Claude/claude_desktop_config.json, add the config to mcpServers, and restart Claude Desktop.';
    case 'claude-code':
      return 'Create .mcp.json in your project root, paste the config, and restart Claude Code.';
  }
}
