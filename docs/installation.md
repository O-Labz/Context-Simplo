# Installation Guide

Context-Simplo runs in Docker. Choose an embedding provider below.

## Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine (Linux)
- 2GB RAM minimum, 4GB recommended
- 500MB disk space for image + data

## Option 1: Local AI (Ollama) - Recommended for Privacy

**Step 1: Install Ollama and pull the model**

```bash
ollama pull nomic-embed-text
```

**Step 2: Pull the Context-Simplo image**

```bash
docker pull ohopson/context-simplo:latest
```

**Step 3: Start the container**

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

## Option 2: Cloud AI (OpenAI)

**Step 1: Pull the image**

```bash
docker pull ohopson/context-simplo:latest
```

**Step 2: Start the container with your API key**

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

## Option 3: No AI (Structural Tools Only)

Skip embeddings entirely. Semantic search won't work, but all structural tools (call hierarchies, impact analysis, dead code detection, etc.) still work.

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

## After Installation

**Step 1: Open the dashboard**

```bash
open http://localhost:3001
```

**Step 2: Configure your IDE**

Follow the [MCP Setup Guide](mcp-setup.md) to connect your IDE (Cursor, VS Code, Claude Desktop, or Claude Code) to Context-Simplo.

**Step 3: Index your first repository**

From the dashboard:
1. Click "Repositories" in the sidebar
2. Click "Browse" to navigate to your project directory
3. Select the project folder
4. Click "Index Repository"

Or use the MCP tool from your IDE:

```
Tool: index_repository
Args: { "path": "/host/projects/my-app" }
```

Note: Use container paths (`/host/...`) when indexing via MCP tools.

## Verify Everything Works

**Check container status:**

```bash
docker ps | grep context-simplo
```

**Check logs:**

```bash
docker logs context-simplo
```

**Test MCP connection from your IDE:**

```
Tool: list_repositories
```

Expected response shows your indexed repositories with file counts and node counts.

## Troubleshooting

### Container won't start

Check logs:

```bash
docker logs context-simplo
```

Common issues:
- Port 3001 already in use: Stop other services or change port with `-p 3002:3001`
- Volume mount failed: Ensure Docker has permission to access your home directory

### Cannot connect to Ollama

Verify `host.docker.internal` resolves:

```bash
docker exec context-simplo ping -c 1 host.docker.internal
```

Linux users: Ensure you used `--add-host=host.docker.internal:host-gateway` in the docker run command.

Verify Ollama is running:

```bash
curl http://localhost:11434/api/tags
```

### Dashboard not loading

Check if the container is running:

```bash
docker ps | grep context-simplo
```

Try restarting:

```bash
docker restart context-simplo
```

### Cannot see my project files

Make sure you're using container paths (`/host/...`) not host paths when indexing.

Check the Browse tab in the dashboard to see the container filesystem.

### Performance is slow

Increase Docker memory allocation:
- Docker Desktop: Settings → Resources → Memory (increase to 4GB+)

For large repositories, indexing may take time on first run. Subsequent updates are incremental and fast (<500ms per file).

## Container Management

**Stop the container:**

```bash
docker stop context-simplo
```

**Start the container:**

```bash
docker start context-simplo
```

**Remove the container:**

```bash
docker stop context-simplo
docker rm context-simplo
```

**Update to latest version:**

```bash
docker stop context-simplo
docker rm context-simplo
docker pull ohopson/context-simplo:latest
# Then run the docker run command again
```

**View logs:**

```bash
docker logs -f context-simplo
```

## Next Steps

- [MCP Setup Guide](mcp-setup.md) - Connect your IDE
- [Configuration Reference](configuration.md) - Environment variables and settings
- [MCP Tools Reference](mcp-tools.md) - Available tools and usage
- [Architecture Overview](architecture.md) - How it works
