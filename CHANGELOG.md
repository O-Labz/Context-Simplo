# Changelog

All notable changes to Context-Simplo will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-04

### BREAKING CHANGES

#### Response Mode Default
- **Compact mode is now the default** (`CONTEXT_SIMPLO_RESPONSE_MODE=compact`)
- Response keys abbreviated (e.g., `n`=name, `fp`=filePath, `r`=results)
- JSON minified (no whitespace)
- Null values, hash IDs, and metadata fields stripped
- **Migration:** To preserve v0.1.0 behavior, set `CONTEXT_SIMPLO_RESPONSE_MODE=full` in your environment or `.env` file
- **Impact:** ~60% token savings for AI assistants; existing parsers expecting full key names must be updated or use `full` mode

#### Search Tool Defaults
- Default result `limit` reduced from `20` to `10` across all search/query tools
- **Migration:** Explicitly pass `limit: 20` if you need more results, or paginate with `offset`
- **Impact:** Reduced token cost per query; most workflows work well with 10 results

#### Code Snippets Opt-In
- `exact_search`, `semantic_search`, and `hybrid_search` no longer include code snippets by default
- **Migration:** Pass `includeSnippets: true` when you need source code context (up to 10 lines / 500 chars per result)
- **Impact:** Significant token savings for symbol-only queries; snippets cost ~100-500 tokens per result

### Added

- **Startup Logging:** Active `responseMode` is now logged at server startup for operator visibility
- **`includeSnippets` Parameter:** New boolean flag for search tools to opt-in to code snippet extraction
- **Benchmark Harness:** Production benchmark suite (`scripts/benchmark.ts`, `scripts/benchmark-compare.ts`) with 10 day-to-day engineer workflow scenarios
- **AGENTS.md:** Project-level AI agent guidance with pre-cached `repositoryId` and imperative routing rules

### Changed

- **Default Response Mode:** Changed from `full` to `compact` in `src/core/config.ts`
- **Docker Compose:** Added `CONTEXT_SIMPLO_RESPONSE_MODE=compact` to default environment
- **`.env.example`:** Updated to recommend `compact` mode with migration notes
- **Tool Descriptions:** Removed 400+ token preamble from `TOOL_DEFINITIONS_COMPACT[0]`; updated default limit descriptions; removed false token cost estimates from `explain_architecture`
- **Cursor Rule:** Rewritten `.cursor/rules/context-simplo-usage.mdc` with `alwaysApply: false`, tighter descriptions, imperative routing language, and pre-cached `repositoryId` (was adding ~800 tokens per turn)

### Fixed

- **Snippet Extraction Gating:** Search handlers now respect `includeSnippets` flag; snippets no longer extracted unconditionally (saving ~3-10KB per search call)

### Performance

- **Token Savings:** Typical engineer workflow shows 50-70% reduction in MCP response tokens compared to v0.1.0
- **Rule Overhead:** Cursor rule token cost reduced from ~800/turn to 0 (opt-in via `@context-simplo`)
- **Search Efficiency:** Default `limit=10` + snippet opt-in reduces average query cost by 40-60%

### Migration Guide

#### For Existing Deployments

1. **Test Compatibility:** If you have custom MCP clients or parsers, verify they handle abbreviated keys
2. **Opt-Out (if needed):** Add `CONTEXT_SIMPLO_RESPONSE_MODE=full` to your environment to preserve v0.1.0 format
3. **Update Queries:** Review queries that relied on default `limit=20` or automatic snippets; add explicit `limit` or `includeSnippets: true` where needed
4. **Restart Server:** v0.2.0 requires a server restart to pick up new defaults

#### For AI Assistants (Cursor, VS Code, Claude Desktop)

- No changes required if using the MCP SDK (it handles both `full` and `compact` formats)
- If parsing responses manually, update your parser to handle abbreviated keys or set `CONTEXT_SIMPLO_RESPONSE_MODE=full`

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

[0.2.0]: https://github.com/ohopson/context-simplo/releases/tag/v0.2.0
[0.1.0]: https://github.com/ohopson/context-simplo/releases/tag/v0.1.0
