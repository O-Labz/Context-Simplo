# Configuration Guide

Context-Simplo uses a 3-layer configuration system with clear precedence.

## Configuration Layers

1. **Environment Variables** (highest priority)
2. **Dashboard Settings** (via web UI at http://localhost:3000)
3. **Built-in Defaults** (fallback)

## Environment Variables

### LLM Provider

```bash
# Provider type: ollama, openai, azure, none
LLM_PROVIDER=ollama

# API Key (required for openai/azure)
LLM_API_KEY=sk-...

# Base URL
LLM_BASE_URL=http://host.docker.internal:11434

# Embedding model name
LLM_EMBEDDING_MODEL=nomic-embed-text
```

### Storage

```bash
# Data directory (SQLite + LanceDB)
DATA_DIR=/data

# Workspace root (codebase to index)
WORKSPACE_ROOT=/workspace
```

### Indexing

```bash
# Auto-index workspace on startup
AUTO_INDEX=true

# Enable file watching
WATCH_ENABLED=true
```

### Embedding Queue

```bash
# Concurrent embedding requests
EMBEDDING_CONCURRENCY=4

# Batch size for embeddings
EMBEDDING_BATCH_SIZE=32
```

### Graph

```bash
# Memory limit for in-memory graph (MB)
GRAPH_MEMORY_LIMIT_MB=512
```

### Server

```bash
# API server port
API_PORT=3001

# Dashboard port (only for local dev)
DASHBOARD_PORT=3000
```

## LLM Provider Configuration

### Ollama (Local)

```bash
LLM_PROVIDER=ollama
LLM_BASE_URL=http://host.docker.internal:11434
LLM_EMBEDDING_MODEL=nomic-embed-text
```

**macOS/Windows**: `host.docker.internal` works out of the box.

**Linux**: Add to `docker-compose.yml`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

**Verify Ollama is running**:

```bash
curl http://localhost:11434/api/tags
```

**Pull embedding model**:

```bash
ollama pull nomic-embed-text
```

### OpenAI

```bash
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_EMBEDDING_MODEL=text-embedding-3-small
```

**Models**:
- `text-embedding-3-small`: 1536 dimensions, $0.02/1M tokens
- `text-embedding-3-large`: 3072 dimensions, $0.13/1M tokens
- `text-embedding-ada-002`: 1536 dimensions (legacy)

### Azure OpenAI

```bash
LLM_PROVIDER=azure
LLM_API_KEY=your-azure-key
LLM_BASE_URL=https://your-resource.openai.azure.com
LLM_EMBEDDING_MODEL=text-embedding-ada-002
```

### None (Structural Tools Only)

```bash
LLM_PROVIDER=none
```

This disables semantic search but keeps all structural tools working.

## Dashboard Configuration

Access the dashboard at http://localhost:3000 and navigate to Setup.

### LLM Provider Setup

1. Select provider (Ollama, OpenAI, Azure, None)
2. Enter API key (if required)
3. Enter base URL
4. Enter model name
5. Click "Test Connection"
6. Click "Save Configuration"

### MCP IDE Setup

Navigate to "MCP Setup" tab:

1. Select your IDE (Cursor, VS Code, Claude Desktop, Claude Code)
2. Click "Copy" to copy the configuration
3. Paste into the specified file
4. Restart your IDE

## Docker Compose Configuration

### Basic Setup

```yaml
version: '3.8'

services:
  context-simplo:
    build: .
    ports:
      - "3000:3000"  # Dashboard
      - "3001:3001"  # MCP HTTP
    volumes:
      - /path/to/your/code:/workspace:ro
      - context-simplo-data:/data
    environment:
      - LLM_PROVIDER=ollama
      - LLM_BASE_URL=http://host.docker.internal:11434
      - LLM_EMBEDDING_MODEL=nomic-embed-text
      - AUTO_INDEX=true
      - WATCH_ENABLED=true

volumes:
  context-simplo-data:
```

### Advanced Setup

```yaml
version: '3.8'

services:
  context-simplo:
    build: .
    ports:
      - "3000:3000"
      - "3001:3001"
    volumes:
      - /path/to/your/code:/workspace:ro
      - context-simplo-data:/data
      - ./custom.contextignore:/workspace/.contextignore:ro
    environment:
      - LLM_PROVIDER=openai
      - LLM_API_KEY=${OPENAI_API_KEY}
      - LLM_BASE_URL=https://api.openai.com/v1
      - LLM_EMBEDDING_MODEL=text-embedding-3-small
      - AUTO_INDEX=true
      - WATCH_ENABLED=true
      - EMBEDDING_CONCURRENCY=8
      - EMBEDDING_BATCH_SIZE=64
      - GRAPH_MEMORY_LIMIT_MB=1024
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  context-simplo-data:
```

## .contextignore Configuration

Create `.contextignore` in your repository root:

```
# Sensitive files
.env*
*.pem
*.key
*.p12
secrets/
credentials/

# Dependencies
node_modules/
vendor/
.venv/
venv/

# Build artifacts
dist/
build/
target/
*.min.js
*.bundle.js

# IDE files
.vscode/
.idea/
*.swp

# Large files
*.log
*.sqlite
*.db

# Test fixtures
tests/fixtures/
__snapshots__/
```

## Performance Tuning

### For Large Codebases (>50k files)

```bash
# Increase concurrency
EMBEDDING_CONCURRENCY=16
EMBEDDING_BATCH_SIZE=128

# Increase memory
GRAPH_MEMORY_LIMIT_MB=2048
```

### For Low-Memory Environments

```bash
# Reduce concurrency
EMBEDDING_CONCURRENCY=2
EMBEDDING_BATCH_SIZE=16

# Reduce memory
GRAPH_MEMORY_LIMIT_MB=256
```

### For Fast Indexing

```bash
# Disable embeddings during initial index
LLM_PROVIDER=none

# Re-enable after indexing complete
LLM_PROVIDER=ollama
```

## Security Configuration

### Read-Only Workspace

Always mount workspace as read-only:

```yaml
volumes:
  - /path/to/code:/workspace:ro
```

### Secret Scrubbing

Secret scrubbing is always enabled. To customize patterns, edit:

```
src/security/scrubber.ts
```

### Network Isolation

Run without network access (except LLM):

```yaml
networks:
  default:
    driver: bridge
    internal: true
```

## Monitoring

### Health Check

```bash
curl http://localhost:3001/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2026-03-31T12:00:00.000Z"
}
```

### Metrics

```bash
curl http://localhost:3001/api/metrics
```

Response:

```json
{
  "uptime": 123456,
  "memory": {
    "heapUsed": 52428800,
    "heapTotal": 104857600,
    "graphMemory": 10485760
  },
  "graph": {
    "nodeCount": 1234,
    "edgeCount": 5678
  },
  "storage": {
    "sqliteSize": 1048576,
    "lancedbSize": 10485760
  },
  "llm": {
    "connected": true,
    "provider": "ollama",
    "model": "nomic-embed-text"
  }
}
```

## Troubleshooting

### LLM Connection Failed

**Symptom**: Semantic search returns "LLM not configured"

**Solution**:

1. Check LLM provider is running:
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. Verify Docker can reach host:
   ```bash
   docker exec context-simplo ping -c 1 host.docker.internal
   ```

3. Check environment variables:
   ```bash
   docker exec context-simplo env | grep LLM
   ```

### Indexing Slow

**Symptom**: Indexing takes >5 minutes for 10k files

**Solution**:

1. Disable embeddings during initial index:
   ```bash
   LLM_PROVIDER=none
   ```

2. Increase concurrency (if you have CPU headroom):
   ```bash
   EMBEDDING_CONCURRENCY=8
   ```

3. Check for large files in logs:
   ```bash
   docker-compose logs | grep "large file"
   ```

### Memory Issues

**Symptom**: Container OOM killed

**Solution**:

1. Increase Docker memory limit:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 4G
   ```

2. Reduce graph memory limit:
   ```bash
   GRAPH_MEMORY_LIMIT_MB=256
   ```

3. Use `.contextignore` to exclude large directories:
   ```
   node_modules/
   vendor/
   ```

### Dashboard Not Loading

**Symptom**: http://localhost:3000 shows 404

**Solution**:

1. Check dashboard build:
   ```bash
   cd dashboard && npm run build
   ```

2. Verify static files in container:
   ```bash
   docker exec context-simplo ls -la /app/dashboard/dist
   ```

3. Check Fastify logs:
   ```bash
   docker-compose logs | grep fastify
   ```
