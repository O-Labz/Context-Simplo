# Benchmark: baseline-v1-equivalent-v0.3.0

**Timestamp:** 2026-09-25T16:18:29.068Z  
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
| Onboarding: architecture overview | 265 | 65 | 29 | 0 | 14 | unknown |
| Symbol lookup: find compactResponse | 615 | 186 | 64 | 86 | 5 | full |
| Pre-refactor: who calls formatMCPResponse | 1271 | 374 | 152 | 185 | 5 | unknown |
| Refactor blast radius: handleToolCall | 1221 | 354 | 144 | 170 | 4 | unknown |
| Conceptual: where do we handle contextignore | 1697 | 367 | 331 | 0 | 42 | unknown |
| Literal: find extractSnippetsBatch | 1405 | 396 | 154 | 199 | 4 | full |
| Hybrid: anything related to embedding queue | 791 | 175 | 139 | 0 | 26 | unknown |
| Path: indexRepository to addNode | 1127 | 313 | 130 | 146 | 5 | unknown |
| Pre-release: find dead code | 6443 | 1696 | 574 | 1067 | 4 | full |
| Complexity: find hotspots | 7402 | 1981 | 732 | 1175 | 4 | full |

## Aggregate

- Total scenario bytes: 22237
- Total scenario tokens: 5907
- With tool list: 11752 tokens

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
