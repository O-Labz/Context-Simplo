# Contributing to Context-Simplo

Thank you for your interest in contributing to Context-Simplo!

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for testing containerized deployment)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/your-org/context-simplo.git
cd context-simplo

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Run in development mode
pnpm dev
```

## Project Structure

```
Context-Simplo/
├── src/
│   ├── core/          # Core logic: parser, graph, indexer, config
│   ├── store/         # Storage layer: SQLite, migrations
│   ├── search/        # Search engines: BM25, vector, hybrid
│   ├── llm/           # LLM providers: OpenAI, Ollama
│   ├── mcp/           # MCP server and tool handlers
│   ├── security/      # Secret scrubbing, .contextignore
│   ├── api/           # Fastify REST API and WebSocket
│   └── cli/           # CLI commands
├── dashboard/         # React web dashboard
├── tests/             # Unit and integration tests
└── templates/         # MCP config templates
```

## Code Quality Standards

This project follows strict production-grade standards:

- **TypeScript strict mode** - No `any` types allowed
- **Zod validation** - All external inputs validated
- **Error handling** - Explicit error handling at all I/O boundaries
- **Testing** - 80%+ coverage target
- **Documentation** - Every module has a header comment explaining inputs, outputs, constraints, assumptions, and failure cases

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

### Test Categories

- **Unit tests** (`tests/unit/`): Test individual modules in isolation
- **Integration tests** (`tests/integration/`): Test full pipelines and API endpoints
- **Fixtures** (`tests/fixtures/`): Sample code in multiple languages for testing

## API Development

### Adding New API Routes

1. Create route file in `src/api/routes/`
2. Export registration function:

```typescript
export async function registerMyRoutes(
  fastify: FastifyInstance,
  options: MyRouteOptions
): Promise<void> {
  // Define routes
}
```

3. Register in `src/api/server.ts`
4. Add integration tests in `tests/integration/api-routes.test.ts`

### WebSocket Events

To broadcast events to dashboard clients:

```typescript
import { WebSocketEvents } from './websocket.js';

broadcaster.broadcast(WebSocketEvents.INDEX_PROGRESS, {
  repositoryId: 'repo-123',
  progress: 50,
});
```

Available events: `INDEX_PROGRESS`, `INDEX_COMPLETE`, `INDEX_ERROR`, `WATCHER_CHANGE`, `EMBEDDING_PROGRESS`, `HEALTH_UPDATE`, `CONFIG_CHANGED`

## Dashboard Development

Dashboard is a React SPA in `dashboard/` directory.

```bash
cd dashboard
pnpm install
pnpm dev
```

### Using WebSocket Hook

```typescript
import { useWebSocket } from '../hooks/useWebSocket';

function MyComponent() {
  const { connected, subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe('index:progress', (data) => {
      console.log('Progress:', data);
    });
    return unsubscribe;
  }, [subscribe]);

  return <div>Connected: {connected ? 'Yes' : 'No'}</div>;
}
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`pnpm test && pnpm lint`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Include tests for new functionality
- Update documentation as needed
- Follow the existing code style
- Ensure all tests pass
- Add a clear description of the changes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
