# Context-Simplo

> Portable code intelligence MCP server with hybrid vector+BM25 search, auto-indexing, and web dashboard

[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com/r/ohopson/context-simplo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)

## What is this?

Context-Simplo is a production-ready MCP (Model Context Protocol) server that automatically indexes your codebase into a graph+vector database. It provides AI assistants with deep code intelligence: call hierarchies, impact analysis, semantic search, dead code detection, and more. It runs entirely in Docker with support for local (Ollama) or remote (OpenAI) LLMs.

## Quickstart (Docker)

**Important**: Context-Simplo does NOT include embedded AI models. You must provide an external embedding service for semantic search. Choose one of the options below:

### Option 1: Local AI (Ollama) - Recommended for Privacy

Run Ollama locally on your machine for free, private embeddings:

**Step 1: Install and run Ollama**
```bash
# Visit https://ollama.ai or use: brew install ollama (macOS)
ollama pull nomic-embed-text
```

**Step 2: Pull the Context-Simplo image**
```bash
docker pull ohopson/context-simplo:latest
# or for development version
docker pull ohopson/context-simplo:dev
```

**Step 3: Run with Ollama connection**

<details>
<summary><b>macOS / Windows</b></summary>

```bash
docker run -d \
  --name context-simplo \
  -p 3001:3001 \
  -v $(pwd):/workspace:ro \
  -v context-simplo-data:/data \
  -e LLM_PROVIDER=ollama \
  -e LLM_BASE_URL=http://host.docker.internal:11434 \
  -e LLM_EMBEDDING_MODEL=nomic-embed-text \
  ohopson/context-simplo:latest
  # Optional: Customize performance and behavior
  # -e GRAPH_MEMORY_LIMIT_MB=1024 \
  # -e EMBEDDING_CONCURRENCY=10 \
  # -e EMBEDDING_BATCH_SIZE=50 \
  # -e CONTEXT_SIMPLO_LOG_LEVEL=debug \
  # -e CONTEXT_SIMPLO_AUTO_INDEX=true \
  # -e CONTEXT_SIMPLO_WATCH=true
```

**Windows (Command Prompt):**
```cmd
docker run -d ^
  --name context-simplo ^
  -p 3001:3001 ^
  -v %cd%:/workspace:ro ^
  -v context-simplo-data:/data ^
  -e LLM_PROVIDER=ollama ^
  -e LLM_BASE_URL=http://host.docker.internal:11434 ^
  -e LLM_EMBEDDING_MODEL=nomic-embed-text ^
  ohopson/context-simplo:latest
REM Optional: Customize performance and behavior
REM -e GRAPH_MEMORY_LIMIT_MB=1024 ^
REM -e EMBEDDING_CONCURRENCY=10 ^
REM -e EMBEDDING_BATCH_SIZE=50 ^
REM -e CONTEXT_SIMPLO_LOG_LEVEL=debug ^
REM -e CONTEXT_SIMPLO_AUTO_INDEX=true ^
REM -e CONTEXT_SIMPLO_WATCH=true
```

**Windows (PowerShell):**
```powershell
docker run -d `
  --name context-simplo `
  -p 3001:3001 `
  -v ${PWD}:/workspace:ro `
  -v context-simplo-data:/data `
  -e LLM_PROVIDER=ollama `
  -e LLM_BASE_URL=http://host.docker.internal:11434 `
  -e LLM_EMBEDDING_MODEL=nomic-embed-text `
  ohopson/context-simplo:latest
  # Optional: Customize performance and behavior
  # -e GRAPH_MEMORY_LIMIT_MB=1024 `
  # -e EMBEDDING_CONCURRENCY=10 `
  # -e EMBEDDING_BATCH_SIZE=50 `
  # -e CONTEXT_SIMPLO_LOG_LEVEL=debug `
  # -e CONTEXT_SIMPLO_AUTO_INDEX=true `
  # -e CONTEXT_SIMPLO_WATCH=true
