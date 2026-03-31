/**
 * API Routes Integration Tests
 *
 * Tests all API endpoints with real Fastify server.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { rmSync, mkdirSync } from 'fs';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { CodeGraph } from '../../src/core/graph.js';
import { createAPIServer } from '../../src/api/server.js';

const TEST_WORKSPACE = resolve(__dirname, '../fixtures/api-test');
const TEST_DB = resolve(TEST_WORKSPACE, 'test.db');
const TEST_DASHBOARD = resolve(__dirname, '../fixtures/dashboard-mock');
const TEST_TEMPLATES = resolve(__dirname, '../../templates');

describe('API Routes Integration', () => {
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
      serverPort: 3001,
    });
  });

  afterAll(async () => {
    await server.fastify.close();
    storage.close();
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  });

  describe('Health Endpoint', () => {
    it('should return healthy status', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeGreaterThan(0);
      expect(body.websocketClients).toBe(0);
    });
  });

  describe('Config Routes', () => {
    it('should get current config', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.config).toBeDefined();
      expect(body.envLocked).toBeDefined();
      expect(body.source).toBeDefined();
    });

    it('should update config', async () => {
      const response = await server.fastify.inject({
        method: 'PUT',
        url: '/api/config',
        payload: {
          llmProvider: 'ollama',
          llmBaseUrl: 'http://localhost:11434',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.updated).toContain('llmProvider');
    });

    it('should reject invalid config', async () => {
      const response = await server.fastify.inject({
        method: 'PUT',
        url: '/api/config',
        payload: {
          llmProvider: 'invalid-provider',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Repository Routes', () => {
    it('should list repositories', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/repositories',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.repositories).toBeInstanceOf(Array);
      expect(body.total).toBeDefined();
    });

    it('should reject path traversal in index request', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/repositories',
        payload: {
          path: '../../../etc/passwd',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('traversal');
    });
  });

  describe('Search Routes', () => {
    it('should handle search request', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          mode: 'exact',
          limit: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.query).toBe('test');
      expect(body.mode).toBe('exact');
      expect(body.results).toBeInstanceOf(Array);
    });

    it('should reject invalid search mode', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          mode: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should enforce query length limit', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'a'.repeat(501),
          mode: 'exact',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Graph Routes', () => {
    it('should return graph data', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/graph/test-repo',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.nodes).toBeInstanceOf(Array);
      expect(body.edges).toBeInstanceOf(Array);
      expect(body.total).toBeDefined();
    });

    it('should respect maxNodes limit', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/graph/test-repo?maxNodes=10',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.nodes.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Metrics Routes', () => {
    it('should return metrics', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/metrics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.system).toBeDefined();
      expect(body.memory).toBeDefined();
      expect(body.index).toBeDefined();
      expect(body.storage).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('MCP Config Routes', () => {
    it('should generate Cursor config', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/mcp-config/cursor',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ide).toBe('cursor');
      expect(body.config).toBeDefined();
      expect(body.config.mcpServers['context-simplo'].url).toContain('localhost:3001');
      expect(body.configPath).toBe('.cursor/mcp.json');
      expect(body.instructions).toBeDefined();
    });

    it('should generate VS Code config', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/mcp-config/vscode',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ide).toBe('vscode');
      expect(body.config.servers['context-simplo'].url).toContain('localhost:3001');
    });

    it('should reject invalid IDE', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/mcp-config/invalid-ide',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid IDE');
    });

    it('should return all configs', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/mcp-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.configs).toBeInstanceOf(Array);
      expect(body.configs.length).toBe(4);
    });
  });
});
