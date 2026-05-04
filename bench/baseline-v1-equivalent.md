# Benchmark: baseline-v1-equivalent

**Timestamp:** 2026-05-04T16:22:42.263Z  
**MCP URL:** http://localhost:3001/mcp  

## Repository State

- Repository ID: `c52ddf65534b7b46`
- Files: 95
- Nodes: 418
- Edges: 1727

## Tool List Overhead

- Bytes: 7159
- Tokens: ~1790

## Scenario Results

| Scenario | Bytes | Tokens | Latency (ms) | Shape |
|----------|-------|--------|--------------|-------|
| Onboarding: architecture overview | 5199 | ~1300 | 5 | unknown |
| Symbol lookup: find compactResponse | 577 | ~145 | 3 | full |
| Pre-refactor: who calls formatMCPResponse | 951 | ~238 | 2 | unknown |
| Refactor blast radius: handleToolCall | 9790 | ~2448 | 3 | unknown |
| Conceptual: where do we handle contextignore | 474 | ~119 | 3 | unknown |
| Literal: find extractSnippetsBatch | 948 | ~237 | 3 | full |
| Hybrid: anything related to embedding queue | 5469 | ~1368 | 5 | full |
| Path: indexRepository to addNode | 1053 | ~264 | 2 | unknown |
| Pre-release: find dead code | 195 | ~49 | 2 | unknown |
| Complexity: find hotspots | 195 | ~49 | 2 | unknown |

## Aggregate

- Total scenario bytes: 24851
- Total scenario tokens: ~6217
- With tool list: ~8007 tokens

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
