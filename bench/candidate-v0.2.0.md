# Benchmark: candidate-v0.2.0

**Timestamp:** 2026-05-04T16:23:07.519Z  
**MCP URL:** http://localhost:3001/mcp  

## Repository State

- Repository ID: `c52ddf65534b7b46`
- Files: 95
- Nodes: 418
- Edges: 1727

## Tool List Overhead

- Bytes: 6508
- Tokens: ~1627

## Scenario Results

| Scenario | Bytes | Tokens | Latency (ms) | Shape |
|----------|-------|--------|--------------|-------|
| Onboarding: architecture overview | 3340 | ~835 | 6 | unknown |
| Symbol lookup: find compactResponse | 317 | ~80 | 3 | compact |
| Pre-refactor: who calls formatMCPResponse | 504 | ~126 | 2 | compact |
| Refactor blast radius: handleToolCall | 5138 | ~1285 | 3 | unknown |
| Conceptual: where do we handle contextignore | 382 | ~96 | 2 | unknown |
| Literal: find extractSnippetsBatch | 399 | ~100 | 3 | compact |
| Hybrid: anything related to embedding queue | 2623 | ~656 | 5 | compact |
| Path: indexRepository to addNode | 596 | ~149 | 2 | unknown |
| Pre-release: find dead code | 126 | ~32 | 2 | unknown |
| Complexity: find hotspots | 126 | ~32 | 2 | unknown |

## Aggregate

- Total scenario bytes: 13551
- Total scenario tokens: ~3391
- With tool list: ~5018 tokens

## Top-K Identities (for capability comparison)


### Onboarding: architecture overview

1. ErrorBoundary
2. FolderBrowser
3. Navigation
4. useToast
5. ToastContainer
6. useWebSocket
7. Explorer
8. McpSetup
9. Metrics
10. Repositories

### Symbol lookup: find compactResponse

1. compactResponse

### Pre-refactor: who calls formatMCPResponse

1. formatMCPResponse
2. MCPServer.registerTools

### Refactor blast radius: handleToolCall

1. MCPServer.handleToolCall
2. MCPServer.registerTools
3. MCPServer.constructor
4. MCPServer.handleHttpRequest
5. HybridSearch.constructor
6. VectorSearch.constructor
7. ContextIgnore.constructor
8. LanceDBVectorStore.constructor
9. SqliteStorageProvider.constructor
10. UserService.constructor

### Conceptual: where do we handle contextignore

*(no results)*

### Literal: find extractSnippetsBatch

1. extractSnippetsBatch

### Hybrid: anything related to embedding queue

1. EmbeddingQueueOptions
2. EmbeddingJob
3. EmbeddingQueueStats
4. EmbeddingQueue
5. EmbeddingQueue.constructor
6. EmbeddingQueue.embed
7. EmbeddingQueue.processQueue
8. EmbeddingQueue.processJob
9. EmbeddingQueue.drain
10. EmbeddingQueue.getStats

### Path: indexRepository to addNode

1. Indexer.indexRepository
2. Indexer.indexFile
3. CodeGraph.addNode

### Pre-release: find dead code

*(no results)*

### Complexity: find hotspots

*(no results)*
