# Benchmark: variant-v0.3.0-toon

**Timestamp:** 2026-09-25T16:18:45.430Z  
**MCP URL:** http://localhost:3001/mcp  
**Response mode:** toon  
**Toolset:** core  

## Repository State

- Repository ID: `c07ed76b24f2f856`
- Files: 200
- Nodes: 1010
- Edges: 1508

## Tool List Overhead

- Bytes: 24066
- Tokens: 5845 (gpt-tokenizer/cl100k_base)

## Scenario Results

| Scenario | Bytes | Wire (full) | Wire text | Structured | Latency (ms) | Shape |
|----------|-------|-------------|-----------|------------|--------------|-------|
| Onboarding: architecture overview | 265 | 65 | 29 | 0 | 17 | unknown |
| Symbol lookup: find compactResponse | 557 | 183 | 62 | 86 | 24 | full |
| Pre-refactor: who calls formatMCPResponse | 1169 | 386 | 163 | 185 | 21 | unknown |
| Refactor blast radius: handleToolCall | 1136 | 371 | 159 | 170 | 8 | unknown |
| Conceptual: where do we handle contextignore | 937 | 207 | 171 | 0 | 31 | unknown |
| Literal: find extractSnippetsBatch | 787 | 261 | 89 | 137 | 4 | full |
| Hybrid: anything related to embedding queue | 335 | 79 | 43 | 0 | 29 | unknown |
| Path: indexRepository to addNode | 1060 | 342 | 159 | 146 | 5 | unknown |
| Pre-release: find dead code | 3176 | 944 | 363 | 545 | 5 | full |
| Complexity: find hotspots | 3712 | 1123 | 490 | 597 | 5 | full |

## Aggregate

- Total scenario bytes: 13134
- Total scenario tokens: 3961
- With tool list: 9806 tokens

## Top-K Identities (for capability comparison)


### Onboarding: architecture overview

*(no results)*

### Symbol lookup: find compactResponse

1. compactResponse

### Pre-refactor: who calls formatMCPResponse

1. MCPServer.executeTool

### Refactor blast radius: handleToolCall

1. src/mcp/server.ts:?

### Conceptual: where do we handle contextignore

*(no results)*

### Literal: find extractSnippetsBatch

1. extractSnippetsBatch

### Hybrid: anything related to embedding queue

*(no results)*

### Path: indexRepository to addNode

*(no results)*

### Pre-release: find dead code

1. AuthService.getToken
2. checkCapabilityRegression
3. compareRuns
4. generateReport
5. countTokens
6. substituteRepoId
7. callMCP
8. parseSSEResponse
9. extractTopKIdentities
10. detectResponseShape

### Complexity: find hotspots

1. registerEmlRoutes
2. parseFile
3. Repositories
4. Explorer
5. registerRepositoryRoutes
6. parseFile.processStructureItem
7. Metrics
8. generateReport
9. Search
10. createAPIServer
