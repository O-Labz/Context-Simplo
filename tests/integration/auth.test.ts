/**
 * Integration tests for authentication middleware
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAPIServer } from '../../src/api/server.js';
import { InMemoryStorage } from '../../src/store/memory.js';
import { InMemoryGraph } from '../../src/core/graph-mem.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Authentication Middleware', () => {
  const TEST_TOKEN = 'test-secret-token-12345';
  let server: any;
  let serverWithoutAuth: any;

  beforeAll(async () => {
    const storage = new InMemoryStorage();
    const graph = new InMemoryGraph();
    
    // Server with auth enabled
    server = await createAPIServer({
      storage,
      graph,
      dashboardPath: resolve(__dirname, '../../dashboard/dist'),
      workspaceRoot: '/tmp/test',
      templatesPath: resolve(__dirname, '../../templates'),
      authToken: TEST_TOKEN,
    });
    
    // Server without auth
    serverWithoutAuth = await createAPIServer({
      storage,
      graph,
      dashboardPath: resolve(__dirname, '../../dashboard/dist'),
      workspaceRoot: '/tmp/test',
      templatesPath: resolve(__dirname, '../../templates'),
    });
  });

  afterAll(async () => {
    await server.fastify.close();
    await serverWithoutAuth.fastify.close();
  });

  it('should return 401 on /api/repositories without token', async () => {
    const response = await server.fastify.inject({
      method: 'GET',
      url: '/api/repositories',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
  });

  it('should return 200 with correct bearer token', async () => {
    const response = await server.fastify.inject({
      method: 'GET',
      url: '/api/repositories',
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should return 401 with incorrect bearer token', async () => {
    const response = await server.fastify.inject({
      method: 'GET',
      url: '/api/repositories',
      headers: {
        authorization: 'Bearer wrong-token',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should allow /api/health without token', async () => {
    const response = await server.fastify.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
  });

  it('should protect /mcp endpoint', async () => {
    const response = await server.fastify.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', method: 'test', id: 1 },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should allow /mcp with token', async () => {
    const response = await server.fastify.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
      },
      payload: { jsonrpc: '2.0', method: 'test', id: 1 },
    });

    // Should not be 401 (may be other error due to invalid payload, but auth passed)
    expect(response.statusCode).not.toBe(401);
  });

  it('should allow access without token when auth is not configured', async () => {
    const response = await serverWithoutAuth.fastify.inject({
      method: 'GET',
      url: '/api/repositories',
    });

    expect(response.statusCode).toBe(200);
  });

  it('should accept token via query parameter for WebSocket', async () => {
    const response = await server.fastify.inject({
      method: 'GET',
      url: `/api/repositories?token=${TEST_TOKEN}`,
    });

    expect(response.statusCode).toBe(200);
  });

  it('should reject invalid query token', async () => {
    const response = await server.fastify.inject({
      method: 'GET',
      url: '/api/repositories?token=wrong-token',
    });

    expect(response.statusCode).toBe(401);
  });
});
