# Context-Simplo

> Portable code intelligence MCP server with hybrid vector+BM25 search, auto-indexing, and web dashboard

[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com/r/context-simplo/context-simplo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)

## What is this?

Context-Simplo is a production-ready MCP (Model Context Protocol) server that automatically indexes your codebase into a graph+vector database. It provides AI assistants with deep code intelligence: call hierarchies, impact analysis, semantic search, dead code detection, and more. It runs entirely in Docker with support for local (Ollama) or remote (OpenAI) LLMs.

## Quickstart (Docker)

```bash
# 1. Pull the image
docker pull context-simplo:latest

# 2. Run with your project mounted
docker run -d \
  --name context-simplo \
  -p 3000:3000 -p 3001:3001 \
  -v $(pwd):/workspace:ro \
  -v context-simplo-data:/data \
  -e LLM_PROVIDER=ollama \
  -e LLM_BASE_URL=http://host.docker.internal:11434 \
  context-simplo:latest

# 3. Open the dashboard
open http://localhost:3000

# 4. Configure your IDE to use http://localhost:3001/mcp
```

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
- [Development Guide](CONTRIBUTING.md)

## License

MIT License - see [LICENSE](LICENSE) for details.
