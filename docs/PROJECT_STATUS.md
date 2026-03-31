# Context-Simplo Project Status

## Overview

Context-Simplo is a portable code intelligence MCP server with hybrid vector+BM25 search, auto-indexing, and a web dashboard. This document tracks implementation progress.

## Completed Components ✅

### Phase 1: Foundation (100% Complete)

- ✅ **Project Scaffolding**
  - package.json with all dependencies
  - TypeScript configuration (strict mode)
  - ESLint and Prettier configuration
  - Vitest test configuration
  - Directory structure
  - Git repository initialization
  - README.md
  - LICENSE (MIT)

- ✅ **Core Type Definitions** (`src/core/types.ts`)
  - CodeNode, GraphEdge, FileMetadata, RepositoryInfo
  - IndexJob, SearchResult, PaginatedResponse
  - All types with Zod validation schemas
  - ConfigValue with source tracking (env/dashboard/default)

- ✅ **Error Hierarchy** (`src/core/errors.ts`)
  - ContextSimploError base class
  - ParseError, GraphError, StoreError, LLMError
  - ConfigError, SecurityError, ValidationError
  - NotFoundError, MCPProtocolError
  - Error sanitization for logging

- ✅ **Configuration Module** (`src/core/config.ts`)
  - 3-layer precedence (env > dashboard > defaults)
  - ConfigValue tracking with source and lock status
  - Environment variable parsing (boolean, number, string)
  - URL validation
  - Required key validation (API keys for providers)
  - Default embedding models per provider

- ✅ **Parser Module** (`src/core/parser.ts`)
  - Wrapper around @kreuzberg/tree-sitter-language-pack
  - Extracts functions, classes, methods, variables
  - Extracts calls, imports, inheritance relationships
  - SHA-256 hash computation for incremental updates
  - Support for 248 languages via tree-sitter

- ✅ **Graph Engine** (`src/core/graph.ts`)
  - graphology DirectedGraph implementation
  - addNode, addEdge, getNode operations
  - findByName, findByPattern with filtering
  - getCallers, getCallees with edge kind filtering
  - findShortestPath (BFS)
  - analyzeImpact (blast radius calculation)
  - findDeadCode (zero incoming edges)
  - explainArchitecture (tiered detail levels)
  - computeCentrality (betweenness centrality)
  - serialize/deserialize for persistence
  - Memory footprint estimation

- ✅ **Unit Tests**
  - Parser tests with TypeScript and Python fixtures
  - Graph tests (all operations)
  - Config tests (precedence, validation)
  - Test fixtures in `tests/fixtures/`

### Phase 2: Persistence (100% Complete)

- ✅ **SQLite Storage Provider** (`src/store/sqlite.ts`)
  - StorageProvider interface implementation
  - WAL mode for crash safety
  - Foreign key constraints
  - Prepared statements for performance
  - Transaction support
  - Migration runner
  - FTS5 virtual table for BM25 search
  - CRUD operations for all entities
  - Statistics and health queries

- ✅ **Database Schema** (`src/store/migrations/001_initial.sql`)
  - schema_version table for migrations
  - repositories, files, nodes, edges tables
  - nodes_fts FTS5 virtual table
  - config table for dashboard settings
  - Indexes on all foreign keys and search columns
  - File status tracking (pending/indexing/indexed/error)

- ✅ **Indexer Module** (`src/core/indexer.ts`)
  - Orchestrates parse -> graph -> persist pipeline
  - Transactional per-file indexing
  - Crash recovery (resumes incomplete files)
  - Incremental updates via hash comparison
  - Event emitter for progress tracking
  - File discovery with source file filtering
  - Edge resolution (calls, inheritance)

- ✅ **Symbolic Search** (`src/search/symbolic.ts`)
  - BM25 full-text search via SQLite FTS5
  - Pagination support (limit/offset/hasMore)
  - searchByName, searchByQualifiedName
  - searchInFile for file-scoped queries

### Phase 3: MCP Foundation (Partial - 40% Complete)

- ✅ **MCP Tool Definitions** (`src/mcp/tools.ts`)
  - All 20 tool definitions with descriptions
  - Zod input schemas for validation
  - Pagination parameters (limit/offset)
  - Tool categories: indexing, structural, search, analysis

