/**
 * EventBus: bounded worker loop over the event store.
 *
 * Mirrors the embedding-queue concurrency/backoff pattern. Claims pending
 * events in batches, dispatches each to all subscribers with capped
 * exponential-backoff retry, and never exceeds the configured concurrency
 * (backpressure). Emits `eml:event_processed` for downstream bridging.
 */

import { EventEmitter } from 'events';
import type { EventStore } from './store.js';
import type { EmlEvent } from './types.js';

export type EventHandler = (event: EmlEvent) => Promise<void> | void;

export interface EventBusOptions {
  concurrency: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  pollIntervalMs?: number;
}

export interface EventBusLogger {
  warn?: (event: string, fields: Record<string, unknown>) => void;
  error?: (event: string, fields: Record<string, unknown>) => void;
}

export class EventBus extends EventEmitter {
  private readonly store: EventStore;
  private readonly handlers: EventHandler[] = [];
  private readonly concurrency: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly logger: EventBusLogger;

  private inflight = 0;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(store: EventStore, options: EventBusOptions, logger: EventBusLogger = {}) {
    super();
    this.store = store;
    this.concurrency = Math.max(1, options.concurrency);
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 200;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
    this.pollIntervalMs = options.pollIntervalMs ?? 50;
    this.logger = logger;
  }

  subscribe(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  getInflight(): number {
    return this.inflight;
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Re-claim events left in `processing` by a previous crashed run.
    this.store.requeueStale();
    this.scheduleTick(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.inflight > 0) {
      await this.sleep(20);
    }
  }

  /**
   * Drain all currently-pending events (used by tests and graceful shutdown).
   */
  async drain(timeoutMs = 10000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pending = this.store.countByStatus('pending');
      if (pending === 0 && this.inflight === 0) return;
      await this.sleep(this.pollIntervalMs);
    }
  }

  private scheduleTick(delay: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, delay);
  }

  private async tick(): Promise<void> {
    if (!this.running || this.ticking) {
      this.scheduleTick(this.pollIntervalMs);
      return;
    }
    this.ticking = true;
    try {
      const capacity = this.concurrency - this.inflight;
      if (capacity <= 0) {
        this.logger.warn?.('eml.worker.backpressure', { inflight: this.inflight, concurrency: this.concurrency });
        return;
      }
      const events = this.store.claimBatch(capacity);
      for (const event of events) {
        this.inflight++;
        void this.processEvent(event).finally(() => {
          this.inflight--;
        });
      }
    } finally {
      this.ticking = false;
      this.scheduleTick(this.pollIntervalMs);
    }
  }

  private async processEvent(event: EmlEvent): Promise<void> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        for (const handler of this.handlers) {
          await handler(event);
        }
        this.store.markDone(event.id);
        this.emit('eml:event_processed', {
          eventId: event.id,
          type: event.type,
          repositoryId: event.repositoryId,
          status: 'done',
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt < this.maxRetries) {
          const backoff = Math.min(Math.pow(2, attempt) * this.baseDelayMs, this.maxDelayMs);
          await this.sleep(backoff);
          continue;
        }
        const result = this.store.markError(event.id, message);
        this.logger.error?.('eml.event.processing_failed', {
          eventId: event.id,
          type: event.type,
          attempts: result.attempts,
        });
        this.emit('eml:event_processed', {
          eventId: event.id,
          type: event.type,
          repositoryId: event.repositoryId,
          status: 'error',
        });
        return;
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
