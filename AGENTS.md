# Agent Guidance: Context-Simplo

**MCP server:** `user-context-simplo`  
**Repository ID:** `f00acc4e11a3eac5`

## Routing Rules

Use Context-Simplo MCP **instead of** Grep, Glob, SemanticSearch, or multi-file Read chains when searching code, analyzing structure, or answering conceptual questions.

**Always pass** `repositoryId: "f00acc4e11a3eac5"` to avoid full-index scans.

### Tool Selection

| Task | Tool | Key Parameters |
|------|------|----------------|
| Find symbol by name | `find_symbol` | `name`, optional `kind` filter |
| Who calls function X | `find_callers` | `symbolName` |
| What does function X call | `find_callees` | `symbolName` |
| Trace execution path A→B | `find_path` | `fromSymbol`, `toSymbol` |
| Conceptual query ("how does auth work?") | `semantic_search` | `query`, `repositoryId` |
| Exact string/symbol match | `exact_search` | `query` |
| Mixed semantic + exact | `hybrid_search` | `query`, `repositoryId` |
| Pre-refactor impact check | `get_impact_radius` | `symbolName` |
| Find unused exports | `find_dead_code` | `repositoryId` |
| Find complex functions | `find_complex_functions` | `repositoryId` |
| Calculate cyclomatic complexity | `calculate_complexity` | `symbolName` |
| Architecture summary | `explain_architecture` | `repositoryId`, `detailLevel: 1-3` |
| Validate code snippet | `lint_context` | `language`, `code` |

### Token Optimization

- Default `limit: 10` is sufficient; increase only if results are truncated
- Set `includeSnippets: true` only when code excerpts are required to answer the query
- Use `incremental: true` when re-indexing after edits

### Response Format

Server runs in **compact mode** (abbreviated keys, minified JSON, no nulls). Key mappings:

- `r` = results/callers/callees
- `n` = name
- `qn` = qualifiedName
- `k` = kind
- `fp` = filePath
- `ls` = lineStart
- `le` = lineEnd
- `rid` = repositoryId
- `lang` = language
- `s` = score
- `t` = total
- `m` = hasMore
- `nid` = nodeId
- `x` = isExported
- `cx` = complexity
- `st` = searchType
- `sym` = symbol
- `nodes` = affectedNodes
- `files` = affectedFiles
- `entry` = entryPoints
- `mods` = modules
- `abs` = keyAbstractions

Null values, hash `id`, `visibility`, `limit`, and `offset` fields are stripped.

### Skip Conditions

Do **not** use Context-Simplo for single-file edits where the file is already open or when the user has explicitly provided the file path.
