import { McpServer } from '@modelcontextprotocol/server';
import type { ResponseMode } from '../core/types.js';
import { toolSpecs, type ContextSimploToolset } from './tool-catalog.js';

export interface McpToolHost {
  getResponseMode(): ResponseMode;
  getToolset(): ContextSimploToolset;
  executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; structuredContent: unknown }>;
}

export function mountToolsOnV2Server(mcp: McpServer, host: McpToolHost): void {
  for (const spec of toolSpecs(host.getToolset())) {
    mcp.registerTool(
      spec.name,
      {
        title: spec.title,
        description: host.getResponseMode() === 'full' ? spec.description : spec.compactDescription,
        inputSchema: spec.input,
        outputSchema: spec.output,
        ...(spec.annotations ? { annotations: spec.annotations } : {}),
      },
      async (args) => host.executeTool(spec.name, args as Record<string, unknown>)
    );
  }
}

export function createV2McpServer(host: McpToolHost): McpServer {
  const mcp = new McpServer(
    { name: 'context-simplo', version: '0.3.0' },
    {
      capabilities: { tools: {} },
      cacheHints: {
        'tools/list': { ttlMs: 30_000, cacheScope: 'private' },
      },
    }
  );
  mountToolsOnV2Server(mcp, host);
  return mcp;
}
