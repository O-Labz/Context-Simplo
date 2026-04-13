# Changelog

All notable changes to Context-Simplo will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-13

### Added

#### Core Features
- **Context Database** - Graph+vector storage for code intelligence
- **MCP Server** - Model Context Protocol server with stdio + HTTP transport
- **Hybrid Search** - Vector (LanceDB) + BM25 (SQLite FTS5) with Reciprocal Rank Fusion
- **248 Languages** - Native tree-sitter parsing via `@kreuzberg/tree-sitter-language-pack`
- **Auto-Indexing** - File watcher with incremental updates (<500ms per file change)
- **Dynamic Workspace Switching** - Change projects at runtime without restarting

#### MCP Tools (20 total)
- `find_symbol` - Find symbols by name with optional kind filter
- `find_callers` - Find all callers of a function
- `find_callees` - Find all functions called by a function
- `find_path` - Find execution paths between two functions
- `semantic_search` - Conceptual code search using embeddings
- `exact_search` - Literal string/name search
- `hybrid_search` - Combined semantic + keyword search
- `get_impact_radius` - Analyze refactoring impact
- `find_dead_code` - Detect unused code
- `find_complex_functions` - Identify complexity hotspots
- `calculate_complexity` - Compute cyclomatic complexity
- `explain_architecture` - Generate architecture overview
- `lint_context` - Validate code context
- `list_repositories` - List indexed repositories
- `index_repository` - Index a new repository
- `get_repository_status` - Check indexing status
- `get_file_symbols` - Extract symbols from a file
- `get_node_details` - Get detailed node information
- `search_by_type` - Search by symbol type
- `get_metrics` - Retrieve repository metrics

#### Dashboard
- **Web UI** - React + Vite + Tailwind + Sigma.js
- **Graph Explorer** - Interactive code graph visualization
- **Setup Wizard** - LLM provider configuration
- **Metrics Dashboard** - Real-time indexing statistics
- **Workspace Switcher** - Browse and switch projects
- **MCP Config Generator** - Generate IDE-specific MCP configs

#### CLI Tools
- `simplo` CLI - Docker container management
- `simplo start` - Start container with auto-mounting
- `simplo stop` - Stop container
- `simplo restart` - Restart container
- `simplo status` - Show status and workspace
- `simplo logs` - Tail container logs
- `simplo update` - Pull latest image
- `simplo config` - Edit LLM configuration
- `simplo setup <ide>` - Generate MCP config for Cursor, VS Code, Claude Desktop, Claude Code

#### Infrastructure
- **Docker-First** - Single container deployment
- **Configuration Hot Reload** - Update settings without restart
- **WebSocket Broadcasting** - Real-time progress updates
- **REST API** - Full-featured HTTP API
- **Graceful Shutdown** - Clean resource cleanup
- **Crash Recovery** - Resume indexing after failures
- **Secret Scrubbing** - Automatic credential redaction

#### LLM Support
- **Ollama** - Local embedding models
- **OpenAI** - Cloud embeddings (text-embedding-3-small/large)
- **Azure OpenAI** - Enterprise cloud embeddings
- **No LLM Mode** - Structural tools work without embeddings

#### IDE Integration
- **Cursor** - Native MCP support
- **VS Code** - MCP extension support
- **Claude Desktop** - Built-in MCP support
- **Claude Code** - MCP integration

### Documentation
- Installation guide
- MCP IDE setup guide
- Configuration reference
- MCP tools reference
- Architecture overview
- Contributing guide
- Docker deployment guide

### Platform Support
- macOS (Intel + Apple Silicon)
- Windows (x86_64 + ARM64)
- Linux (x86_64 + ARM64)

### Performance
- Incremental indexing: <500ms per file change
- Hybrid search: <100ms for most queries
- Memory efficient: ~200MB base + indexed data
- Docker image: ~150-200MB compressed

---

## Release Notes

### v0.1.0 - Initial Public Release

Context-Simplo is now production-ready and available for public use. This release includes all core features for providing AI assistants with deep code intelligence through the Model Context Protocol.

**Highlights:**
- Complete MCP server implementation with 20 tools
- Hybrid vector+BM25 search across 248 languages
- Docker-first deployment with `simplo` CLI
- Web dashboard with graph visualization
- Support for Cursor, VS Code, and Claude Desktop
- Local (Ollama) or cloud (OpenAI) LLM support

**Getting Started:**
```bash
curl -fsSL https://raw.githubusercontent.com/ohopson/context-simplo/main/bin/simplo \
  -o /usr/local/bin/simplo && chmod +x /usr/local/bin/simplo
simplo start
```

Visit http://localhost:3001 for the dashboard.

---

[0.1.0]: https://github.com/ohopson/context-simplo/releases/tag/v0.1.0
