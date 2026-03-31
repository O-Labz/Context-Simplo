#!/usr/bin/env bash
set -euo pipefail

echo "Context-Simplo MCP Setup Script"
echo "================================"
echo ""

IDE="${1:-}"

if [ -z "$IDE" ]; then
  echo "Usage: ./setup-mcp.sh [cursor|vscode|claude-desktop|claude-code]"
  echo ""
  echo "Available IDEs:"
  echo "  cursor         - Cursor IDE"
  echo "  vscode         - Visual Studio Code"
  echo "  claude-desktop - Claude Desktop App"
  echo "  claude-code    - Claude Code"
  exit 1
fi

MCP_URL="http://localhost:3001/mcp"

case "$IDE" in
  cursor)
    CONFIG_FILE=".cursor/mcp.json"
    mkdir -p .cursor
    cat > "$CONFIG_FILE" <<EOF
{
  "mcpServers": {
    "context-simplo": {
      "url": "$MCP_URL"
    }
  }
}
EOF
    echo "✓ Created $CONFIG_FILE"
    echo ""
    echo "Next steps:"
    echo "1. Restart Cursor"
    echo "2. The Context-Simplo MCP tools will be available"
    ;;

  vscode)
    CONFIG_FILE=".vscode/mcp.json"
    mkdir -p .vscode
    cat > "$CONFIG_FILE" <<EOF
{
  "servers": {
    "context-simplo": {
      "url": "$MCP_URL"
    }
  }
}
EOF
    echo "✓ Created $CONFIG_FILE"
    echo ""
    echo "Next steps:"
    echo "1. Restart VS Code"
    echo "2. The Context-Simplo MCP tools will be available"
    ;;

  claude-desktop)
    CONFIG_FILE="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    mkdir -p "$(dirname "$CONFIG_FILE")"
    
    if [ -f "$CONFIG_FILE" ]; then
      echo "⚠ Config file already exists: $CONFIG_FILE"
      echo "Please manually add the following to your existing config:"
      echo ""
      cat <<EOF
{
  "mcpServers": {
    "context-simplo": {
      "url": "$MCP_URL"
    }
  }
}
EOF
    else
      cat > "$CONFIG_FILE" <<EOF
{
  "mcpServers": {
    "context-simplo": {
      "url": "$MCP_URL"
    }
  }
}
EOF
      echo "✓ Created $CONFIG_FILE"
    fi
    echo ""
    echo "Next steps:"
    echo "1. Restart Claude Desktop"
    echo "2. The Context-Simplo MCP tools will be available"
    ;;

  claude-code)
    CONFIG_FILE=".mcp.json"
    cat > "$CONFIG_FILE" <<EOF
{
  "mcpServers": {
    "context-simplo": {
      "url": "$MCP_URL"
    }
  }
}
EOF
    echo "✓ Created $CONFIG_FILE"
    echo ""
    echo "Next steps:"
    echo "1. Restart Claude Code"
    echo "2. The Context-Simplo MCP tools will be available"
    ;;

  *)
    echo "Error: Unknown IDE '$IDE'"
    echo "Supported: cursor, vscode, claude-desktop, claude-code"
    exit 1
    ;;
esac

echo ""
echo "MCP Server URL: $MCP_URL"
echo "Dashboard: http://localhost:3000"
echo ""
echo "Make sure Context-Simplo is running:"
echo "  docker-compose up -d"
