# Context-Simplo

**Cut your AI coding assistant's token usage by ~75%.**

Your AI assistant is brilliant at writing code and terrible at remembering anything. Every session it starts from zero: re-reading files, re-discovering how your code fits together, asking you the same questions, repeating mistakes the team already learned from six months ago. All of that burns tokens on *finding* code instead of *building* it.

Context-Simplo fixes that. It indexes your codebase into a graph and vector store, then layers a persistent engineering memory on top, and serves all of it to your assistant over MCP. The assistant stops grepping around blind and starts asking real questions: who calls this function, what breaks if I delete it, why did we pick Postgres over Mongo, have we tried this migration before, who actually owns this module.

![Context-Simplo in action](docs/images/demo.gif)

It runs as a single Docker container. Local-first, your code never has to leave your machine.

## The number that matters

On a suite of 10 real engineering workflows, answering through Context-Simplo used **~75% fewer tokens** than the same questions answered with a grep-and-read loop — same answers, a fraction of the context.

| Approach | Tokens to answer the same questions |
|----------|-------------------------------------|
| grep-and-read (glob + read + grep) | ~42,000 |
| Context-Simplo MCP | ~6,000 |
| **Reduction** | **~85%** |

The internal wire-format benchmark (v0.1.0 → v0.2.0) independently shows a **74% drop** (13,041 → 3,391 tokens) on the same indexed repo, with zero capability regressions. It's reproducible on your own machine in two commands — see **[the full benchmark](docs/benchmark.md)**.

Fewer tokens finding things means more tokens — and more of your budget — left for actually building.

## Why it's different

Most "AI code context" tools stop at search. They give the model a better grep and call it a day. The hard part isn't finding code, it's understanding it: how it connects, who knows it, and the history of decisions that got you here.

Context-Simplo tracks two things at once:

1. **The structure** of your code, as a live dependency graph plus semantic search.
2. **The memory** of your engineering, captured from commits, PRs, and your assistant's own work, then kept honest over time.

The second part is the one nobody else does well, and it's where most of the value is.

## What you get

### Code intelligence

- **Semantic + keyword search.** Ask in plain English ("where do we validate webhook signatures") or by symbol. Results are fused so you get the best of both.
- **Call graphs and call hierarchies.** Walk who-calls-what in either direction without opening a file.
- **Impact analysis.** Before you touch something, see everything downstream that depends on it.
- **Dead code detection.** Find symbols nothing references anymore.
- **Complexity scoring.** Real cyclomatic complexity, not a guess, so you know which functions are quietly turning into landmines.
- **Dependency graph.** Module and file relationships you can actually query.

### Engineering memory

This is the layer that learns your project and remembers it across sessions, across assistants, and across team members.

- **Decision memory.** Captures architectural choices with their rationale, alternatives, and tradeoffs. Ask "why was this chosen" and get the real answer instead of a shrug.
- **Failure memory.** Records what's been tried and didn't work. Ask "have we tried this" before burning a day re-running a doomed migration.
- **Ownership and expertise.** Resolves git authorship into people and ranks who actually knows a file or service by recent, weighted activity. Ask "who knows this code."
- **Knowledge freshness.** Memories decay. Confidence drops as things go stale and climbs again when reinforced or verified, so old facts don't masquerade as current truth.
- **Contradiction detection.** When two claims about the same thing disagree, both get flagged and their confidence drops. No more silently trusting outdated notes.
- **Intent tracking.** Record the goals you're working toward and retrieval leans toward what's relevant to them.
- **Decision timeline.** A chronological view of how a topic or file evolved: decisions, failures, and diffs in order.
- **Knowledge gap detection.** Ranks the risky parts of your codebase by complexity, weak ownership, missing documentation, and churn, so you know where the bus-factor problems are.
- **Architecture drift.** Declare your rules (layering, allowed and forbidden dependencies, naming) and get told the moment reality violates them.
- **Impact simulation.** Model a delete, rename, interface removal, or dependency removal and see the blast radius, the owners to notify, and the rules it would break, before you commit to it.

Memory is fed automatically from your git history, GitHub/GitLab (via API or signed webhooks), and your assistant's own actions. It's event-sourced and model-agnostic, so two different assistants pointed at the same project share the same brain.

### Dashboard

A clean web UI at `localhost:3001` to manage repositories, run searches, explore the graph, and browse the memory layer: decisions, the evolution timeline, architecture drift, knowledge gaps, and active goals. Plus live metrics on indexing, embeddings, storage, and MCP traffic.

## Run it

You'll need Docker. For semantic search you also need an embedding model. The simplest local option is Ollama.

