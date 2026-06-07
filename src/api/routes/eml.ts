/**
 * Engineering Memory Layer REST routes.
 *
 * All EML HTTP surfaces mount under `/api/eml/*`. Errors flow through a single
 * mapper (`sendEmlError`) that uses the plan's error->status table; routes never
 * return 200-with-error. When EML is disabled every route returns 503.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { EmlError } from '../../core/errors.js';
import type { EmlServices } from '../../eml/mcp/handlers.js';
import {
  memoryRemember,
  memorySearch,
  whyWasThisChosen,
  haveWeTriedThis,
  toMemoryView,
} from '../../eml/mcp/handlers.js';

export interface EmlRouteOptions {
  eml?: EmlServices;
}

/**
 * Central EML error responder. Maps domain errors to their canonical HTTP
 * status and a stable `{ error: code, message }` body.
 */
export function sendEmlError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof EmlError) {
    if (error.code === 'vcs_rate_limited') {
      const retry = (error as { retryAfterSeconds?: number }).retryAfterSeconds;
      if (typeof retry === 'number') reply.header('Retry-After', String(retry));
    }
    return reply.code(error.httpStatus).send({ error: error.code, message: error.message });
  }
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'memory_invalid',
      message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
  }
  return reply.code(500).send({ error: 'internal_error', message: 'Unexpected error' });
}

export async function registerEmlRoutes(
  fastify: FastifyInstance,
  options: EmlRouteOptions
): Promise<void> {
  const getEml = (reply: FastifyReply): EmlServices | null => {
    if (!options.eml || !options.eml.enabled) {
      reply.code(503).send({ error: 'eml_disabled', message: 'Engineering Memory Layer is disabled' });
      return null;
    }
    return options.eml;
  };

  // Health: report worker/backlog. 503 when disabled.
  fastify.get('/api/eml/health', async (_request, reply) => {
    const eml = options.eml;
    if (!eml || !eml.enabled) {
      return reply.code(503).send({ ok: false, error: 'eml_disabled', backend: 'sqlite-native' });
    }
    const workerRunning = eml.eventBus ? eml.eventBus.isRunning() : true;
    const pendingEvents = eml.eventStore.countByStatus('pending');
    const ok = workerRunning;
    return reply.code(ok ? 200 : 503).send({
      ok,
      backend: 'sqlite-native',
      workerRunning,
      pendingEvents,
    });
  });

  // Assert a memory.
  fastify.post('/api/eml/memories', async (request, reply) => {
    const eml = getEml(reply);
    if (!eml) return reply;
    try {
      const result = await memoryRemember(request.body, eml);
      return reply
        .code(201)
        .header('Location', `/api/eml/memories/${result.id}`)
        .send({ id: result.id });
    } catch (error) {
      return sendEmlError(reply, error);
    }
  });

  // List memories by kind.
  fastify.get<{ Querystring: { repositoryId?: string; kind?: string; limit?: string } }>(
    '/api/eml/memories',
    async (request, reply) => {
      const eml = getEml(reply);
      if (!eml) return reply;
      const { repositoryId, kind } = request.query;
      if (!repositoryId || !/^[0-9a-f]{16}$/.test(repositoryId)) {
        return reply.code(400).send({ error: 'memory_invalid', message: 'repositoryId (16-hex) required' });
      }
      const limit = Math.min(Math.max(parseInt(request.query.limit ?? '50', 10) || 50, 1), 100);
      const kinds = ['decision', 'failure', 'intent', 'gap', 'ownership', 'note'] as const;
      const selected = kind && (kinds as readonly string[]).includes(kind)
        ? [kind as (typeof kinds)[number]]
        : [...kinds];
      const results = selected.flatMap((k) => eml.memoryRepo.listByKind(k, repositoryId, limit));
      return reply.send({ results: results.slice(0, limit).map((m) => toMemoryView(m)) });
    }
  );

  // Get a single memory + provenance.
  fastify.get<{ Params: { id: string } }>('/api/eml/memories/:id', async (request, reply) => {
    const eml = getEml(reply);
    if (!eml) return reply;
    const memory = eml.memoryRepo.find(request.params.id);
    if (!memory) {
      return reply.code(404).send({ error: 'memory_not_found', message: `Memory not found: ${request.params.id}` });
    }
    return reply.send({
      memory: { ...toMemoryView(memory), body: memory.body },
      provenance: eml.memoryRepo.listProvenance(memory.id),
    });
  });

  // Search memories.
  fastify.post('/api/eml/memories/search', async (request, reply) => {
    const eml = getEml(reply);
    if (!eml) return reply;
    try {
      const result = await memorySearch(request.body, eml);
      return reply.send(result);
    } catch (error) {
      return sendEmlError(reply, error);
    }
  });

  // Architectural decisions for a topic/entity (empty list, never 404).
  fastify.get<{ Querystring: { repositoryId?: string; topic?: string; entityRef?: string; limit?: string } }>(
    '/api/eml/decisions',
    async (request, reply) => {
      const eml = getEml(reply);
      if (!eml) return reply;
      try {
        const limit = Math.min(Math.max(parseInt(request.query.limit ?? '10', 10) || 10, 1), 50);
        const result = whyWasThisChosen(
          {
            repositoryId: request.query.repositoryId,
            topic: request.query.topic,
            entityRef: request.query.entityRef,
            limit,
          },
          eml
        );
        return reply.send(result);
      } catch (error) {
        return sendEmlError(reply, error);
      }
    }
  );

  // Similar past failures for an approach (empty list, never 404).
  fastify.get<{ Querystring: { repositoryId?: string; description?: string; limit?: string } }>(
    '/api/eml/failures',
    async (request, reply) => {
      const eml = getEml(reply);
      if (!eml) return reply;
      try {
        const limit = Math.min(Math.max(parseInt(request.query.limit ?? '10', 10) || 10, 1), 50);
        const result = await haveWeTriedThis(
          {
            repositoryId: request.query.repositoryId,
            description: request.query.description,
            limit,
          },
          eml
        );
        return reply.send(result);
      } catch (error) {
        return sendEmlError(reply, error);
      }
    }
  );
}
