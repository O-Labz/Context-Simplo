# MCP Tools Reference

Complete reference for all 20 Context-Simplo MCP tools.

## Indexing & Management

### `index_repository`

Index a codebase into the graph.

**Input:**

```json
{
  "path": "/workspace/my-project",
  "incremental": false
}
```

**Output:**

```json
{
  "repositoryId": "abc123",
  "filesProcessed": 123,
  "nodesCreated": 456,
  "edgesCreated": 789,
  "duration": 1234
}
```

### `list_repositories`

List all indexed repositories.

**Input:** None

**Output:**

```json
{
  "repositories": [
    {
      "id": "abc123",
      "name": "my-project",
      "path": "/workspace/my-project",
      "fileCount": 123,
      "nodeCount": 456,
      "edgeCount": 789,
      "languages": { "typescript": 80, "python": 43 }
    }
  ]
}
```

### `delete_repository`

Remove a repository from the index.

**Input:**

```json
{
  "repositoryId": "abc123"
}
```

**Output:**

```json
{
  "success": true
}
```

### `get_stats`

Get statistics about indexed code.

**Input:**

```json
{
  "repositoryId": "abc123"
}
```

**Output:**

```json
{
  "repositoryCount": 1,
  "fileCount": 123,
  "nodeCount": 456,
  "edgeCount": 789,
  "languages": { "typescript": 80, "python": 43 },
  "databaseSize": 1048576
}
```

### `watch_directory`

Enable file watching for auto-updates.

**Input:**

```json
{
  "path": "/workspace/my-project",
  "repositoryId": "abc123"
}
```

**Output:**

```json
{
  "watching": true,
  "path": "/workspace/my-project"
}
```

### `unwatch_directory`

Disable file watching.

**Input:**

```json
{
  "path": "/workspace/my-project"
}
```

**Output:**

```json
{
  "watching": false
}
```

## Structural Queries

### `find_symbol`

Find symbols by name.

**Input:**

```json
{
  "name": "UserService",
  "repositoryId": "abc123",
  "kind": "class",
  "limit": 20,
  "offset": 0
}
```

**Output:**

```json
{
  "results": [
    {
      "nodeId": "node_123",
      "name": "UserService",
      "qualifiedName": "services.UserService",
      "kind": "class",
      "filePath": "src/services/user.ts",
      "lineStart": 10,
      "lineEnd": 50,
      "language": "typescript"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0,
  "hasMore": false
}
```

### `find_callers`

Find all functions that call a target.

**Input:**

```json
{
  "symbolName": "UserService.create",
  "repositoryId": "abc123",
  "limit": 20,
  "offset": 0
}
```

**Output:**

```json
{
  "target": {
    "nodeId": "node_123",
    "name": "create",
    "qualifiedName": "UserService.create"
  },
  "callers": [
    {
      "nodeId": "node_456",
      "name": "registerUser",
      "qualifiedName": "controllers.registerUser",
      "kind": "function",
      "filePath": "src/controllers/auth.ts",
      "lineStart": 20,
      "lineEnd": 30
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0,
  "hasMore": false
}
```

### `find_callees`

Find all functions called by a target.

**Input:**

```json
{
  "symbolName": "registerUser",
  "repositoryId": "abc123",
  "limit": 20,
  "offset": 0
}
```

**Output:**

```json
{
  "target": {
    "nodeId": "node_456",
    "name": "registerUser",
    "qualifiedName": "controllers.registerUser"
  },
  "callees": [
    {
      "nodeId": "node_123",
      "name": "create",
      "qualifiedName": "UserService.create",
      "kind": "method",
      "filePath": "src/services/user.ts",
      "lineStart": 15,
      "lineEnd": 25
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0,
  "hasMore": false
}
```

### `find_path`

Find shortest path between two symbols.

**Input:**

```json
{
  "fromSymbol": "main",
  "toSymbol": "database.connect",
  "repositoryId": "abc123"
}
```

**Output:**

```json
{
  "from": {
    "nodeId": "node_1",
    "name": "main",
    "qualifiedName": "main"
  },
  "to": {
    "nodeId": "node_100",
    "name": "connect",
    "qualifiedName": "database.connect"
  },
  "path": [
    {
      "nodeId": "node_1",
      "name": "main",
      "qualifiedName": "main",
      "filePath": "src/index.ts",
      "lineStart": 10,
      "lineEnd": 20
    },
    {
      "nodeId": "node_50",
      "name": "initApp",
      "qualifiedName": "initApp",
      "filePath": "src/app.ts",
      "lineStart": 5,
      "lineEnd": 15
    },
    {
      "nodeId": "node_100",
      "name": "connect",
      "qualifiedName": "database.connect",
      "filePath": "src/database.ts",
      "lineStart": 3,
      "lineEnd": 10
    }
  ],
  "length": 2
}
```