```

</details>

<details>
<summary><b>Linux</b></summary>

Linux requires `--add-host` for Ollama connectivity:

```bash
docker run -d \
  --name context-simplo \
  --add-host=host.docker.internal:host-gateway \
  -p 3001:3001 \
  -v $(pwd):/workspace:ro \
  -v context-simplo-data:/data \
  -e LLM_PROVIDER=ollama \
  -e LLM_BASE_URL=http://host.docker.internal:11434 \
  -e LLM_EMBEDDING_MODEL=nomic-embed-text \
  ohopson/context-simplo:latest
  # Optional: Customize performance and behavior
  # -e GRAPH_MEMORY_LIMIT_MB=1024 \
  # -e EMBEDDING_CONCURRENCY=10 \
  # -e EMBEDDING_BATCH_SIZE=50 \
  # -e CONTEXT_SIMPLO_LOG_LEVEL=debug \
  # -e CONTEXT_SIMPLO_AUTO_INDEX=true \
  # -e CONTEXT_SIMPLO_WATCH=true
```

</details>

**Step 4: Open the dashboard**
```bash
# macOS/Linux
open http://localhost:3001

# Windows
start http://localhost:3001
```

**Step 5: Configure your IDE** to use `http://localhost:3001/mcp`

### Option 2: Cloud AI (OpenAI) - Requires API Key

Use OpenAI's embedding API (costs ~$0.02 per 1M tokens):

**Step 1: Pull the image**
```bash
docker pull ohopson/context-simplo:latest
```

**Step 2: Run with OpenAI connection**

<details>
<summary><b>macOS / Linux</b></summary>

```bash
docker run -d \
  --name context-simplo \
  -p 3001:3001 \
  -v $(pwd):/workspace:ro \
  -v context-simplo-data:/data \
  -e LLM_PROVIDER=openai \
  -e LLM_API_KEY=sk-your-api-key-here \
  -e LLM_BASE_URL=https://api.openai.com/v1 \
  -e LLM_EMBEDDING_MODEL=text-embedding-3-small \
  ohopson/context-simplo:latest
  # Optional: Customize performance and behavior
  # -e GRAPH_MEMORY_LIMIT_MB=1024 \
  # -e EMBEDDING_CONCURRENCY=10 \
  # -e EMBEDDING_BATCH_SIZE=50 \
  # -e CONTEXT_SIMPLO_LOG_LEVEL=debug \
  # -e CONTEXT_SIMPLO_AUTO_INDEX=true \
  # -e CONTEXT_SIMPLO_WATCH=true
```

</details>

<details>
<summary><b>Windows (Command Prompt)</b></summary>

```cmd
docker run -d ^
  --name context-simplo ^
  -p 3001:3001 ^
  -v %cd%:/workspace:ro ^
  -v context-simplo-data:/data ^
  -e LLM_PROVIDER=openai ^
  -e LLM_API_KEY=sk-your-api-key-here ^
  -e LLM_BASE_URL=https://api.openai.com/v1 ^
  -e LLM_EMBEDDING_MODEL=text-embedding-3-small ^
  ohopson/context-simplo:latest
REM Optional: Customize performance and behavior
REM -e GRAPH_MEMORY_LIMIT_MB=1024 ^
REM -e EMBEDDING_CONCURRENCY=10 ^
REM -e EMBEDDING_BATCH_SIZE=50 ^
REM -e CONTEXT_SIMPLO_LOG_LEVEL=debug ^
REM -e CONTEXT_SIMPLO_AUTO_INDEX=true ^
REM -e CONTEXT_SIMPLO_WATCH=true
```

</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
docker run -d `
  --name context-simplo `
  -p 3001:3001 `
  -v ${PWD}:/workspace:ro `
  -v context-simplo-data:/data `
  -e LLM_PROVIDER=openai `
  -e LLM_API_KEY=sk-your-api-key-here `
  -e LLM_BASE_URL=https://api.openai.com/v1 `
  -e LLM_EMBEDDING_MODEL=text-embedding-3-small `
  ohopson/context-simplo:latest
  # Optional: Customize performance and behavior
  # -e GRAPH_MEMORY_LIMIT_MB=1024 `
  # -e EMBEDDING_CONCURRENCY=10 `
  # -e EMBEDDING_BATCH_SIZE=50 `
  # -e CONTEXT_SIMPLO_LOG_LEVEL=debug `
  # -e CONTEXT_SIMPLO_AUTO_INDEX=true `
  # -e CONTEXT_SIMPLO_WATCH=true
