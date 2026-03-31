# Installation Guide

This guide covers all installation methods for Context-Simplo.

## Prerequisites

- Docker and Docker Compose (for Docker installation)
- Node.js 22+ (for local installation)
- Git

## Method 1: Docker (Recommended)

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/Context-Simplo.git
cd Context-Simplo
```

### Step 2: Configure Environment

Create a `.env` file:

```bash
# LLM Provider (ollama, openai, azure, none)
LLM_PROVIDER=ollama
LLM_BASE_URL=http://host.docker.internal:11434
LLM_EMBEDDING_MODEL=nomic-embed-text

# For OpenAI/Azure
# LLM_API_KEY=sk-...

# Auto-index workspace on startup
AUTO_INDEX=true

# Enable file watching
WATCH_ENABLED=true
```

### Step 3: Start the Server

```bash
docker-compose up -d
```

### Step 4: Verify Installation

```bash
# Check logs
docker-compose logs -f

# Check health
curl http://localhost:3001/health

# Open dashboard
open http://localhost:3000
```

## Method 2: Local Installation

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Build the Project

```bash
npm run build
```

### Step 3: Configure Environment

Create a `.env` file (same as Docker method).

### Step 4: Start the Server

```bash
npm start
```

## Method 3: Development Mode

For active development with hot reload:

```bash
npm run dev
```

## Method 4: CLI Usage

Context-Simplo provides a CLI for non-Docker users and scripting.

### Installation

```bash
npm install -g context-simplo
```

### Commands

**Start server:**

```bash
context-simplo serve
```

**Index a repository:**

```bash
context-simplo index /path/to/repo
```

**Search indexed code:**

```bash
context-simplo search "authentication"
```

**Show status:**

```bash
context-simplo status
```

**Interactive setup:**

```bash
context-simplo setup
```

### CLI Options

```bash
context-simplo serve --help

Options:
  -p, --port <number>       Dashboard port (default: 3000)
  --mcp-port <number>       MCP server port (default: 3001)
  --transport <type>        MCP transport: stdio|http|both (default: both)
  --data-dir <path>         Data directory (default: ./data)
  --workspace <path>        Workspace root (default: current directory)
  --no-dashboard            Disable web dashboard
  --no-watch                Disable file watching
```

## Post-Installation

### Configure Your IDE

Run the setup script:

```bash
./setup-mcp.sh cursor
```

Or manually configure (see [MCP Setup](mcp-setup.md)).

### Index Your First Repository

Via MCP tool:

```
Tool: index_repository
Args: { "path": "/workspace/my-project" }
```

Or via dashboard:

1. Open http://localhost:3000
2. Navigate to Repositories
3. Click "Index Repository"

## Verification

### Test MCP Connection

From your IDE, try:

```
Tool: list_repositories
```

Expected response:

```json
{
  "repositories": [
    {
      "id": "...",
      "name": "my-project",
      "path": "/workspace/my-project",
      "fileCount": 123,
      "nodeCount": 456
    }
  ]
}
```

### Test Search

```
Tool: exact_search
Args: { "query": "function", "limit": 5 }
```

## Troubleshooting

### Docker Issues

**Problem**: Container fails to start

**Solution**: Check logs

```bash
docker-compose logs context-simplo
```

**Problem**: Cannot connect to host LLM (Ollama)

**Solution**: Verify `host.docker.internal` resolves:

```bash
docker exec context-simplo ping -c 1 host.docker.internal
```

On Linux, ensure `extra_hosts` is configured in `docker-compose.yml`.

### Local Installation Issues

**Problem**: Native module build fails

**Solution**: Ensure you have build tools installed:

```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt-get install build-essential

# Windows
npm install --global windows-build-tools
```

**Problem**: SQLite errors

**Solution**: Rebuild native modules:

```bash
npm rebuild better-sqlite3
```

### Permission Issues

**Problem**: Cannot read workspace files

**Solution**: Ensure workspace is mounted with correct permissions:

```yaml
volumes:
  - /path/to/code:/workspace:ro
```

## Next Steps

- [Configuration Guide](configuration.md)
- [MCP Tools Reference](mcp-tools.md)
- [Architecture Overview](architecture.md)
