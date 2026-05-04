# Context-Simplo

> Production-ready code intelligence MCP server with hybrid vector+BM25 search, auto-indexing, and web dashboard

[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com/r/ohopson/context-simplo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)

## What is this?

Context-Simplo is a production-ready **context database** and **MCP (Model Context Protocol) server** that automatically indexes your codebase into a graph+vector database. This context tool provides AI assistants like Cursor, VS Code, and Claude Desktop with deep code intelligence: call hierarchies, impact analysis, semantic search, dead code detection, and more.

**Perfect for:**
- 🤖 Enhancing AI assistants (Cursor, VS Code, Claude) with deep codebase understanding
- 🔍 Semantic code search across 248 programming languages
- 📊 Impact analysis before refactoring
- 🗺️ Visualizing call graphs and code dependencies
- 🧹 Finding dead code and complexity hotspots
- 🔄 Switching between multiple projects without container restarts

**Key Features:**
- **Context Database** - Graph+vector storage for code intelligence
- **Hybrid Search** - Combines vector (semantic) + BM25 (keyword) search
- **248 Languages** - Native tree-sitter parsing
- **MCP Server** - Integrates with Cursor, VS Code, Claude Desktop, Claude Code
- **Auto-Indexing** - File watcher with incremental updates (<500ms per change)
- **Web Dashboard** - Visual graph explorer, metrics, and configuration
- **Docker-First** - Single container, no complex setup
- **Local or Cloud LLMs** - Works with Ollama, OpenAI, Azure, or no LLM

### Demo

![Context-Simplo Demo](docs/images/demo.gif)

## Quickstart

Context-Simplo runs in Docker. Choose an embedding provider below.

> **Important**: Context-Simplo does NOT bundle AI models. Provide an external embedding service for semantic search, or run with `LLM_PROVIDER=none` for structural tools only.

#### 1. Local AI (Ollama) — Recommended for Privacy

```bash
# 1. Install Ollama and pull the model
ollama pull nomic-embed-text

# 2. Pull the image
docker pull ohopson/context-simplo:latest
```

<details>
<summary><b>macOS / Windows</b></summary>

```bash
docker run -d \
  --name context-simplo \
  -p 3001:3001 \
  -v "$HOME":/host:ro \
  -v context-simplo-data:/data \
  -e MOUNT_ROOT=/host \
  -e INITIAL_WORKSPACE=/host \
  -e LLM_PROVIDER=ollama \
  -e LLM_BASE_URL=http://host.docker.internal:11434 \
  -e LLM_EMBEDDING_MODEL=nomic-embed-text \
  ohopson/context-simplo:latest
```

</details>

<details>
<summary><b>Linux</b></summary>

```bash
docker run -d \
  --name context-simplo \
  --add-host=host.docker.internal:host-gateway \
  -p 3001:3001 \
  -v "$HOME":/host:ro \
  -v context-simplo-data:/data \
  -e MOUNT_ROOT=/host \
  -e INITIAL_WORKSPACE=/host \
  -e LLM_PROVIDER=ollama \
  -e LLM_BASE_URL=http://host.docker.internal:11434 \
  -e LLM_EMBEDDING_MODEL=nomic-embed-text \
  ohopson/context-simplo:latest
```

</details>

<details>
<summary><b>Windows (Command Prompt)</b></summary>

```cmd
docker run -d ^
  --name context-simplo ^
  -p 3001:3001 ^
  -v %USERPROFILE%:/host:ro ^
  -v context-simplo-data:/data ^
  -e MOUNT_ROOT=/host ^
  -e INITIAL_WORKSPACE=/host ^
  -e LLM_PROVIDER=ollama ^
  -e LLM_BASE_URL=http://host.docker.internal:11434 ^
  -e LLM_EMBEDDING_MODEL=nomic-embed-text ^
  ohopson/context-simplo:latest
```

</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
docker run -d `
  --name context-simplo `
  -p 3001:3001 `
  -v "$env:USERPROFILE":/host:ro `
  -v context-simplo-data:/data `
  -e MOUNT_ROOT=/host `
  -e INITIAL_WORKSPACE=/host `
  -e LLM_PROVIDER=ollama `
  -e LLM_BASE_URL=http://host.docker.internal:11434 `
  -e LLM_EMBEDDING_MODEL=nomic-embed-text `
  ohopson/context-simplo:latest
```

</details>

#### 2. Cloud AI (OpenAI)

```bash
docker pull ohopson/context-simplo:latest
```

<details>
<summary><b>macOS / Linux</b></summary>