```

</details>

**Step 3: Open the dashboard**
```bash
# macOS/Linux
open http://localhost:3001

# Windows
start http://localhost:3001
```

**Step 4: Configure your IDE** to use `http://localhost:3001/mcp`

### Option 3: No AI (Structural Tools Only) - Free, No Setup

Run without embeddings - still provides call hierarchies, impact analysis, and other structural features:

**Step 1: Pull the image**
```bash
docker pull ohopson/context-simplo:latest
```

**Step 2: Run without AI**

<details>
<summary><b>macOS / Linux</b></summary>

```bash
docker run -d \
  --name context-simplo \
  -p 3001:3001 \
  -v $(pwd):/workspace:ro \
  -v context-simplo-data:/data \
  -e LLM_PROVIDER=none \
  ohopson/context-simplo:latest
  # Optional: Customize performance and behavior
  # -e GRAPH_MEMORY_LIMIT_MB=1024 \
  # -e CONTEXT_SIMPLO_LOG_LEVEL=debug \
  # -e CONTEXT_SIMPLO_AUTO_INDEX=true \
  # -e CONTEXT_SIMPLO_WATCH=true
```

</details>

<details>
<summary><b>Windows (Command Prompt)</b></summary>

```cmd
docker run -d ^
  --name context-simplo ^
  -p 3001:3001 ^
  -v %cd%:/workspace:ro ^
  -v context-simplo-data:/data ^
  -e LLM_PROVIDER=none ^
  ohopson/context-simplo:latest
REM Optional: Customize performance and behavior
REM -e GRAPH_MEMORY_LIMIT_MB=1024 ^
REM -e CONTEXT_SIMPLO_LOG_LEVEL=debug ^
REM -e CONTEXT_SIMPLO_AUTO_INDEX=true ^
REM -e CONTEXT_SIMPLO_WATCH=true
```

</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
docker run -d `
  --name context-simplo `
  -p 3001:3001 `
  -v ${PWD}:/workspace:ro `
  -v context-simplo-data:/data `
  -e LLM_PROVIDER=none `
  ohopson/context-simplo:latest
  # Optional: Customize performance and behavior
  # -e GRAPH_MEMORY_LIMIT_MB=1024 `
  # -e CONTEXT_SIMPLO_LOG_LEVEL=debug `
  # -e CONTEXT_SIMPLO_AUTO_INDEX=true `
  # -e CONTEXT_SIMPLO_WATCH=true
```

</details>

**Step 3: Open the dashboard**
```bash
# macOS/Linux
open http://localhost:3001

# Windows
start http://localhost:3001
```

**Step 4: Configure your IDE** to use `http://localhost:3001/mcp`

**Note**: Without embeddings, semantic search will not be available, but all structural analysis tools (call hierarchies, impact analysis, dead code detection, etc.) will still work.

## Workspace Configuration

The **workspace** is the directory on your machine that gets mounted into the Docker container at `/workspace`. This is the directory Context-Simplo can browse and index. The dashboard shows the current workspace root at the bottom of the Repositories page.

> **WARNING: Always run Docker commands from your project directory, not your home folder.**
> The workspace mount (`-v $(pwd):/workspace`) maps your **current directory** into the container. If you run this from `~` or `/`, the indexer will attempt to scan your entire home directory or filesystem, which will be extremely slow and use significant disk space. Always `cd` into your project first.

```bash
# CORRECT — run from your project directory
cd ~/projects/my-app
docker-compose up -d

# WRONG — this would try to index your entire home folder
cd ~
docker-compose up -d
```

### Using docker-compose

By default, `docker-compose.yml` mounts the current directory. You can override this with the `WORKSPACE_PATH` environment variable:

