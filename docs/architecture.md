# Architecture Overview

This document explains the internal architecture of Context-Simplo.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Clients                              │
│         (Cursor, VS Code, Claude Desktop)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP (port 3001)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   MCP Server Layer                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Indexing   │  │    Query     │  │   Analysis   │    │
│  │   Handlers   │  │   Handlers   │  │   Handlers   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Parser     │    │  CodeGraph   │    │   Indexer    │
│ (Tree-sitter)│    │ (Graphology) │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   SQLite     │    │   LanceDB    │    │ File Watcher │
│ (Metadata)   │    │  (Vectors)   │    │  (Chokidar)  │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Core Components

### 1. Parser (`src/core/parser.ts`)

**Responsibility**: Extract code entities from source files.

**Technology**: `@kreuzberg/tree-sitter-language-pack` (native C++ bindings)

**Inputs**: File path, content

**Outputs**: `ParsedFile` with nodes (functions, classes, etc.) and edges (calls, imports)

**Key Operations**:
- Parse file with Tree-sitter
- Extract functions, classes, methods, variables
- Detect calls and imports
- Compute file hash for incremental updates
- Generate unique node IDs

**Performance**: ~1000 files/second (TypeScript)

### 2. CodeGraph (`src/core/graph.ts`)

**Responsibility**: In-memory graph with algorithms.

**Technology**: `graphology` (TypeScript graph library)

**Data Structure**:
- Nodes: Code entities (functions, classes, etc.)
- Edges: Relationships (calls, imports, inheritance)

**Key Operations**:
- `addNode`, `addEdge`: Build graph
- `findByName`: Symbol lookup
- `getCallers`, `getCallees`: Call hierarchy
- `findShortestPath`: Dependency path
- `analyzeImpact`: Change impact analysis
- `findDeadCode`: Unreachable code detection
- `computeCentrality`: Identify critical functions
- `serialize`, `deserialize`: Persistence

**Performance**: All queries <10ms (in-memory)

**Memory**: ~100 bytes per node, ~50 bytes per edge

### 3. Indexer (`src/core/indexer.ts`)

**Responsibility**: Orchestrate indexing pipeline.

**Key Operations**:
- Discover files (respects `.contextignore`)
- Parse files (delegates to Parser)
- Update graph (delegates to CodeGraph)
- Persist to storage (delegates to StorageProvider)
- Emit progress events

**Crash Recovery**:
- Tracks file status: `pending`, `indexing`, `indexed`, `error`
- On restart, resumes incomplete files
- Transactional per-file (all-or-nothing)

**Incremental Updates**:
- Compares SHA-256 hash of file content
- Only re-parses changed files
- Updates graph edges (removes old, adds new)

### 4. StorageProvider (`src/store/provider.ts`)

**Responsibility**: Abstract database operations.

**Implementations**:
- `SqliteStorageProvider`: Production (v1)
- Future: `PostgresStorageProvider` (v2)

**Key Operations**:
- `saveFile`, `saveNode`, `saveEdge`: Persist entities
- `getNode`, `getFile`: Retrieve entities
- `listRepositories`, `getStats`: Metadata queries
- `search`: BM25 full-text search via FTS5
- `transaction`: Atomic operations

**Schema**:
- `repositories`: Repository metadata
- `files`: File metadata (path, hash, mtime, status)
- `nodes`: Code entities
- `edges`: Relationships
- `nodes_fts`: FTS5 virtual table for search

**Migrations**: SQL files in `src/store/migrations/`

### 5. LanceDB Vector Store (`src/store/lance.ts`)

**Responsibility**: Manage vector embeddings for semantic search.

**Technology**: `@lancedb/lancedb` (file-based vector database)

**Data Structure**:
- One table per repository
- Columns: `id`, `nodeId`, `filePath`, `content`, `vector`, metadata

**Key Operations**:
- `upsertChunks`: Idempotent insert/update
- `search`: ANN search with pagination
- `deleteRepository`: Drop table

**Performance**: <200ms for 10k vectors

**Storage**: ~4KB per chunk (1536-dim embeddings)

### 6. Embedding Queue (`src/core/embedding-queue.ts`)

**Responsibility**: Manage async embedding generation with backpressure.

**Design**:
- Bounded queue with configurable concurrency
- Exponential backoff on retryable errors
- Progress events for dashboard
- Graceful drain on shutdown

