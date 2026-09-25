# Agent Guidance: Context-Simplo

**MCP server:** `context-simplo` (HTTP `http://localhost:3001/mcp`; stdio when launched by the IDE)  
**Transport:** MCP SDK v2 — HTTP via stateless `createMcpHandler`, stdio via `McpServer.registerTool`  
**Repository ID:** `f00acc4e11a3eac5`  
**Default toolset:** `core` (`CONTEXT_SIMPLO_TOOLSET=full` adds engineering-memory tools)

## Routing Rules

Use Context-Simplo MCP **instead of** Grep, Glob, SemanticSearch, or multi-file Read chains when searching code, analyzing structure, or answering conceptual questions.

**Always pass** `repositoryId: "f00acc4e11a3eac5"` when multiple repos are indexed.

### Tool Selection (v0.3.0)

| Task | Tool | Key Parameters |
|------|------|----------------|
| Find symbol by name | `find_symbol` | `name`, optional `kind`; includes `complexity` when indexed |
| Callers / callees / both | `find_references` | `symbolName`, `direction`: `in` \| `out` \| `both`, optional `filePath` |
| Trace execution path A→B | `find_path` | `fromSymbol`, `toSymbol` |
| Conceptual query | `semantic_search` | `query`, `repositoryId` |
| Exact string/symbol match | `exact_search` | `query`, optional `repositoryId` |
| Mixed semantic + exact | `hybrid_search` | `query`, `repositoryId` |
| Pre-refactor impact check | `get_impact_radius` | `symbolName`, optional `filePath`, `limit`, `offset` |
| Find unused exports | `find_dead_code` | `repositoryId` |
| Complex functions | `find_complex_functions` | `repositoryId` |
| Architecture summary | `explain_architecture` | `repositoryId`, `detailLevel: 1-3` |
| Watch / unwatch | `watch_directory` | `path`, `enabled`: true/false |
| Memory verify / reinforce / flag | `memory_update` | `action`, `repositoryId` (full toolset only) |

Removed in v0.3.0 (use replacements above): `find_callers`, `find_callees`, `unwatch_directory`, `verify_memory`, `reinforce_memory`, `flag_contradiction`, `get_stats`, `query_graph`, `lint_context`, `calculate_complexity`.

### Token Optimization

- Default `limit: 10` is sufficient; increase only if results are truncated
- Set `includeSnippets: true` only when code excerpts are required
- Use `incremental: true` when re-indexing after edits
- Responses include `root` (repo mount path) and repo-relative `fp` paths
- Optional `CONTEXT_SIMPLO_RESPONSE_MODE=toon` encodes the wire payload with TOON (experimental: did not beat compact in the 2026-09-25 harness); `full` preserves v0.1.0-shaped keys on the wire
- Dashboard **Metrics** shows MCP tokens served (`responseTokensTotal`, `tokensPerMinute`, per-tool breakdown via `/api/metrics`)

### Response Format

Tool results expose **`structuredContent`** (compact JSON object; full objects when `CONTEXT_SIMPLO_RESPONSE_MODE=full`) plus **`content[0].text`** wire text per response mode (`compact` default, or `toon` / `full`).

Wire **compact** mode uses abbreviated keys, minified JSON, and no nulls. Key mappings:

- `r` = results / reference list
- `n` = name, `qn` = qualifiedName (omitted when equal to `n`)
- `k` = kind, `fp` = filePath, `ls` / `le` = line range
- `rid` = repositoryId, `root` = repo root on disk
- `s` = score (3 decimal places), `t` = total, `m` = hasMore
- `sym` = symbol, `files` = grouped impact by file
- `entry` = entryPoints, `mods` = modules, `abs` = keyAbstractions
- `repos` = list_repositories array

Null values, hash `id`, `nodeId`, `visibility`, and pagination echoes are stripped.

### Skip Conditions

Do **not** use Context-Simplo for single-file edits where the file is already open or when the user has explicitly provided the file path.