```bash
# Default: mounts the current directory (make sure you're in your project!)
docker-compose up -d

# Mount a specific project from anywhere
WORKSPACE_PATH=~/projects/my-app docker-compose up -d

# Mount a parent folder containing multiple projects
WORKSPACE_PATH=~/projects docker-compose up -d
```

### Using docker run

Pass the path directly in the `-v` flag:

```bash
# Mount current directory (cd into your project first!)
docker run -d ... -v $(pwd):/workspace:ro ...

# Mount a specific project
docker run -d ... -v ~/projects/my-app:/workspace:ro ...
```

### Paths inside the container

When adding repositories via the dashboard or MCP tools, use **paths as they appear inside the container**, not your host machine paths:

| Host path | Container path |
|-----------|---------------|
| `~/projects/my-app` (mounted) | `/workspace` or just `/` |
| `~/projects/my-app/src` | `src` |
| `~/projects/my-app/backend` | `backend` |

The dashboard's **Browse** tab shows the container's filesystem, so you can just click to select. The **Enter Path** tab accepts relative paths within the workspace (e.g., `src`, `backend/api`).

## Quickstart (npm/CLI)

```bash
# Install globally
npm install -g context-simplo

# Start server
context-simplo serve

# Or index a repository directly
context-simplo index /path/to/repo

# Search indexed code
context-simplo search "authentication"

# Show status
context-simplo status
```

## Platform Support

Context-Simplo runs on all major platforms via Docker:

| Platform | Architecture | Status |
|----------|-------------|--------|
| **macOS** | Intel (x86_64) | ✅ Supported |
| **macOS** | Apple Silicon (ARM64) | ✅ Supported |
| **Windows** | Intel/AMD (x86_64) | ✅ Supported |
| **Windows** | ARM64 | ✅ Supported |
| **Linux** | Intel/AMD (x86_64) | ✅ Supported |
| **Linux** | ARM64 (Graviton, Ampere, etc.) | ✅ Supported |

**Requirements:**
- Docker Desktop (Windows/macOS) or Docker Engine (Linux)
- 2GB RAM minimum, 4GB recommended
- 500MB disk space for image + data

## Features

- **248 Languages** -- Native tree-sitter parsing via `@kreuzberg/tree-sitter-language-pack`
- **Hybrid Search** -- Vector (LanceDB) + BM25 (SQLite FTS5) with Reciprocal Rank Fusion
- **Auto-Indexing** -- File watcher with incremental updates (<500ms per file change)
- **20 MCP Tools** -- Impact analysis, call hierarchies, dead code detection, complexity analysis
- **Web Dashboard** -- Setup wizard, graph explorer, real-time metrics, MCP config generator
- **Real-Time Updates** -- WebSocket broadcasting for live indexing progress and metrics
- **REST API** -- Full-featured API for external integrations and automation
- **CLI Interface** -- Standalone CLI for scripting and non-Docker workflows
- **Local or Remote LLMs** -- OpenAI, Azure, Ollama, or run without LLM (structural tools still work)
- **Production-Ready** -- Graceful shutdown, crash recovery, secret scrubbing, pagination
- **Portable** -- Single Docker container, ~150-200MB image, SQLite + LanceDB embedded storage

## Architecture

Context-Simplo combines the speed of Arbor's Rust architecture with the rich toolset of CodeGraphContext, implemented in TypeScript with native tree-sitter bindings.

**Core Components:**
- Parser: tree-sitter-language-pack (native C++ NAPI)
- Graph: graphology (in-memory, persisted to SQLite)
- Search: SQLite FTS5 (BM25) + LanceDB (vector) + hybrid fusion
- MCP: stdio + Streamable HTTP dual transport
- Dashboard: React + Vite + Tailwind + Sigma.js

## Documentation

- [Installation Guide](docs/installation.md)
- [MCP IDE Setup](docs/mcp-setup.md)
- [Configuration Reference](docs/configuration.md)
- [MCP Tools Reference](docs/mcp-tools.md)
- [Architecture Overview](docs/architecture.md)
- [Development Guide](docs/CONTRIBUTING.md)

## License

MIT License - see [LICENSE](LICENSE) for details.