- ⏳ **MCP Server** (`src/mcp/server.ts`) - NOT YET IMPLEMENTED
- ⏳ **Tool Handlers** (`src/mcp/handlers/`) - NOT YET IMPLEMENTED

### Infrastructure (Partial - 60% Complete)

- ✅ **Docker Configuration**
  - Multi-stage Dockerfile (node:22-alpine)
  - docker-compose.yml with volumes and env vars
  - extra_hosts for Linux Ollama connectivity
  - Health check configuration

- ✅ **Main Entry Point** (`src/index.ts`)
  - Basic initialization
  - Graceful shutdown (SIGTERM/SIGINT)
  - Config loading
  - Storage and graph initialization

- ✅ **Default Ignore File** (`.contextignore.default`)
  - Sensible defaults for secrets, dependencies, build outputs

- ✅ **Contributing Guide** (`CONTRIBUTING.md`)

## Remaining Work 🚧

### Phase 3: MCP Server (60% remaining)

- ⏳ **MCP Server Implementation**
  - @modelcontextprotocol/sdk integration
  - stdio transport
  - Streamable HTTP transport (port 3001)
  - Tool registration
  - Request/response handling
  - Error mapping to MCP error codes

- ⏳ **Structural Tool Handlers** (`src/mcp/handlers/indexing.ts`, `query.ts`)
  - index_repository
  - watch_directory, unwatch_directory
  - list_repositories, delete_repository
  - get_stats
  - find_symbol
  - find_callers, find_callees
  - find_path

- ⏳ **Search Tool Handlers** (`src/mcp/handlers/search.ts`)
  - exact_search (delegates to SymbolicSearch)
  - semantic_search (requires LLM provider)
  - hybrid_search (requires both)

### Phase 4: LLM Integration (0% complete)

- ⏳ **LLM Provider Abstraction** (`src/llm/provider.ts`)
  - EmbeddingProvider interface
  - Factory function for provider selection

- ⏳ **OpenAI Provider** (`src/llm/openai.ts`)
  - OpenAI-compatible API client
  - Batching, rate limiting, retry with backoff
  - Support for OpenAI, Azure, Groq, Together

- ⏳ **Ollama Provider** (`src/llm/ollama.ts`)
  - Ollama HTTP API client
  - Model detection
  - Health check

- ⏳ **Embedding Queue** (`src/core/embedding-queue.ts`)
  - Bounded async queue
  - Backpressure handling
  - Retry with exponential backoff
  - Progress events

- ⏳ **Syntax-Aware Chunker** (`src/llm/chunker.ts`)
  - Split code at function/class boundaries
  - Include symbol context in chunks

- ⏳ **LanceDB Vector Store** (`src/store/lance.ts`)
  - Table setup
  - Upsert embeddings
  - ANN search with pagination

- ⏳ **Vector Search** (`src/search/vector.ts`)
  - semantic_search implementation

- ⏳ **Hybrid Search** (`src/search/hybrid.ts`)
  - Reciprocal Rank Fusion combiner

### Phase 5: File Watching (0% complete)

- ⏳ **File Watcher** (`src/core/watcher.ts`)
  - chokidar v4 integration
  - Debouncing (200ms window)
  - Incremental re-index on file changes
  - Event emission for dashboard

- ⏳ **Shutdown Manager** (`src/core/shutdown.ts`)
  - Ordered cleanup handlers
  - 10-second hard timeout
  - Stop watchers, flush WAL, close connections

### Phase 6: Security (0% complete)

- ⏳ **Secret Scrubber** (`src/security/scrubber.ts`)
  - 40+ regex patterns for secrets
  - API keys, tokens, passwords, private keys
  - Confidence scoring
  - [REDACTED:<category>] replacement

- ⏳ **Contextignore Parser** (`src/security/ignore.ts`)
  - Pathspec-compatible glob matching
  - Load from .contextignore file
  - Integration with indexer

### Phase 7: Web Dashboard (0% complete)

- ⏳ **Dashboard Scaffolding** (`dashboard/`)
  - React 19 + Vite 6 + Tailwind CSS 4
  - shadcn/ui components
  - Routing (React Router)

- ⏳ **Setup Wizard** (`dashboard/src/pages/Setup.tsx`)
  - LLM provider selection
  - API key input
  - Connection testing
  - Platform detection for Ollama URL

