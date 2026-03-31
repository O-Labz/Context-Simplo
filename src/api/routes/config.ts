/**
 * Configuration API Routes
 *
 * GET /api/config - Get current configuration (with env var locking indicators)
 * PUT /api/config - Update configuration (dashboard settings only)
 *
 * Security:
 * - Never returns API keys in plaintext (masked as '***')
 * - Env var-locked fields cannot be overridden
 * - All inputs validated with Zod
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { StorageProvider } from '../../store/provider.js';
import type { WebSocketBroadcaster } from '../websocket.js';
import { WebSocketEvents } from '../websocket.js';

const UpdateConfigSchema = z.object({
  llmProvider: z.enum(['openai', 'ollama', 'azure', 'none']).optional(),
  llmApiKey: z.string().optional(),
  llmBaseUrl: z.string().url().optional(),
  llmEmbeddingModel: z.string().optional(),
  autoIndex: z.boolean().optional(),
  watchEnabled: z.boolean().optional(),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).optional(),
});

export interface ConfigRouteOptions {
  storage: StorageProvider;
  broadcaster: WebSocketBroadcaster;
  embeddingProvider?: any;
}

/**
 * Register configuration routes
 */
export async function registerConfigRoutes(
  fastify: FastifyInstance,
  options: ConfigRouteOptions
): Promise<void> {
  /**
   * GET /api/config
   *
   * Returns current configuration with:
   * - Masked API keys (never plaintext)
   * - Locked field indicators (env var overrides)
   * - Current values from all sources
   */
  fastify.get('/api/config', async () => {
    const config = options.storage.getConfig();

    // Check which fields are locked by environment variables
    const envLocked = {
      llmProvider: !!process.env.LLM_PROVIDER,
      llmApiKey: !!process.env.LLM_API_KEY,
      llmBaseUrl: !!process.env.LLM_BASE_URL,
      llmEmbeddingModel: !!process.env.LLM_EMBEDDING_MODEL,
      autoIndex: !!process.env.CONTEXT_SIMPLO_AUTO_INDEX,
      watchEnabled: !!process.env.CONTEXT_SIMPLO_WATCH,
      logLevel: !!process.env.CONTEXT_SIMPLO_LOG_LEVEL,
    };

    // Mask API key if present
    const maskedConfig = {
      ...config,
      llmApiKey: config.llmApiKey ? '***' : undefined,
    };

    return {
      config: maskedConfig,
      envLocked,
      source: {
        llmProvider: envLocked.llmProvider ? 'env' : 'dashboard',
        llmApiKey: envLocked.llmApiKey ? 'env' : 'dashboard',
        llmBaseUrl: envLocked.llmBaseUrl ? 'env' : 'dashboard',
        llmEmbeddingModel: envLocked.llmEmbeddingModel ? 'env' : 'dashboard',
        autoIndex: envLocked.autoIndex ? 'env' : 'dashboard',
        watchEnabled: envLocked.watchEnabled ? 'env' : 'dashboard',
        logLevel: envLocked.logLevel ? 'env' : 'dashboard',
      },
    };
  });

  /**
   * PUT /api/config
   *
   * Updates configuration (dashboard settings only).
   * Env var-locked fields are ignored.
   *
   * Validation:
   * - llmProvider must be valid enum
   * - llmBaseUrl must be valid URL
   * - llmApiKey is never logged
   *
   * Side effects:
   * - Broadcasts config:changed event to WebSocket clients
   * - Persists to SQLite config table
   */
  fastify.put('/api/config', async (request, reply) => {
    let input: z.infer<typeof UpdateConfigSchema>;
    try {
      input = UpdateConfigSchema.parse(request.body);
    } catch (error) {
      return reply.status(400).send({
        error: 'Invalid request',
        message: error instanceof z.ZodError ? error.errors.map(e => e.message).join(', ') : 'Validation failed',
      });
    }

    // Filter out env-locked fields
    const updates: Record<string, unknown> = {};

    if (input.llmProvider && !process.env.LLM_PROVIDER) {
      updates.llmProvider = input.llmProvider;
    }

    if (input.llmApiKey && !process.env.LLM_API_KEY) {
      updates.llmApiKey = input.llmApiKey;
    }

    if (input.llmBaseUrl && !process.env.LLM_BASE_URL) {
      updates.llmBaseUrl = input.llmBaseUrl;
    }

    if (input.llmEmbeddingModel && !process.env.LLM_EMBEDDING_MODEL) {
      updates.llmEmbeddingModel = input.llmEmbeddingModel;
    }

    if (input.autoIndex !== undefined && !process.env.CONTEXT_SIMPLO_AUTO_INDEX) {
      updates.autoIndex = input.autoIndex;
    }

    if (input.watchEnabled !== undefined && !process.env.CONTEXT_SIMPLO_WATCH) {
      updates.watchEnabled = input.watchEnabled;
    }

    if (input.logLevel && !process.env.CONTEXT_SIMPLO_LOG_LEVEL) {
      updates.logLevel = input.logLevel;
    }

    // Update storage
    options.storage.updateConfig(updates);

    // Broadcast change event
    options.broadcaster.broadcast(WebSocketEvents.CONFIG_CHANGED, {
      fields: Object.keys(updates),
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      updated: Object.keys(updates),
      ignored: Object.keys(input).filter((key) => !(key in updates)),
    };
  });

  /**
   * POST /api/config/test-connection
   *
   * Tests LLM provider connectivity without saving config.
   * Used by setup wizard to validate settings before persisting.
   */
  fastify.post('/api/config/test-connection', async (request, reply) => {
    const testSchema = z.object({
      provider: z.enum(['openai', 'ollama', 'azure']),
      apiKey: z.string().optional(),
      baseUrl: z.string().url(),
      model: z.string().optional(),
    });

    let input: z.infer<typeof testSchema>;
    try {
      input = testSchema.parse(request.body);
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof z.ZodError ? error.errors.map(e => e.message).join(', ') : 'Validation failed',
      });
    }

    try {
      const { createEmbeddingProvider } = await import('../../llm/provider.js');
      
      const startTime = Date.now();
      const testProvider = await createEmbeddingProvider(input.provider, {
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
      });

      const healthy = await testProvider.healthCheck();
      const latency = Date.now() - startTime;

      if (!healthy) {
        return {
          success: false,
          error: 'Health check failed - provider is not responding correctly',
        };
      }

      // Test actual embedding generation
      try {
        await testProvider.embed(['test']);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to generate test embedding',
        };
      }

      return {
        success: true,
        provider: input.provider,
        model: testProvider.modelName(),
        dimensions: testProvider.dimensions(),
        latency,
        message: 'Connection successful',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  });
}