### `explain_architecture`

Generate high-level architecture summary.

**Input:**

```json
{
  "repositoryId": "abc123"
}
```

**Output:**

```json
{
  "summary": "TypeScript application with 123 files...",
  "structure": {
    "src/": 80,
    "tests/": 43
  },
  "entryPoints": ["src/index.ts", "src/cli.ts"],
  "keyModules": ["services/", "controllers/", "database/"]
}
```

## Search

### `exact_search`

BM25 full-text search for exact matches.

**Input:**

```json
{
  "query": "UserService",
  "limit": 20,
  "offset": 0
}
```

**Output:**

```json
{
  "results": [
    {
      "nodeId": "node_123",
      "name": "UserService",
      "qualifiedName": "services.UserService",
      "kind": "class",
      "filePath": "src/services/user.ts",
      "lineStart": 10,
      "lineEnd": 50,
      "score": 0.95,
      "language": "typescript"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0,
  "hasMore": false
}
```

### `semantic_search`

Vector similarity search for semantic queries.

**Input:**

```json
{
  "query": "How do we handle user authentication?",
  "repositoryId": "abc123",
  "limit": 10,
  "offset": 0
}
```

**Output:**

```json
{
  "results": [
    {
      "nodeId": "node_123",
      "name": "authenticate",
      "qualifiedName": "auth.authenticate",
      "kind": "function",
      "filePath": "src/auth.ts",
      "lineStart": 10,
      "lineEnd": 30,
      "score": 0.87,
      "language": "typescript"
    }
  ],
  "total": 5,
  "limit": 10,
  "offset": 0,
  "hasMore": false
}
```

### `hybrid_search`

Reciprocal Rank Fusion of BM25 + vector search.

**Input:**

```json
{
  "query": "authentication",
  "repositoryId": "abc123",
  "limit": 20,
  "offset": 0
}
```

**Output:** Same format as `semantic_search`.

## Analysis

### `get_impact_radius`

Analyze impact of changing a symbol.

**Input:**

```json
{
  "symbolName": "UserService.create",
  "repositoryId": "abc123",
  "depth": 3
}
```

**Output:**

```json
{
  "target": {
    "nodeId": "node_123",
    "name": "create",
    "qualifiedName": "UserService.create"
  },
  "directCallers": 5,
  "transitiveCallers": 12,
  "affectedFiles": [
    "src/controllers/auth.ts",
    "src/services/user.ts"
  ],
  "impactScore": 0.75
}
```

### `find_dead_code`

Detect unreachable functions.

**Input:**

```json
{
  "repositoryId": "abc123",
  "limit": 20,
  "offset": 0
}
```

**Output:**

```json
{
  "results": [
    {
      "id": "node_999",
      "name": "unusedHelper",
      "qualifiedName": "utils.unusedHelper",
      "kind": "function",
      "filePath": "src/utils.ts",
      "lineStart": 100,
      "lineEnd": 110,
      "language": "typescript"
    }
  ],
  "total": 3,
  "limit": 20,
  "offset": 0,
  "hasMore": false
}
```

### `calculate_complexity`

Compute cyclomatic complexity for a symbol.

**Input:**

```json
{
  "symbolName": "processOrder"
}
```

**Output:**

```json
{
  "symbol": {
    "id": "node_456",
    "name": "processOrder",
    "qualifiedName": "orders.processOrder",
    "kind": "function",
    "filePath": "src/orders.ts",
    "lineStart": 50,
    "lineEnd": 120
  },
  "complexity": 15,
  "rating": "complex"
}
```

### `find_complex_functions`

Find functions above complexity threshold.

**Input:**

```json
{
  "repositoryId": "abc123",
  "threshold": 10,
  "limit": 20,
  "offset": 0
}
```

**Output:**

```json
{
  "results": [
    {
      "id": "node_456",
      "name": "processOrder",
      "qualifiedName": "orders.processOrder",
      "kind": "function",
      "filePath": "src/orders.ts",
      "lineStart": 50,
      "lineEnd": 120,
      "complexity": 15,
      "language": "typescript"
    }
  ],
  "total": 5,
  "limit": 20,
  "offset": 0,
  "hasMore": false
}
```

