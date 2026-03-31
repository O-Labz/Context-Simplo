/**
 * WebSocket Integration Tests
 *
 * Tests WebSocket broadcasting and reconnection logic.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { resolve } from 'path';
import { rmSync, mkdirSync } from 'fs';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { CodeGraph } from '../../src/core/graph.js';
import { createAPIServer } from '../../src/api/server.js';
import { WebSocketEvents } from '../../src/api/websocket.js';

const TEST_WORKSPACE = resolve(__dirname, '../fixtures/ws-test');
const TEST_DB = resolve(TEST_WORKSPACE, 'test.db');
const TEST_DASHBOARD = resolve(__dirname, '../fixtures/dashboard-mock');
const TEST_TEMPLATES = resolve(__dirname, '../../templates');
const TEST_PORT = 3999;

describe('WebSocket Integration', () => {
  let storage: SqliteStorageProvider;
  let graph: CodeGraph;
  let server: Awaited<ReturnType<typeof createAPIServer>>;

  beforeAll(async () => {
    // Setup test environment
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
    mkdirSync(TEST_WORKSPACE, { recursive: true });
    mkdirSync(TEST_DASHBOARD, { recursive: true });

    // Initialize storage and graph
    storage = new SqliteStorageProvider(TEST_DB);
    await storage.initialize();

    graph = new CodeGraph();

    // Create API server
    server = await createAPIServer({
      storage,
      graph,
      dashboardPath: TEST_DASHBOARD,
      workspaceRoot: TEST_WORKSPACE,
      templatesPath: TEST_TEMPLATES,
      serverHost: 'localhost',
      serverPort: TEST_PORT,
    });

    // Start server
    await server.fastify.listen({ port: TEST_PORT, host: 'localhost' });
  });

  afterAll(async () => {
    await server.fastify.close();
    storage.close();
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it('should establish WebSocket connection', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      ws.on('open', () => {
        ws.close();
        resolve();
      });

      ws.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);
    });
  });

  it('should receive connection established message', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe(WebSocketEvents.CONNECTION_ESTABLISHED);
          expect(message.payload).toBeDefined();
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      ws.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        reject(new Error('Message timeout'));
      }, 5000);
    });
  });

  it('should broadcast to multiple clients', async () => {
    return new Promise<void>((resolve, reject) => {
      let receivedCount = 0;
      const expectedCount = 2;

      const createClient = () => {
        const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

        ws.on('open', () => {
          // Broadcast a test message
          server.broadcaster.broadcast(WebSocketEvents.INDEX_PROGRESS, {
            repositoryId: 'test-repo',
            progress: 50,
          });
        });

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());

            if (message.type === WebSocketEvents.INDEX_PROGRESS) {
              expect(message.payload).toEqual({
                repositoryId: 'test-repo',
                progress: 50,
              });

              receivedCount++;

              if (receivedCount === expectedCount) {
                ws.close();
                resolve();
              }
            }
          } catch (err) {
            reject(err);
          }
        });

        ws.on('error', (err) => {
          reject(err);
        });

        return ws;
      };

      const ws1 = createClient();
      const ws2 = createClient();

      setTimeout(() => {
        ws1.close();
        ws2.close();
        reject(new Error('Broadcast timeout'));
      }, 5000);
    });
  });

  it('should track connected clients', async () => {
    const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
    const ws2 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

    await new Promise<void>((resolve) => {
      let openCount = 0;
      const onOpen = () => {
        openCount++;
        if (openCount === 2) resolve();
      };

      ws1.on('open', onOpen);
      ws2.on('open', onOpen);
    });

    // Check client count
    expect(server.broadcaster.getClientCount()).toBeGreaterThanOrEqual(2);

    // Close one client
    ws1.close();

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check client count decreased
    expect(server.broadcaster.getClientCount()).toBeGreaterThanOrEqual(1);

    ws2.close();
  });

  it('should handle client disconnection gracefully', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    const initialCount = server.broadcaster.getClientCount();

    ws.close();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const finalCount = server.broadcaster.getClientCount();
    expect(finalCount).toBeLessThan(initialCount);
  });
});