**Configuration**:
- `EMBEDDING_CONCURRENCY`: Parallel requests (default: 4)
- `EMBEDDING_BATCH_SIZE`: Texts per request (default: 32)
- `maxRetries`: Retry attempts (default: 3)

### 7. File Watcher (`src/core/watcher.ts`)

**Responsibility**: Auto-reindex on file changes.

**Technology**: `chokidar` v4

**Design**:
- Watches workspace directory
- 200ms debounce (prevents thrashing)
- Filters by extension (only source files)
- Triggers incremental re-index on change/add
- Removes nodes on delete

**Events**:
- `watching`: Watcher started
- `change`: File changed
- `delete`: File deleted
- `reindexed`: Re-index complete
- `error`: Watcher error

### 8. MCP Server (`src/mcp/server.ts`)

**Responsibility**: Expose tools via MCP protocol.

**Technology**: `@modelcontextprotocol/sdk`

**Transports**:
- **stdio**: For native installations
- **HTTP**: For Docker (port 3001)

**Tool Categories**:
- Indexing: `index_repository`, `list_repositories`, etc.
- Query: `find_symbol`, `find_callers`, etc.
- Search: `exact_search`, `semantic_search`, `hybrid_search`
- Analysis: `get_impact_radius`, `find_dead_code`, etc.

**Error Handling**:
- Zod validation for inputs
- Typed error hierarchy
- MCP error code mapping

### 9. Security Layer

#### Secret Scrubber (`src/security/scrubber.ts`)

**Responsibility**: Detect and redact secrets.

**Patterns**: 40+ regex patterns for:
- Cloud provider keys (AWS, Azure, GCP)
- API keys (OpenAI, GitHub, Stripe, etc.)
- Private keys (RSA, EC, SSH, PGP)
- Database credentials
- JWT tokens

**Confidence Scoring**:
- High (>0.9): Always redact
- Medium (0.7-0.9): Redact if context suggests secret
- Low (<0.7): Log warning only

#### Context Ignore (`src/security/ignore.ts`)

**Responsibility**: Filter files based on `.contextignore`.

**Technology**: `ignore` npm package (same as `.gitignore`)

**Supports**:
- Glob patterns
- Negation (`!pattern`)
- Directory patterns (`dir/`)

## Data Flow

### Indexing Pipeline

```
File Discovery
    │
    ├─> .contextignore filter
    │
    ▼
Tree-sitter Parse
    │
    ├─> Extract nodes (functions, classes)
    ├─> Extract edges (calls, imports)
    ├─> Compute complexity
    │
    ▼
Secret Scrubbing
    │
    ├─> Detect secrets
    ├─> Redact content
    │
    ▼
Graph Update
    │
    ├─> Add/update nodes
    ├─> Add/update edges
    │
    ▼
Storage Persist
    │
    ├─> SQLite (metadata)
    ├─> FTS5 (BM25 index)
    │
    ▼
Embedding Generation
    │
    ├─> Chunk code (syntax-aware)
    ├─> Generate embeddings (LLM)
    ├─> Upsert to LanceDB
    │
    ▼
Complete
```

### Search Pipeline

#### Exact Search (BM25)

```
Query
  │
  ▼
SQLite FTS5
  │
  ├─> Tokenize query
  ├─> BM25 ranking
  │
  ▼
Results (with scores)
```

#### Semantic Search (Vector)

```
Query
  │
  ▼
Generate Embedding
  │
  ├─> LLM provider
  │
  ▼
LanceDB ANN Search
  │
  ├─> Cosine similarity
  ├─> Top-k results
  │
  ▼
Results (with scores)
```

#### Hybrid Search (RRF)

```
Query
  │
  ├─────────────┬─────────────┐
  ▼             ▼             ▼
BM25        Vector       Reciprocal
Search      Search       Rank Fusion
  │             │             │
  └─────────────┴─────────────┘
                │
                ▼
        Merged Results
```

## Concurrency Model

### Thread Safety

- **Parser**: Stateless, thread-safe
- **Graph**: Single-threaded (in-memory mutations)
- **Storage**: SQLite WAL mode (concurrent reads, serialized writes)
- **LanceDB**: Thread-safe (file-based)
- **Embedding Queue**: Async queue with bounded concurrency

### Async Operations

- Indexing: Async per-file (parallel file I/O)
- Embedding: Async with backpressure (bounded queue)
- File watching: Event-driven (chokidar)
- MCP handlers: Async (await on I/O)