### `lint_context`

Check if proposed changes match project patterns.

**Input:**

```json
{
  "filePath": "src/services/user.ts",
  "proposedChange": "const x: any = 123;",
  "repositoryId": "abc123"
}
```

**Output:**

```json
{
  "filePath": "src/services/user.ts",
  "proposedChange": "const x: any = 123;",
  "checks": [
    {
      "rule": "no_explicit_any",
      "passed": false,
      "message": "TypeScript: Avoid using explicit 'any' type"
    }
  ],
  "passed": false,
  "message": "Some checks failed"
}
```

### `query_graph`

Cypher-like DSL for custom graph queries.

**Input:**

```json
{
  "query": "MATCH (n:function) WHERE n.language = 'typescript' RETURN n",
  "parameters": {
    "repositoryId": "abc123"
  }
}
```

**Output:**

```json
{
  "query": "MATCH (n:function)...",
  "parameters": { "repositoryId": "abc123" },
  "results": [
    {
      "id": "node_123",
      "name": "authenticate",
      "qualifiedName": "auth.authenticate",
      "kind": "function",
      "filePath": "src/auth.ts",
      "lineStart": 10,
      "lineEnd": 30
    }
  ],
  "count": 1
}
```

## Pagination

All search and query tools support pagination:

- `limit`: Maximum results per page (default: 20)
- `offset`: Number of results to skip (default: 0)
- `hasMore`: Boolean indicating more results available

Example:

```json
{
  "query": "function",
  "limit": 10,
  "offset": 0
}
```

Response:

```json
{
  "results": [...],
  "total": 100,
  "limit": 10,
  "offset": 0,
  "hasMore": true
}
```

Next page:

```json
{
  "query": "function",
  "limit": 10,
  "offset": 10
}
```

## Error Handling

All tools return structured errors:

```json
{
  "error": {
    "code": "PARSE_ERROR",
    "message": "Failed to parse file: syntax error",
    "details": {
      "filePath": "src/broken.ts",
      "line": 42
    }
  }
}
```

Error codes:

- `PARSE_ERROR`: Tree-sitter parsing failed
- `GRAPH_ERROR`: Graph operation failed
- `STORE_ERROR`: Database operation failed
- `LLM_ERROR`: Embedding provider failed
- `VALIDATION_ERROR`: Invalid input
- `NOT_FOUND`: Resource not found

## Best Practices

### Incremental Indexing

Always use `incremental: true` after initial index:

```json
{
  "path": "/workspace/my-project",
  "incremental": true
}
```

This only re-parses changed files (10-100x faster).

### Search Strategy

1. **Exact matches**: Use `exact_search` (fastest)
2. **Semantic queries**: Use `semantic_search` (requires LLM)
3. **Best of both**: Use `hybrid_search` (combines both)

### Impact Analysis

Before refactoring, check impact:

```json
{
  "symbolName": "UserService.create",
  "depth": 3
}
```

If `transitiveCallers` > 10, consider breaking change migration.

### Dead Code Detection

Run periodically to find unused code:

```json
{
  "repositoryId": "abc123"
}
```

Safe to delete if:
- No callers
- Not an entry point
- Not exported from public API

### Complexity Monitoring

Find hotspots for refactoring:

```json
{
  "repositoryId": "abc123",
  "threshold": 15
}
```

Functions with complexity > 15 are refactoring candidates.

## Performance Tips

- Use `limit` to reduce response size
- Use `repositoryId` filters to narrow scope
- Enable file watching for real-time updates
- Use `incremental: true` for re-indexing

## Examples

### Find all authentication-related code

```json
{
  "tool": "semantic_search",
  "args": {
    "query": "user authentication and authorization",
    "repositoryId": "abc123",
    "limit": 10
  }
}
```

### Analyze refactoring impact

```json
{
  "tool": "get_impact_radius",
  "args": {
    "symbolName": "database.query",
    "depth": 5
  }
}
```

### Find complex functions to refactor

```json
{
  "tool": "find_complex_functions",
  "args": {
    "repositoryId": "abc123",
    "threshold": 20
  }
}
```

### Check if change matches project style

```json
{
  "tool": "lint_context",
  "args": {
    "filePath": "src/services/user.ts",
    "proposedChange": "const user: any = await db.query();"
  }
}
```
