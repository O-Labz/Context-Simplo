/**
 * Integration tests for authentication middleware
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAPIServer } from '../../src/api/server.js';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { CodeGraph } from '../../src/core/graph.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rmSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_WORKSPACE = resolve(__dirname, '../fixtures/auth-test');
const TEST_DB_WITH_AUTH = resolve(TEST_WORKSPACE, 'test-with-auth.db');
const TEST_DB_WITHOUT_AUTH = resolve(TEST_WORKSPACE, 'test-without-auth.db');
const TEST_DASHBOARD = resolve(__dirname, '../fixtures/dashboard-mock');
const TEST_TEMPLATES = resolve(__dirname, '../../templates');

describe('Authentication Middleware', () => {
  const TEST_TOKEN = 'test-secret-token-12345';
  let storageWithAuth: SqliteStorageProvider;
  let storageWithoutAuth: SqliteStorageProvider;
  let graphWithAuth: CodeGraph;
  let graphWithoutAuth: CodeGraph;
  let server: any;
  let serverWithoutAuth: any;

  beforeAll(async () => {
    // Setup test environment
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
    mkdirSync(TEST_WORKSPACE, { recursive: true });
    mkdirSync(TEST_DASHBOARD, { recursive: true });

    // Initialize storage and graph for auth server
    storageWithAuth = new SqliteStorageProvider(TEST_DB_WITH_AUTH);
    await storageWithAuth.initialize();
    graphWithAuth = new CodeGraph();

    // Initialize storage and graph for non-auth server
    storageWithoutAuth = new SqliteStorageProvider(TEST_DB_WITHOUT_AUTH);
    await storageWithoutAuth.initialize();
    graphWithoutAuth = new CodeGraph();
    
    // Server with auth enabled
    server = await createAPIServer({
      storage: storageWithAuth,
      graph: graphWithAuth,
      dashboardPath: TEST_DASHBOARD,
      workspaceRoot: TEST_WORKSPACE,
      templatesPath: TEST_TEMPLATES,
      authToken: TEST_TOKEN,
    });
    
    // Server without auth
    serverWithoutAuth = await createAPIServer({
      storage: storageWithoutAuth,
      graph: graphWithoutAuth,
      dashboardPath: TEST_DASHBOARD,
      workspaceRoot: TEST_WORKSPACE,
      templatesPath: TEST_TEMPLATES,
    });
  });

  afterAll(async () => {
    await server.fastify.close();
    await serverWithoutAuth.fastify.close();
    storageWithAuth.close();
    storageWithoutAuth.close();
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
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
