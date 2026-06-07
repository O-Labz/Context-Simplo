/**
 * Extraction resolver + orchestrator.
 *
 * Takes an `ExtractionResult` and reconciles it with existing memory:
 *  - exact title match within the same kind/repo  -> reinforce (bump source
 *    count, refresh verification time, nudge confidence, add provenance)
 *  - otherwise                                    -> create + embed + link
 *
 * `processEventForExtraction` is the single entry point wired to the EventBus:
 * it runs the candidate gate, picks the LLM or fallback path per config, and
 * records an `extraction.completed` event.
 */

import { randomUUID } from 'crypto';
import { LlmUnavailableError } from '../../core/errors.js';
import type { EmlEvent } from '../events/types.js';
import type { EmlServices } from '../mcp/handlers.js';
import type { MemoryObject, ProvenanceInput } from '../store/memory-repo.js';
import { detect } from './candidate.js';
import { extract as llmExtract, type ChatClient } from './llm-extractor.js';
import { extract as fallbackExtract } from './fallback-extractor.js';
import type { ExtractionResult } from './types.js';

export interface ResolveSummary {
  created: string[];
  reinforced: string[];
}

const CONFIDENCE_REINFORCE_STEP = 0.1;

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function provenanceSource(event: EmlEvent): ProvenanceInput['sourceType'] {
  switch (event.type) {
    case 'conversation.ingested':
      return 'conversation';
    case 'vcs.pr.observed':
      return 'pr';
    case 'vcs.issue.observed':
      return 'issue';
    default:
      return 'structural_delta';
  }
}

async function embedAndLink(memory: MemoryObject, eml: EmlServices): Promise<void> {
  if (eml.embedQuery && eml.memoryVectors) {
    try {
      const text = [memory.title, memory.summary, memory.body].filter(Boolean).join('\n');
      const vector = await eml.embedQuery(text);
      if (vector && vector.length > 0) {
        const embeddingId = `emb_${randomUUID()}`;
        await eml.memoryVectors.upsert([
          { id: embeddingId, memoryId: memory.id, repositoryId: memory.repositoryId, kind: memory.kind, vector },
        ]);
        eml.memoryRepo.update(memory.id, { embeddingId });
      }
    } catch {
      // best-effort embedding
    }
  }
}

export async function resolveExtraction(
  event: EmlEvent,
  result: ExtractionResult,
  eml: EmlServices
): Promise<ResolveSummary> {
  const summary: ResolveSummary = { created: [], reinforced: [] };
  const sourceType = provenanceSource(event);

  for (const extracted of result.memories) {
    const existingList = eml.memoryRepo.listByKind(extracted.kind, event.repositoryId, 200);
    const match = existingList.find((m) => normalizeTitle(m.title) === normalizeTitle(extracted.title));

    if (match) {
      eml.memoryRepo.update(match.id, {
        sourceCount: match.sourceCount + 1,
        lastVerifiedAt: eml.now().toISOString(),
        confidence: Math.min(1, match.confidence + CONFIDENCE_REINFORCE_STEP),
      });
      eml.memoryRepo.addProvenance({
        memoryId: match.id,
        eventId: event.id,
        sourceType,
        sourceRef: event.sourceRef,
        weight: 1,
        verifiedAgainstDiff: sourceType === 'structural_delta',
      });
      summary.reinforced.push(match.id);
      continue;
    }

    const memory = eml.memoryRepo.create({
      kind: extracted.kind,
      title: extracted.title,
      summary: extracted.summary,
      body: extracted.body,
      repositoryId: event.repositoryId,
      confidence: extracted.confidence,
      lastVerifiedAt: eml.now().toISOString(),
    });

    eml.memoryRepo.addProvenance({
      memoryId: memory.id,
      eventId: event.id,
      sourceType,
      sourceRef: event.sourceRef,
      weight: 1,
      verifiedAgainstDiff: sourceType === 'structural_delta',
    });

    if (extracted.entityRefs.length > 0) {
      const stmt = eml.db.prepare(
        `INSERT OR IGNORE INTO entity_links (memory_id, target_kind, target_ref) VALUES (?, ?, ?)`
      );
      for (const e of extracted.entityRefs) stmt.run(memory.id, e.kind, e.ref);
    }

    if (memory.kind === 'decision' && eml.decisions) {
      eml.decisions.fromMemory(memory, {
        affectedSystems: extracted.entityRefs.map((e) => e.ref),
      });
    }

    if (memory.kind === 'failure' && eml.failures) {
      eml.failures.fromMemory(memory);
    }

    await embedAndLink(memory, eml);
    summary.created.push(memory.id);
  }

  return summary;
}

export async function processEventForExtraction(
  event: EmlEvent,
  eml: EmlServices,
  opts: { chatClient?: ChatClient | null } = {}
): Promise<ResolveSummary | null> {
  if (eml.extraction === 'off') return null;

  const candidate = detect(event);
  if (!candidate.likely) return null;

  let result: ExtractionResult;
  if (eml.extraction === 'llm') {
    if (!opts.chatClient) {
      throw new LlmUnavailableError('EML_EXTRACTION=llm but no chat provider is configured');
    }
    result = await llmExtract(event, opts.chatClient);
  } else {
    result = fallbackExtract(event);
  }

  const summary = await resolveExtraction(event, result, eml);

  eml.eventStore.append({
    type: 'extraction.completed',
    source: 'engine',
    sourceRef: event.id,
    repositoryId: event.repositoryId,
    payload: {
      sourceEventId: event.id,
      signals: candidate.signals,
      created: summary.created,
      reinforced: summary.reinforced,
    },
    occurredAt: eml.now().toISOString(),
  });

  return summary;
}