```bash
ollama pull nomic-embed-text

docker run -d \
  --name context-simplo \
  --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  -v "$HOME":/host \
  -v context-simplo-data:/data \
  -e MOUNT_ROOT=/host \
  -e INITIAL_WORKSPACE=/host \
  -e AUTH_TOKEN="$(openssl rand -hex 32)" \
  -e AST_ENGINE=wasm \
  -e LLM_PROVIDER=ollama \
  -e LLM_BASE_URL=http://host.docker.internal:11434 \
  -e LLM_EMBEDDING_MODEL=nomic-embed-text \
  -e GRAPH_MEMORY_LIMIT_MB=4096 \
  -e LOG_LEVEL=info \
  ohopson/context-simplo:latest
```

On Linux, also add `--add-host=host.docker.internal:host-gateway`.

**Security note:** The server binds to `127.0.0.1` (loopback) by default outside containers for local-only access. Inside containers, it requires `AUTH_TOKEN` to be set before binding to `0.0.0.0`. The example above generates a secure random token. To expose the API over the network, bind to `0.0.0.0:3001:3001` and provide your own `AUTH_TOKEN`.

Once it's up:

- Dashboard: http://localhost:3001 (login with your AUTH_TOKEN)
- MCP endpoint: http://localhost:3001/mcp

**MCP Configuration:**

Add to your editor's MCP config (e.g., `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "context-simplo": {
      "url": "http://localhost:3001/mcp",
      "description": "Context-Simplo code intelligence",
      "headers": {
        "Authorization": "Bearer YOUR_AUTH_TOKEN_HERE"
      }
    }
  }
}
```

Replace `YOUR_AUTH_TOKEN_HERE` with the token you set in `AUTH_TOKEN`. If you used the random generator in the docker command above, retrieve it with:

```bash
docker exec context-simplo printenv AUTH_TOKEN
```

## Embedding options

Prefer OpenAI? Swap the `LLM_*` variables:

```bash
  -e LLM_PROVIDER=openai \
  -e LLM_API_KEY=sk-your-key \
  -e LLM_BASE_URL=https://api.openai.com/v1 \
  -e LLM_EMBEDDING_MODEL=text-embedding-3-small
```

Want no AI in the loop at all? Start it with `-e LLM_PROVIDER=none`. You lose semantic search, but everything structural (call graphs, impact analysis, dead code, complexity) and the decision, ownership, drift, and impact-simulation memory all still work without ever calling a model.

The engineering memory layer is on by default. Turn it off with `-e EML_ENABLED=false`.

## Tuning

Control resource usage with:

```bash
  -e PARSE_WORKER_POOL_SIZE=2     # Parse workers (set 0 to disable)
  -e INDEX_MAX_CONCURRENT_JOBS=1  # Concurrent indexing jobs  
  -e GRAPH_HOT_CACHE_MB=256       # Graph cache size
  -e WATCH_DRAIN_DELAY_MS=500     # Watch queue drain delay (milliseconds)
  -e WATCH_FULL_REINDEX_THRESHOLD=50  # File count threshold for full reindex
  -e WATCH_DEBOUNCE_MS=200        # File watcher debounce delay (milliseconds)
```

**Watch queue tuning:**
- `WATCH_DRAIN_DELAY_MS`: How long to accumulate file changes before processing (default: 500ms)
- `WATCH_FULL_REINDEX_THRESHOLD`: If more than this many files change at once, trigger a full reindex instead of incremental (default: 50)
- `WATCH_DEBOUNCE_MS`: Debounce delay for individual file changes (default: 200ms)

### AST Engine Selection

Context-Simplo v0.2.0 includes a multi-engine AST infrastructure for accurate call graphs and cyclomatic complexity across all 14 supported languages:

```bash
  -e AST_ENGINE=wasm      # Default: Web-tree-sitter WASM (recommended, zero native deps)
  -e AST_ENGINE=native    # Opt-in: Native tree-sitter (requires compilation, faster)
  -e AST_ENGINE=heuristic # Fallback: Regex-based (no dependencies, lower accuracy)
  -e AST_ENGINE=auto      # Auto-select: WASM → heuristic fallback
```

**Default:** `auto` mode uses WASM by default with automatic fallback to heuristic if grammars fail to load. 

**Native engine:** Opt-in only. Requires `tree-sitter@0.25.0` and native grammar packages compiled with node-gyp. Not included in the default Docker image. If native dependencies are unavailable, the system gracefully falls back to WASM or heuristic parsing without breaking startup.

**Languages supported:** TypeScript, TSX, JavaScript, JSX, Python, Rust, Go, Java, C, C++, C#, Ruby, PHP, Swift, Kotlin, Dart.

For container limits, use `docker run --memory=4g --cpus=4`.

## Good to know

- Mounting your home directory at `/host` lets you switch between projects from the dashboard without restarting the container.
- Your index and memory live in the `context-simplo-data` volume, so they survive restarts.
- 2GB of RAM handles most repos. Give it 4GB for the big ones.
- Indexing is incremental. Re-runs only touch what changed.

## License

MIT, see [LICENSE](LICENSE).

<!-- Performance test comment added at 12:47 PM to test auto-indexing speed -->
