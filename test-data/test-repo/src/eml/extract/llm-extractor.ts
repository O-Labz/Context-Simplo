/**
 * LLM extractor (JSON-constrained).
 *
 * Prompts a chat model for a strict JSON object matching `ExtractionResult`.
 * The raw text is parsed and Zod-validated; on invalid output we retry once,
 * then surface `ExtractionError`. The chat client is injected so the extractor
 * is fully unit-testable without network access.
 */

import { ExtractionError, LlmUnavailableError } from '../../core/errors.js';
import type { LLMProviderType } from '../../core/types.js';
import type { EmlEvent } from '../events/types.js';
import { extractDelta } from './candidate.js';
import { ExtractionResultSchema, type ExtractionResult } from './types.js';

/**
 * Minimal chat abstraction. Returns the model's raw text response, which is
 * expected to be a single JSON object.
 */
export interface ChatClient {
  completeJson(system: string, user: string): Promise<string>;
}

const SYSTEM_PROMPT = [
  'You are an engineering-memory extractor.',
  'Given a structural code/conversation delta, extract durable engineering facts:',
  'architectural decisions, failures, and intents.',
  'Respond with ONLY a JSON object of the form:',
  '{"memories":[{"kind":"decision|failure|intent|gap|ownership|note","title":string,"summary":string,"body":string,"confidence":number,"entityRefs":[{"kind":"file|symbol|dependency|service|pr|issue|person","ref":string}]}]}.',
  'Do not invent facts not supported by the delta. Use confidence in [0,1].',
].join(' ');

function buildUserPrompt(event: EmlEvent): string {
  const delta = extractDelta(event);
  return JSON.stringify({ eventType: event.type, repositoryId: event.repositoryId, delta }, null, 2);
}

function tryParse(raw: string): ExtractionResult | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    // Tolerate fenced output: pull the first {...} block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      json = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  const parsed = ExtractionResultSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export async function extract(
  event: EmlEvent,
  client: ChatClient,
  opts: { maxRetries?: number } = {}
): Promise<ExtractionResult> {
  const maxRetries = opts.maxRetries ?? 1;
  const user = buildUserPrompt(event);
  let lastRaw = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let raw: string;
    try {
      raw = await client.completeJson(SYSTEM_PROMPT, user);
    } catch (err) {
      throw new LlmUnavailableError(
        err instanceof Error ? err.message : 'chat completion failed',
        err instanceof Error ? err : undefined
      );
    }
    lastRaw = raw;
    const result = tryParse(raw);
    if (result) return result;
  }

  throw new ExtractionError(`model returned invalid JSON after ${maxRetries + 1} attempts: ${lastRaw.slice(0, 200)}`);
}

/**
 * Builds a real chat client from provider config. Only OpenAI-compatible and
 * Ollama endpoints are supported; returns null when no provider is configured.
 */
export function createChatClient(
  provider: LLMProviderType,
  config: { apiKey?: string; baseUrl?: string; model?: string }
): ChatClient | null {
  if (provider === 'none') return null;

  if (provider === 'openai' || provider === 'azure') {
    const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    const model = config.model ?? 'gpt-4o-mini';
    return {
      async completeJson(system: string, user: string): Promise<string> {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey ?? ''}`,
          },
          body: JSON.stringify({
            model,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenAI chat failed: ${res.status}`);
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return data.choices?.[0]?.message?.content ?? '';
      },
    };
  }

  if (provider === 'ollama') {
    const baseUrl = config.baseUrl ?? 'http://host.docker.internal:11434';
    const model = config.model ?? 'llama3.1';
    return {
      async completeJson(system: string, user: string): Promise<string> {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            format: 'json',
            stream: false,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
        if (!res.ok) throw new Error(`Ollama chat failed: ${res.status}`);
        const data = (await res.json()) as { message?: { content?: string } };
        return data.message?.content ?? '';
      },
    };
  }

  return null;
}
