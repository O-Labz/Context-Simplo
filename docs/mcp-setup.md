# MCP IDE Setup Guide

This guide explains how to configure your IDE to use Context-Simplo as an MCP server.

## Prerequisites

- Context-Simplo running (Docker or local)
- MCP HTTP endpoint available at http://localhost:3001/mcp

## Automated Setup

Use the provided script:

```bash
./setup-mcp.sh cursor
./setup-mcp.sh vscode
./setup-mcp.sh claude-desktop
./setup-mcp.sh claude-code
```

This creates the configuration file and provides next steps.

## Manual Setup

### Cursor

1. Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "context-simplo": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

2. Restart Cursor

3. Verify: Open command palette → "MCP: List Servers" → Should see "context-simplo"

### VS Code

1. Create `.vscode/mcp.json` in your project root:

```json
{
  "servers": {
    "context-simplo": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

2. Restart VS Code

3. Verify: Open command palette → "MCP: List Servers" → Should see "context-simplo"

### Claude Desktop

1. Open Claude Desktop config:

```bash
# macOS
open ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Linux
open ~/.config/Claude/claude_desktop_config.json

# Windows
notepad %APPDATA%\Claude\claude_desktop_config.json
```

2. Add Context-Simplo server:

```json
{
  "mcpServers": {
    "context-simplo": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

3. Restart Claude Desktop

4. Verify: In chat, type "/" → Should see Context-Simplo tools

### Claude Code

1. Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "context-simplo": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

2. Restart Claude Code

3. Verify: Open command palette → "MCP: List Servers" → Should see "context-simplo"

## Dashboard Method

1. Open http://localhost:3000
2. Navigate to "MCP Setup" tab
3. Select your IDE
4. Click "Copy" to copy the configuration
5. Paste into the specified file
6. Restart your IDE

## Verification

### Test Connection

In your IDE, try calling an MCP tool:

```
Tool: list_repositories
```

Expected response:

```json
{
  "repositories": []
}
```

### Index a Repository

```
Tool: index_repository
Args: { "path": "/workspace/my-project" }
```

Expected response:

```json
{
  "repositoryId": "abc123",
  "filesProcessed": 123,
  "nodesCreated": 456,
  "edgesCreated": 789,
  "duration": 1234
}
```

### Search for Code

```
Tool: exact_search
Args: { "query": "function", "limit": 5 }
```

Expected response:

```json
{
  "results": [
    {
      "nodeId": "node_123",
      "name": "myFunction",
      "qualifiedName": "module.myFunction",
      "kind": "function",
      "filePath": "src/module.ts",
      "lineStart": 10,
      "lineEnd": 20,
      "score": 0.95,
      "language": "typescript"
    }
  ],
  "total": 1,
  "limit": 5,
  "offset": 0,
  "hasMore": false
}
```

## Troubleshooting

### MCP Server Not Found

**Symptom**: IDE doesn't show Context-Simplo in MCP server list

**Solution**:

1. Verify Context-Simplo is running:
   ```bash
   curl http://localhost:3001/health
   ```

2. Check MCP config file exists and is valid JSON

3. Restart IDE (some IDEs cache config)

### Connection Refused

**Symptom**: "Connection refused" error when calling tools

**Solution**:

1. Check port 3001 is exposed:
   ```bash
   docker ps | grep 3001
   ```

2. Check firewall allows localhost:3001

3. Try accessing from browser:
   ```
   http://localhost:3001/health
   ```

### Tools Not Working

**Symptom**: MCP server found, but tools fail

**Solution**:

1. Check Context-Simplo logs:
   ```bash
   docker-compose logs -f
   ```

2. Verify repository is indexed:
   ```
   Tool: list_repositories
   ```

3. Try re-indexing:
   ```
   Tool: index_repository
   Args: { "path": "/workspace/my-project" }
   ```

### Semantic Search Not Working

**Symptom**: `semantic_search` returns "LLM not configured"

**Solution**:

1. Check LLM provider is configured:
   ```bash
   docker exec context-simplo env | grep LLM
   ```

2. Test LLM connection from dashboard:
   - Open http://localhost:3000
   - Navigate to Setup
   - Click "Test Connection"

3. For Ollama, verify host connectivity:
   ```bash
   docker exec context-simplo curl http://host.docker.internal:11434/api/tags
   ```

## Advanced Configuration

### Multiple Repositories

Index multiple repositories:

```json
{
  "mcpServers": {
    "context-simplo-frontend": {
      "url": "http://localhost:3001/mcp",
      "env": {
        "WORKSPACE_ROOT": "/workspace/frontend"
      }
    },
    "context-simplo-backend": {
      "url": "http://localhost:3002/mcp",
      "env": {
        "WORKSPACE_ROOT": "/workspace/backend"
      }
    }
  }
}
```

Run multiple instances:

```bash
docker run -d -p 3001:3001 -v /frontend:/workspace:ro context-simplo
docker run -d -p 3002:3001 -v /backend:/workspace:ro context-simplo
```

### Custom Transport

Use stdio instead of HTTP (for native installations):

```json
{
  "mcpServers": {
    "context-simplo": {
      "command": "node",
      "args": ["/path/to/Context-Simplo/dist/index.js"],
      "env": {
        "WORKSPACE_ROOT": "/path/to/your/code"
      }
    }
  }
}
```

### Environment Variables

Pass environment variables to MCP server:

```json
{
  "mcpServers": {
    "context-simplo": {
      "url": "http://localhost:3001/mcp",
      "env": {
        "LLM_PROVIDER": "openai",
        "LLM_API_KEY": "sk-...",
        "AUTO_INDEX": "true"
      }
    }
  }
}
```

## Next Steps

- [MCP Tools Reference](mcp-tools.md)
- [Configuration Guide](configuration.md)
- [Architecture Overview](architecture.md)