```bash
docker run -d \
  --name context-simplo \
  -p 3001:3001 \
  -v "$HOME":/host:ro \
  -v context-simplo-data:/data \
  -e MOUNT_ROOT=/host \
  -e INITIAL_WORKSPACE=/host \
  -e LLM_PROVIDER=openai \
  -e LLM_API_KEY=sk-your-api-key-here \
  -e LLM_BASE_URL=https://api.openai.com/v1 \
  -e LLM_EMBEDDING_MODEL=text-embedding-3-small \
  ohopson/context-simplo:latest
```

</details>

<details>
<summary><b>Windows (Command Prompt)</b></summary>

```cmd
docker run -d ^
  --name context-simplo ^
  -p 3001:3001 ^
  -v %USERPROFILE%:/host:ro ^
  -v context-simplo-data:/data ^
  -e MOUNT_ROOT=/host ^
  -e INITIAL_WORKSPACE=/host ^
  -e LLM_PROVIDER=openai ^
  -e LLM_API_KEY=sk-your-api-key-here ^
  -e LLM_BASE_URL=https://api.openai.com/v1 ^
  -e LLM_EMBEDDING_MODEL=text-embedding-3-small ^
  ohopson/context-simplo:latest
```

</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
docker run -d `
  --name context-simplo `
  -p 3001:3001 `
  -v "$env:USERPROFILE":/host:ro `
  -v context-simplo-data:/data `
  -e MOUNT_ROOT=/host `
  -e INITIAL_WORKSPACE=/host `
  -e LLM_PROVIDER=openai `
  -e LLM_API_KEY=sk-your-api-key-here `
  -e LLM_BASE_URL=https://api.openai.com/v1 `
  -e LLM_EMBEDDING_MODEL=text-embedding-3-small `
  ohopson/context-simplo:latest
```

</details>

#### 3. No AI (Structural Tools Only)

```bash
docker run -d \
  --name context-simplo \
  -p 3001:3001 \
  -v "$HOME":/host:ro \
  -v context-simplo-data:/data \
  -e MOUNT_ROOT=/host \
  -e INITIAL_WORKSPACE=/host \
  -e LLM_PROVIDER=none \
  ohopson/context-simplo:latest
```

Semantic search is unavailable without embeddings, but all structural tools (call hierarchies, impact analysis, dead code detection, etc.) still work.

#### After starting

```bash
open http://localhost:3001        # Dashboard
# Configure your IDE to use http://localhost:3001/mcp
```

**Legacy mode:** The old `-v $(pwd):/workspace:ro` mount style still works. If `/host` is not detected, the server falls back to `/workspace` automatically.

## Workspace Modes

Context-Simplo supports two workspace modes:

### Dynamic mode (recommended)

Mount your home directory at `/host`. The container can browse any subdirectory, and you can switch projects at runtime from the dashboard without restarting.

To switch workspaces at runtime, open the dashboard Repositories page and click **Change** in the workspace bar. Browse to a new directory and click **Switch Workspace**. Re-indexing happens automatically in the background.

### Legacy mode

Mount a single project at `/workspace`. No runtime switching — restart required to change projects.

```bash
docker run -d \
  -v $(pwd):/workspace:ro \
  ...
  ohopson/context-simplo:latest
```

### Container paths

When adding repositories via the dashboard or MCP tools, use **container paths**:

| Host path | Container path (dynamic) | Container path (legacy) |
|-----------|--------------------------|------------------------|
| `~/projects/my-app` | `/host/projects/my-app` | `/workspace` |
| `~/projects/my-app/src` | `/host/projects/my-app/src` | `src` |

The dashboard **Browse** tab shows the container filesystem — click to select.

## Automatic AI Agent Usage (Cursor Rules)

Context-Simplo tools are most effective when your AI agent uses them automatically instead of falling back to file-by-file search. Add a Cursor rule that instructs the agent to prefer Context-Simplo for code intelligence tasks — reducing tool call chains and lowering token costs.

**Create `.cursor/rules/context-simplo-usage.mdc` in your project:**

