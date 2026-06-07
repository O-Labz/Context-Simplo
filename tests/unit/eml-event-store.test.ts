import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { EventStore } from '../../src/eml/events/store.js';
import { EventBus } from '../../src/eml/events/bus.js';
import type { EmlEventInput } from '../../src/eml/events/types.js';

function sampleEvent(overrides: Partial<EmlEventInput> = {}): EmlEventInput {
  return {
    type: 'memory.asserted',
    source: 'agent',
    sourceRef: 'ref-1',
    repositoryId: 'repo1',
    payload: { foo: 'bar' },
    occurredAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('EML EventStore', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let store: EventStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-events-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    store = new EventStore(storage.getDatabase());
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects invalid input with EventValidationError', () => {
    expect(() => store.append({ ...sampleEvent(), repositoryId: '' })).toThrow(/Invalid event/);
  });

  it('appends an event and reports not deduped', () => {
    const res = store.append(sampleEvent());
    expect(res.deduped).toBe(false);
    expect(res.id).toMatch(/^evt_/);
    expect(store.countByStatus('pending')).toBe(1);
  });

  it('dedupes events with the same content hash', () => {
    const first = store.append(sampleEvent());
    const second = store.append(sampleEvent());
    expect(second.deduped).toBe(true);
    expect(second.id).toBe(first.id);
    expect(store.countByStatus('pending')).toBe(1);
  });

  it('treats key order in payload as identical (canonical hash)', () => {
    store.append(sampleEvent({ payload: { a: 1, b: 2 } }));
    const dup = store.append(sampleEvent({ payload: { b: 2, a: 1 } }));
    expect(dup.deduped).toBe(true);
  });

  it('claims pending rows atomically and does not re-claim', () => {
    store.append(sampleEvent({ sourceRef: 'a' }));
    store.append(sampleEvent({ sourceRef: 'b' }));
    const claimed = store.claimBatch(10);
    expect(claimed).toHaveLength(2);
    expect(claimed.every((e) => e.status === 'processing')).toBe(true);
    expect(store.claimBatch(10)).toHaveLength(0);
  });

  it('requeues stale processing events', () => {
    store.append(sampleEvent());
    store.claimBatch(10);
    expect(store.countByStatus('processing')).toBe(1);
    expect(store.requeueStale()).toBe(1);
    expect(store.countByStatus('pending')).toBe(1);
  });
});

describe('EML EventBus', () => {
  let dir: string;
  let storage: SqliteStorageProvider;
  let store: EventStore;
  let bus: EventBus;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eml-bus-'));
    storage = new SqliteStorageProvider(join(dir, 'test.db'));
    await storage.initialize();
    store = new EventStore(storage.getDatabase());
  });

  afterEach(async () => {
    await bus?.stop();
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('processes pending events to done with a no-op subscriber', async () => {
    bus = new EventBus(store, { concurrency: 2, baseDelayMs: 5, pollIntervalMs: 5 });
    const seen: string[] = [];
    bus.subscribe((e) => {
      seen.push(e.id);
    });
    store.append(sampleEvent({ sourceRef: 'a' }));
    store.append(sampleEvent({ sourceRef: 'b' }));
    bus.start();
    await bus.drain(5000);
    expect(seen).toHaveLength(2);
    expect(store.countByStatus('done')).toBe(2);
  });

  it('retries a transient failure then succeeds', async () => {
    bus = new EventBus(store, { concurrency: 1, maxRetries: 3, baseDelayMs: 5, pollIntervalMs: 5 });
    let attempts = 0;
    bus.subscribe(() => {
      attempts++;
      if (attempts < 3) throw new Error('transient');
    });
    store.append(sampleEvent());
    bus.start();
    await bus.drain(5000);
    expect(attempts).toBe(3);
    expect(store.countByStatus('done')).toBe(1);
  });

  it('marks an event error after exhausting retries', async () => {
    bus = new EventBus(store, { concurrency: 1, maxRetries: 2, baseDelayMs: 5, pollIntervalMs: 5 });
    bus.subscribe(() => {
      throw new Error('permanent');
    });
    store.append(sampleEvent());
    bus.start();
    // Wait for terminal error state.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && store.countByStatus('error') === 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(store.countByStatus('error')).toBe(1);
  });

  it('never exceeds concurrency (backpressure)', async () => {
    bus = new EventBus(store, { concurrency: 2, baseDelayMs: 5, pollIntervalMs: 5 });
    let maxObserved = 0;
    bus.subscribe(async () => {
      maxObserved = Math.max(maxObserved, bus.getInflight());
      await new Promise((r) => setTimeout(r, 30));
    });
    for (let i = 0; i < 6; i++) {
      store.append(sampleEvent({ sourceRef: `e${i}` }));
    }
    bus.start();
    await bus.drain(8000);
    expect(maxObserved).toBeLessThanOrEqual(2);
    expect(store.countByStatus('done')).toBe(6);
  });
});
