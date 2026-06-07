# Context-Simplo

Context-Simplo indexes your codebase into a graph + vector database and hands that intelligence to AI coding assistants over MCP. Instead of letting the assistant grep around file by file, it can ask Context-Simplo directly for things like call graphs, impact analysis, dead-code checks, and semantic search.

It runs as a single Docker container.

## Run it

You'll need Docker. For semantic search you also need an embedding model - the simplest local option is Ollama.

```bash
ollama pull nomic-embed-text

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

On Linux, also add `--add-host=host.docker.internal:host-gateway`.

Once it's up:

- Dashboard: http://localhost:3001
- Point your editor's MCP config at http://localhost:3001/mcp

## Embedding options

Rather use OpenAI? Swap the `LLM_*` variables:

```bash
  -e LLM_PROVIDER=openai \
  -e LLM_API_KEY=sk-your-key \
  -e LLM_BASE_URL=https://api.openai.com/v1 \
  -e LLM_EMBEDDING_MODEL=text-embedding-3-small
```

Don't want any AI involved? Start it with `-e LLM_PROVIDER=none`. You lose semantic search, but the structural tools (call graphs, impact analysis, dead code, complexity) all still work.

## Good to know

- Mounting your home directory at `/host` lets you switch between projects from the dashboard without restarting the container.
- Your index lives in the `context-simplo-data` volume, so it sticks around across restarts.
- 2GB of RAM handles most repos; give it 4GB for the big ones.

## License

MIT - see [LICENSE](LICENSE).
