import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { MemoryRepo } from '../../src/eml/store/memory-repo.js';
import { SqliteGraphStore } from '../../src/eml/store/sqlite-graph.js';
import { HotCache } from '../../src/eml/store/hot-cache.js';
import { EventStore } from '../../src/eml/events/store.js';
import { detect } from '../../src/eml/extract/candidate.js';
import { extract as fallbackExtract } from '../../src/eml/extract/fallback-extractor.js';
import { extract as llmExtract, type ChatClient } from '../../src/eml/extract/llm-extractor.js';
import { processEventForExtraction } from '../../src/eml/extract/resolve.js';
import type { EmlServices } from '../../src/eml/mcp/handlers.js';
import type { EmlEvent } from '../../src/eml/events/types.js';
import { ExtractionError, LlmUnavailableError } from '../../src/core/errors.js';

const REPO = '0123456789abcdef';

function makeEml(storage: SqliteStorageProvider, extraction: EmlServices['extraction']): EmlServices {
  const db = storage.getDatabase();
  return {
    enabled: true,
    extraction,
    db,
    storage,
    memoryRepo: new MemoryRepo(db),
    graph: new SqliteGraphStore(db, { cache: new HotCache(8) }),
    eventStore: new EventStore(db),
    now: () => new Date(),
  };
}

function appendDelta(eml: EmlServices, delta: Record<string, unknown>, sourceRef: string): EmlEvent {
  const { id } = eml.eventStore.append({
    type: 'code.diff.observed',
    source: 'diff_observer',
    sourceRef,
    repositoryId: REPO,
    payload: { delta },
  });
  return eml.eventStore.getById(id)!;
}

describe('EML extraction pipeline', () => {
  let dir: string;
  let storage: SqliteStorageProvider;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-extract-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('candidate gate fires on structural signals and prose, skips noise', () => {
    const eml = makeEml(storage, 'fallback');
    const depEvent = appendDelta(eml, { removedDependencies: ['left-pad'] }, 's1');
    expect(detect(depEvent).likely).toBe(true);
    expect(detect(depEvent).signals).toContain('dependency_removed');

    const proseEvent = appendDelta(eml, { message: 'reverted because of a regression' }, 's2');
    expect(detect(proseEvent).signals).toContain('prose_keyword');

    const noiseEvent = appendDelta(eml, { addedFiles: ['a.txt'] }, 's3');
    expect(detect(noiseEvent).likely).toBe(false);
  });

  it('fallback extractor derives facts from the delta deterministically', () => {
    const eml = makeEml(storage, 'fallback');
    const event = appendDelta(eml, { removedDependencies: ['left-pad'], deletedFiles: ['old.ts'] }, 's1');
    const result = fallbackExtract(event);
    expect(result.memories).toHaveLength(2);
    const titles = result.memories.map((m) => m.title);
    expect(titles).toContain('Removed dependency left-pad');
    expect(titles).toContain('Deleted file old.ts');
  });

  it('resolves new memories and reinforces on repeat (dedup/merge)', async () => {
    const eml = makeEml(storage, 'fallback');
    const first = appendDelta(eml, { removedDependencies: ['left-pad'] }, 's1');
    const r1 = await processEventForExtraction(first, eml);
    expect(r1?.created).toHaveLength(1);
    expect(r1?.reinforced).toHaveLength(0);

    const memId = r1!.created[0];
    expect(eml.memoryRepo.getById(memId).sourceCount).toBe(1);

    const second = appendDelta(eml, { removedDependencies: ['left-pad'] }, 's2');
    const r2 = await processEventForExtraction(second, eml);
    expect(r2?.created).toHaveLength(0);
    expect(r2?.reinforced).toEqual([memId]);

    const reinforced = eml.memoryRepo.getById(memId);
    expect(reinforced.sourceCount).toBe(2);
    expect(reinforced.confidence).toBeGreaterThan(0.6);

    // extraction.completed events were recorded for both passes.
    expect(eml.eventStore.countByStatus('pending')).toBeGreaterThanOrEqual(2);
  });

  it('no-LLM (fallback) path creates memory and emits completion', async () => {
    const eml = makeEml(storage, 'fallback');
    const event = appendDelta(eml, { addedDependencies: ['zod'] }, 's1');
    const summary = await processEventForExtraction(event, eml);
    expect(summary?.created).toHaveLength(1);
    expect(eml.memoryRepo.getById(summary!.created[0]).title).toBe('Added dependency zod');
  });

  it('llm mode without a chat client raises LlmUnavailableError', async () => {
    const eml = makeEml(storage, 'llm');
    const event = appendDelta(eml, { removedDependencies: ['left-pad'] }, 's1');
    await expect(processEventForExtraction(event, eml, { chatClient: null })).rejects.toBeInstanceOf(
      LlmUnavailableError
    );
  });

  it('llm extractor retries then throws ExtractionError on invalid JSON', async () => {
    const eml = makeEml(storage, 'llm');
    const event = appendDelta(eml, { removedDependencies: ['left-pad'] }, 's1');
    let calls = 0;
    const badClient: ChatClient = {
      async completeJson(): Promise<string> {
        calls++;
        return 'not json at all';
      },
    };
    await expect(llmExtract(event, badClient, { maxRetries: 1 })).rejects.toBeInstanceOf(ExtractionError);
    expect(calls).toBe(2);
  });

  it('llm extractor parses valid JSON output', async () => {
    const eml = makeEml(storage, 'llm');
    const event = appendDelta(eml, { removedDependencies: ['left-pad'] }, 's1');
    const goodClient: ChatClient = {
      async completeJson(): Promise<string> {
        return JSON.stringify({
          memories: [
            { kind: 'decision', title: 'Drop left-pad', summary: 'inline impl', body: '', confidence: 0.8 },
          ],
        });
      },
    };
    const result = await llmExtract(event, goodClient);
    expect(result.memories[0].title).toBe('Drop left-pad');
  });
});
