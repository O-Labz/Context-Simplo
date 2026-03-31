import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const IDE_CONFIGS = {
  cursor: {
    name: 'Cursor',
    file: '.cursor/mcp.json',
    config: {
      mcpServers: {
        'context-simplo': {
          url: 'http://localhost:3001/mcp',
        },
      },
    },
  },
  vscode: {
    name: 'VS Code',
    file: '.vscode/mcp.json',
    config: {
      servers: {
        'context-simplo': {
          url: 'http://localhost:3001/mcp',
        },
      },
    },
  },
  'claude-desktop': {
    name: 'Claude Desktop',
    file: '~/Library/Application Support/Claude/claude_desktop_config.json',
    config: {
      mcpServers: {
        'context-simplo': {
          url: 'http://localhost:3001/mcp',
        },
      },
    },
  },
  'claude-code': {
    name: 'Claude Code',
    file: '.mcp.json',
    config: {
      mcpServers: {
        'context-simplo': {
          url: 'http://localhost:3001/mcp',
        },
      },
    },
  },
};

export default function McpSetup() {
  const [copiedIde, setCopiedIde] = useState<string | null>(null);

  const handleCopy = (ide: string, config: object) => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopiedIde(ide);
    setTimeout(() => setCopiedIde(null), 2000);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">MCP IDE Setup</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-900">
          Copy the configuration for your IDE and paste it into the specified file.
          Restart your IDE after saving the configuration.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {Object.entries(IDE_CONFIGS).map(([key, ide]) => (
          <div key={key} className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">{ide.name}</h3>
              <button
                onClick={() => handleCopy(key, ide.config)}
                className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center space-x-1"
              >
                {copiedIde === key ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">File location:</p>
              <code className="text-xs bg-muted px-2 py-1 rounded">{ide.file}</code>
            </div>

            <div className="bg-muted rounded-md p-3">
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(ide.config, null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-card border border-border rounded-lg p-6">
        <h3 className="font-bold mb-4">Test Connection</h3>
        <p className="text-sm text-muted-foreground mb-4">
          After configuring your IDE, restart it and the MCP server should be available.
        </p>
        <button className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80">
          Test MCP Connection
        </button>
      </div>
    </div>
  );
}
