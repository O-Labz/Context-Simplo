/**
 * Configuration Hot Reload Integration Tests
 *
 * Tests end-to-end hot reload functionality including:
 * - Provider switching (Ollama → OpenAI → None)
 * - Queue settings updates
 * - WebSocket event broadcasting
 * - Service availability during reload
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { resolve } from 'path';
import { rmSync, mkdirSync } from 'fs';
import WebSocket from 'ws';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { CodeGraph } from '../../src/core/graph.js';
import { ConfigManager } from '../../src/core/config-manager.js';
import { createAPIServer } from '../../src/api/server.js';
import { WebSocketEvents } from '../../src/api/websocket.js';

const TEST_WORKSPACE = resolve(__dirname, '../fixtures/hot-reload-test');
const TEST_DB = resolve(TEST_WORKSPACE, 'test.db');
const TEST_DASHBOARD = resolve(__dirname, '../fixtures/dashboard-mock');
const TEST_TEMPLATES = resolve(__dirname, '../../templates');
const TEST_PORT = 3456;

describe('Configuration Hot Reload Integration', () => {
  let storage: SqliteStorageProvider;
  let graph: CodeGraph;
  let configManager: ConfigManager;
  let server: Awaited<ReturnType<typeof createAPIServer>>;

  beforeAll(async () => {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
    mkdirSync(TEST_WORKSPACE, { recursive: true });

    storage = new SqliteStorageProvider(TEST_DB);
    await storage.initialize();

    graph = new CodeGraph(512);

    configManager = new ConfigManager({
      storage,
    });

    server = await createAPIServer({
      storage,
      graph,
      dashboardPath: TEST_DASHBOARD,
      workspaceRoot: TEST_WORKSPACE,
      templatesPath: TEST_TEMPLATES,
      serverHost: 'localhost',
      serverPort: TEST_PORT,
      configManager,
    });

    await server.fastify.listen({ port: TEST_PORT, host: 'localhost' });
  });

  afterAll(async () => {
    await server.fastify.close();
    storage.close();
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  });

  beforeEach(() => {
    storage.updateConfig({
      llmProvider: 'none',
      llmBaseUrl: 'http://localhost:11434',
      llmEmbeddingModel: 'nomic-embed-text',
      embeddingConcurrency: 5,
      embeddingBatchSize: 20,
    });
  });

  it('should update config via API endpoint', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llmProvider: 'none',
        embeddingConcurrency: 10,
      }),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.updated).toContain('embeddingConcurrency');
  });

  it('should broadcast WebSocket events during reload', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
      const events: string[] = [];

      ws.on('open', async () => {
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            events.push(message.type);

            if (message.type === WebSocketEvents.CONFIG_RELOAD_COMPLETE) {
              expect(events).toContain(WebSocketEvents.CONFIG_CHANGED);
              expect(events).toContain(WebSocketEvents.CONFIG_RELOADING);
              ws.close();
              resolve();
            }

            if (message.type === WebSocketEvents.CONFIG_RELOAD_ERROR) {
              ws.close();
              reject(new Error(`Reload failed: ${message.payload.error}`));
            }
          } catch (err) {
            ws.close();
            reject(err);
          }
        });

        await fetch(`http://localhost:${TEST_PORT}/api/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeddingConcurrency: 8,
          }),
        });
      });

      ws.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        ws.close();
        reject(new Error('Test timeout'));
      }, 5000);
    });
  });

  it('should handle concurrent config updates', async () => {
    const promises = [
      fetch(`http://localhost:${TEST_PORT}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeddingConcurrency: 10 }),
      }),
      fetch(`http://localhost:${TEST_PORT}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeddingBatchSize: 30 }),
      }),
    ];

    const responses = await Promise.all(promises);
    const results = await Promise.all(responses.map(r => r.json()));

    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBeGreaterThan(0);
  });

  it('should maintain config after reload', async () => {
    await fetch(`http://localhost:${TEST_PORT}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeddingConcurrency: 15,
        embeddingBatchSize: 25,
      }),
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    const response = await fetch(`http://localhost:${TEST_PORT}/api/config`);
    const data = await response.json();

    expect(data.config.embeddingConcurrency).toBe(15);
    expect(data.config.embeddingBatchSize).toBe(25);
  });

  it('should respect environment variable locks', async () => {
    process.env.LLM_PROVIDER = 'ollama';

    const response = await fetch(`http://localhost:${TEST_PORT}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llmProvider: 'openai',
      }),
    });

    const result = await response.json();
    expect(result.ignored).toContain('llmProvider');

    delete process.env.LLM_PROVIDER;
  });

  it('should handle invalid config gracefully', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llmBaseUrl: 'not-a-valid-url',
      }),
    });

    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error).toBeDefined();
  });
});