## Error Handling

### Error Hierarchy

```
ContextSimploError (base)
  ├─> ParseError (Tree-sitter failures)
  ├─> GraphError (Graph operation failures)
  ├─> StoreError (Database failures)
  ├─> LLMError (Embedding provider failures)
  ├─> ValidationError (Input validation failures)
  └─> NotFoundError (Resource not found)
```

### Error Context

All errors preserve:
- Operation name
- Original error (if any)
- Retryable flag
- Timestamp

### Error Propagation

1. Component throws typed error
2. Handler catches and logs
3. MCP server maps to MCP error code
4. Client receives structured error

## Performance Characteristics

### Time Complexity

- **Parse file**: O(n) where n = file size
- **Add node**: O(1)
- **Add edge**: O(1)
- **Find by name**: O(log n) where n = node count
- **Get callers**: O(d) where d = in-degree
- **Get callees**: O(d) where d = out-degree
- **Shortest path**: O(V + E) (Dijkstra)
- **Impact analysis**: O(V + E) (BFS)
- **BM25 search**: O(log n) (FTS5 index)
- **Vector search**: O(log n) (ANN index)

### Space Complexity

- **Graph**: O(V + E)
- **SQLite**: ~1KB per file
- **LanceDB**: ~4KB per chunk (1536-dim)

### Scalability Limits

- **Nodes**: 1M+ (limited by memory)
- **Edges**: 10M+ (limited by memory)
- **Files**: 100k+ (limited by disk)
- **Embeddings**: 1M+ chunks (limited by disk)

## Design Decisions

### Why TypeScript?

- Best MCP SDK support (`@modelcontextprotocol/sdk`)
- Mature ecosystem (chokidar, graphology, better-sqlite3)
- Fast iteration (no compile step for dev)
- Native bindings available (Tree-sitter, SQLite)

**Tradeoff**: Slower than Rust for parsing, but native bindings close the gap.

**Future**: Rust napi-rs for hot paths (Phase 11).

### Why SQLite?

- Zero operational overhead
- WAL mode for crash safety
- FTS5 for BM25 search
- Docker-friendly (single file)
- Sufficient for single-instance workload

**Tradeoff**: Not suitable for multi-instance deployments.

**Future**: PostgreSQL support via `StorageProvider` abstraction (Phase 12).

### Why LanceDB?

- Serverless (no separate process)
- File-based (Docker-friendly)
- Fast ANN search (<200ms for 10k vectors)
- SQL-like filters on metadata

**Tradeoff**: Not as mature as Pinecone/Weaviate.

**Alternative**: Could swap for Qdrant/Milvus via abstraction layer.

### Why Graphology?

- Pure TypeScript (no FFI overhead)
- Rich algorithm library (shortest path, centrality, etc.)
- Serialization support (persist to SQLite)
- Active maintenance

**Tradeoff**: In-memory only (limited by RAM).

**Alternative**: Neo4j for disk-based graphs (overkill for v1).

### Why Chokidar?

- Cross-platform (macOS, Linux, Windows)
- Efficient (uses native fs.watch)
- Debouncing built-in
- Mature (10+ years)

**Tradeoff**: Slight delay (200ms) for updates.

**Alternative**: `fs.watch` directly (more complex).

## Extensibility Points

### 1. Storage Provider

Add new database backend:

```typescript
export class PostgresStorageProvider implements StorageProvider {
  // Implement interface
}
```

Register in `src/index.ts`:

```typescript
const storage = new PostgresStorageProvider(config.postgresUrl);
```

### 2. Embedding Provider

Add new LLM provider:

```typescript
export class CohereEmbeddingProvider implements EmbeddingProvider {
  // Implement interface
}
```

Register in `src/llm/provider.ts`:

```typescript
case 'cohere':
  return new CohereEmbeddingProvider(options);
```

### 3. MCP Tools

Add new tool:

1. Define schema in `src/mcp/tools.ts`:

```typescript
export const MyToolInputSchema = z.object({
  param: z.string(),
});
```

2. Implement handler in `src/mcp/handlers/`:

```typescript
export async function myTool(args: Record<string, unknown>, context: HandlerContext) {
  const input = MyToolInputSchema.parse(args);
  // Implementation
}
```

3. Register in `src/mcp/server.ts`:

