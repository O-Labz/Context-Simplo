# Benchmark: baseline-v0.1.0

**Timestamp:** 2026-05-04T14:31:42.056Z  
**MCP URL:** http://localhost:3001/mcp  

## Repository State

- Repository ID: `f00acc4e11a3eac5`
- Files: 92
- Nodes: 1907
- Edges: 6686

## Tool List Overhead

- Bytes: 6837
- Tokens: ~1710

## Scenario Results

| Scenario | Bytes | Tokens | Latency (ms) | Shape |
|----------|-------|--------|--------------|-------|
| Onboarding: architecture overview | 6801 | ~1701 | 37 | unknown |
| Symbol lookup: find compactResponse | 611 | ~153 | 16 | full |
| Pre-refactor: who calls formatMCPResponse | 1053 | ~264 | 4 | unknown |
| Refactor blast radius: handleToolCall | 11796 | ~2949 | 5 | unknown |
| Conceptual: where do we handle contextignore | 14629 | ~3658 | 44 | full |
| Literal: find extractSnippetsBatch | 982 | ~246 | 5 | full |
| Hybrid: anything related to embedding queue | 14663 | ~3666 | 42 | full |
| Path: indexRepository to addNode | 1223 | ~306 | 4 | unknown |
| Pre-release: find dead code | 195 | ~49 | 19 | unknown |
| Complexity: find hotspots | 195 | ~49 | 17 | unknown |

## Aggregate

- Total scenario bytes: 52148
- Total scenario tokens: ~13041
- With tool list: ~14751 tokens

## Top-K Identities (for capability comparison)


### Onboarding: architecture overview

*(no results)*

### Symbol lookup: find compactResponse

1. compactResponse

### Pre-refactor: who calls formatMCPResponse

1. formatMCPResponse
2. MCPServer.registerTools

### Refactor blast radius: handleToolCall

*(no results)*

### Conceptual: where do we handle contextignore

1. ContextIgnore.constructor
2. ContextIgnore.loadDefaults
3. ContextIgnore
4. SqliteStorageProvider.upsertFile
5. indexRepository
6. SqliteStorageProvider
7. watchDirectory
8. ContextIgnore.shouldIgnore
9. Indexer.discoverFiles
10. unwatchDirectory

### Literal: find extractSnippetsBatch

1. extractSnippetsBatch

### Hybrid: anything related to embedding queue

1. ConfigManager
2. EmbeddingQueue
3. Setup
4. EmbeddingQueue.embed
5. EmbeddingQueue.processJob
6. main
7. EmbeddingJob
8. EmbeddingQueue.getStats
9. OllamaEmbeddingProvider
10. EmbeddingQueueOptions

### Path: indexRepository to addNode

*(no results)*

### Pre-release: find dead code

*(no results)*

### Complexity: find hotspots

*(no results)*