- ⏳ **Repositories Page** (`dashboard/src/pages/Repositories.tsx`)
  - List indexed repos
  - Progress bars during indexing
  - Actions: re-index, delete, toggle watch

- ⏳ **Graph Explorer** (`dashboard/src/pages/Explorer.tsx`)
  - Sigma.js visualization
  - Click to see callers/callees
  - Filter by language, node type, file path

- ⏳ **Search Page** (`dashboard/src/pages/Search.tsx`)
  - Unified search bar
  - Toggle semantic/exact/hybrid
  - Results with code preview

- ⏳ **MCP Setup Page** (`dashboard/src/pages/McpSetup.tsx`)
  - Auto-generated IDE configs
  - Copy buttons for Cursor, VS Code, Claude Desktop, Claude Code
  - Connection tester

- ⏳ **Metrics Page** (`dashboard/src/pages/Metrics.tsx`)
  - Real-time health stats
  - Embedding queue depth
  - MCP traffic breakdown
  - Memory usage

- ⏳ **Fastify API Server** (`src/api/server.ts`)
  - Serve dashboard static files
  - REST API endpoints
  - MCP HTTP transport
  - WebSocket for real-time updates

- ⏳ **WebSocket Handler** (`src/api/websocket.ts`)
  - Event bus for dashboard
  - index:progress, health:update, etc.

### Phase 8: Advanced Tools (0% complete)

- ⏳ **Analysis Handlers** (`src/mcp/handlers/analysis.ts`)
  - get_impact_radius
  - find_dead_code
  - calculate_complexity
  - find_complex_functions
  - lint_context

- ⏳ **Architecture Handler** (`src/mcp/handlers/architecture.ts`)
  - explain_architecture
  - query_graph (Cypher-like DSL)

### Phase 9: Polish (0% complete)

- ⏳ **MCP Config Templates** (`templates/mcp/`)
  - cursor.json
  - vscode.json
  - claude-desktop.json
  - claude-code.json

- ⏳ **Setup Script** (`scripts/setup-mcp.sh`)
  - Auto-detect IDE
  - Generate and install config

- ⏳ **Comprehensive README**
  - Quickstart (Docker + npm)
  - Screenshots
  - MCP IDE setup guide
  - Configuration reference
  - Tool reference
  - Architecture diagram
  - FAQ / Troubleshooting

### Phase 10: CLI (0% complete)

- ⏳ **CLI Commands** (`src/cli/index.ts`)
  - `context-simplo index <path>`
  - `context-simplo serve`
  - `context-simplo search <query>`
  - `context-simplo status`
  - `context-simplo setup`

## Testing Coverage

- ✅ Parser unit tests
- ✅ Graph unit tests
- ✅ Config unit tests
- ⏳ Storage integration tests
- ⏳ Indexer integration tests
- ⏳ MCP protocol tests
- ⏳ Search pipeline tests
- ⏳ Dashboard E2E tests (Playwright)

## Next Steps

To complete the MVP (Minimum Viable Product), the priority order is:

1. **MCP Server + Structural Tools** - Core functionality for IDE integration
2. **LLM Integration** - Enables semantic search
3. **File Watching** - Auto-indexing for developer workflow
4. **Security** - Secret scrubbing and .contextignore
5. **Web Dashboard** - User-friendly configuration and monitoring
6. **Advanced Tools** - Impact analysis, dead code detection
7. **Polish** - README, templates, CLI

## Building and Running

### Current State

The project can be built but is not yet functional end-to-end:

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Run tests (parser, graph, config)
pnpm test

# The main entry point initializes storage and graph but doesn't expose MCP tools yet
node dist/index.js
```

### When Complete

Once the MCP server is implemented:

```bash
# Docker
docker-compose up

# npm
npm install -g context-simplo
context-simplo serve
```

## Architecture Decisions

- **TypeScript over Rust** - Simpler build, better MCP SDK support, native tree-sitter bindings
- **graphology over petgraph** - No FFI boundary, full TypeScript support
- **SQLite over PostgreSQL** - Zero operational overhead, perfect for single-container deployment
- **Streamable HTTP over stdio** - Better Docker UX, no `docker exec` complexity
- **Rust napi-rs deferred to Phase 11** - Optimize only if profiling shows need

## License

MIT