```markdown
---
description: Route code queries through Context-Simplo MCP
alwaysApply: false
---

# Context-Simplo Routing

**MCP server:** `user-context-simplo`  
**Repository ID (pre-cached):** `<YOUR_REPO_ID>`

## When to use

Use Context-Simplo **instead of** Grep/Glob/SemanticSearch/Read chains when:

- Searching for symbols by name, kind, or pattern
- Finding callers/callees of a function
- Tracing execution paths
- Semantic/conceptual code queries
- Impact analysis before refactoring
- Architecture overviews
- Code quality scans (dead code, complexity)

**Skip Context-Simplo** for single-file edits where the file is already open.

## Tool routing

| Query type | Tool |
|------------|------|
| Symbol by name | `find_symbol` (pass `kind` to filter) |
| Who calls X / what does X call | `find_callers` / `find_callees` |
| Path from A to B | `find_path` |
| Conceptual ("how do we handle auth?") | `semantic_search` |
| Exact name/string | `exact_search` |
| Unsure | `hybrid_search` |
| Pre-refactor check | `get_impact_radius` |
| Code quality | `find_dead_code`, `find_complex_functions`, `calculate_complexity` |
| Architecture | `explain_architecture` |
| Validate code | `lint_context` |

## Token optimization

- Pass `repositoryId: "<YOUR_REPO_ID>"` to all tools (avoids full-index scan)
- Default `limit: 10` is sufficient; increase only if results are incomplete
- Set `includeSnippets: true` only when code context is required for the answer
- Use `incremental: true` when re-indexing after changes

## Response format

Server runs in **compact mode** by default (60% token savings). Response keys abbreviated:

`r`=results/callers/callees, `n`=name, `qn`=qualifiedName, `k`=kind, `fp`=filePath, `ls`=lineStart, `le`=lineEnd, `rid`=repositoryId, `lang`=language, `s`=score, `t`=total, `m`=hasMore, `nid`=nodeId, `x`=isExported, `cx`=complexity, `st`=searchType, `sym`=symbol, `nodes`=affectedNodes, `files`=affectedFiles, `entry`=entryPoints, `mods`=modules, `abs`=keyAbstractions

Null values, `id` hash fields, `visibility`, `limit`, `offset` stripped. JSON minified.
```

**To get your repository ID:** Call `list_repositories` or check the dashboard. Replace `<YOUR_REPO_ID>` in the rule template.

**Why this reduces cost:** Without the rule, AI agents explore codebases by chaining multiple Grep → Read → Grep → Read calls, each consuming tokens. A single Context-Simplo MCP call (e.g., `find_callers` or `get_impact_radius`) replaces entire chains of exploration, returning structured results in one round-trip.

This also works with other MCP-compatible clients (VS Code, Claude Desktop, Claude Code) — adapt the rule format to your IDE's conventions.

## Platform Support

Context-Simplo runs on all major platforms via Docker:

| Platform | Architecture | Status |
|----------|-------------|--------|
| **macOS** | Intel (x86_64) | ✅ Supported |
| **macOS** | Apple Silicon (ARM64) | ✅ Supported |
| **Windows** | Intel/AMD (x86_64) | ✅ Supported |
| **Windows** | ARM64 | ✅ Supported |
| **Linux** | Intel/AMD (x86_64) | ✅ Supported |
| **Linux** | ARM64 (Graviton, Ampere, etc.) | ✅ Supported |

**Requirements:**
- Docker Desktop (Windows/macOS) or Docker Engine (Linux)
- 2GB RAM minimum, 4GB recommended
- 500MB disk space for image + data

## Features

- **248 Languages** -- Native tree-sitter parsing via `@kreuzberg/tree-sitter-language-pack`
- **Hybrid Search** -- Vector (LanceDB) + BM25 (SQLite FTS5) with Reciprocal Rank Fusion
- **Auto-Indexing** -- File watcher with incremental updates (<500ms per file change)
- **Dynamic Workspace Switching** -- Change projects at runtime from the dashboard without restarting
- **20 MCP Tools** -- Impact analysis, call hierarchies, dead code detection, complexity analysis
- **Web Dashboard** -- Setup wizard, graph explorer, real-time metrics, workspace switcher, MCP config generator
- **Real-Time Updates** -- WebSocket broadcasting for live indexing progress and metrics
- **REST API** -- Full-featured API for external integrations and automation
- **Local or Remote LLMs** -- OpenAI, Azure, Ollama, or run without LLM (structural tools still work)
- **Production-Ready** -- Graceful shutdown, crash recovery, secret scrubbing, pagination
- **Portable** -- Single Docker container, ~150-200MB image, SQLite + LanceDB embedded storage

## Architecture

Context-Simplo combines the speed of Arbor's Rust architecture with the rich toolset of CodeGraphContext, implemented in TypeScript with native tree-sitter bindings.

**Core Components:**
- Parser: tree-sitter-language-pack (native C++ NAPI)
- Graph: graphology (in-memory, persisted to SQLite)
- Search: SQLite FTS5 (BM25) + LanceDB (vector) + hybrid fusion
- MCP: stdio + Streamable HTTP dual transport
- Dashboard: React + Vite + Tailwind + Sigma.js

## Documentation

Full documentation available in the [`docs/`](docs/) directory:

- [Installation Guide](docs/installation.md)

## License

MIT License - see [LICENSE](LICENSE) for details.