```typescript
case 'my_tool':
  return myTool(args, context);
```

### 4. Search Algorithms

Add new search method:

```typescript
export class CustomSearch {
  async search(query: string): Promise<SearchResult[]> {
    // Implementation
  }
}
```

Integrate in `src/mcp/handlers/search.ts`.

## Security Model

### Threat Model

**Threats**:
1. Secrets leaked into embeddings
2. Unauthorized file access
3. Code injection via malicious files
4. Resource exhaustion (memory, disk)

**Mitigations**:
1. Secret scrubbing (40+ patterns)
2. `.contextignore` access control
3. Tree-sitter parsing (safe, no eval)
4. Memory limits, graceful shutdown

### Trust Boundaries

```
Untrusted:
- Workspace files (user code)
- LLM provider responses

Trusted:
- MCP clients (IDE)
- Dashboard (localhost only)
- Configuration (environment variables)
```

### Data Flow Security

1. **Input Validation**: Zod schemas on all MCP tool inputs
2. **Secret Scrubbing**: Before indexing, before embedding
3. **Access Control**: `.contextignore` filter before parsing
4. **Output Sanitization**: No raw file content in errors

## Operational Robustness

### Graceful Shutdown

**Priority Order**:
1. File watcher (stop accepting changes)
2. Embedding queue (drain pending jobs)
3. MCP server (close connections)
4. Vector store (flush buffers)
5. SQLite storage (close DB)

**Hard Timeout**: 10 seconds (kills process if stalled)

### Crash Recovery

**On startup**:
1. Load schema version
2. Run pending migrations
3. Find files with status `indexing` (incomplete)
4. Resume indexing for incomplete files

### Health Checks

**Endpoint**: `GET /health`

**Response**:

```json
{
  "status": "healthy",
  "timestamp": "2026-03-31T12:00:00.000Z"
}
```

**Docker**: Health check every 30s, 3 retries, 40s start period.

### Monitoring

**Metrics Endpoint**: `GET /api/metrics`

**Metrics**:
- Uptime
- Memory usage (heap, graph)
- Graph stats (nodes, edges)
- Storage size (SQLite, LanceDB)
- LLM status (connected, provider, model)

**Real-time**: WebSocket updates every 5 seconds.

## Testing Strategy

### Unit Tests

- **Parser**: Fixture files for each language
- **Graph**: All operations (add, query, algorithms)
- **Config**: 3-layer precedence, parsing, validation
- **Storage**: CRUD operations, transactions, migrations

### Integration Tests

- **MCP Protocol**: Real MCP exchanges (stdio transport)
- **Indexing Pipeline**: End-to-end (parse → graph → storage)
- **Search**: BM25, vector, hybrid (with mock LLM)

### Coverage Targets

- Statements: 80%+
- Branches: 80%+
- Functions: 80%+
- Lines: 80%+

### Test Execution

```bash
npm test                  # Run all tests
npm run test:coverage     # With coverage report
npm run test:watch        # Watch mode
```

## Future Optimizations

### Phase 11: Rust napi-rs

**Goal**: 10x faster parsing for hot paths.

**Approach**:
- Rewrite parser in Rust
- Use `napi-rs` for Node.js bindings
- Keep TypeScript for business logic

**Expected Gains**: ~10,000 files/second (vs 1,000 currently)

### Phase 12: PostgreSQL Support

**Goal**: Multi-instance deployments.

**Approach**:
- Implement `PostgresStorageProvider`
- Use `pg` npm package
- Keep SQLite for single-instance

**Use Case**: Shared index across team (multiple developers)

### Phase 13: Multi-Repo Federation

**Goal**: Link graphs across repositories.

**Approach**:
- Detect API boundaries (OpenAPI, gRPC)
- Create cross-repo edges
- Unified search across repos

**Use Case**: Microservices architecture

## Debugging

### Enable Debug Logs

```bash
DEBUG=context-simplo:* npm start
```

### Inspect SQLite Database

```bash
sqlite3 /data/context-simplo.db

.tables
.schema nodes
SELECT COUNT(*) FROM nodes;
```

### Inspect LanceDB

```bash
ls -lh /data/lancedb/
```

### Profile Performance

Use Node.js built-in profiler:

```bash
node --prof dist/index.js
node --prof-process isolate-*.log > profile.txt
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for:
- Development setup
- Code quality standards
- Pull request process
- Testing requirements
