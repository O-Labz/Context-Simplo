/**
 * Memory Guard with Backpressure
 *
 * What it does:
 * Reads process.memoryUsage() and applies backpressure based on watermarks:
 * - Pauses at soft watermark and calls global.gc() if available
 * - Rejects at hard watermark with MemoryPressureError (HTTP 503)
 *
 * Design:
 * - Injectable readMemory seam for testing
 * - Compares heapUsed against heapLimitMb * pct/100
 * - Three levels: ok, soft, hard
 * - relieve() handles GC and short delay when needed
 */

import { MemoryPressureError } from './errors.js';

export interface MemoryGuardOptions {
  softPct: number;
  hardPct: number;
  heapLimitMb: number;
  readMemory?: () => NodeJS.MemoryUsage;
}

export type MemoryLevel = 'ok' | 'soft' | 'hard';

export class MemoryGuard {
  private softPct: number;
  private hardPct: number;
  private heapLimitBytes: number;
  private readMemory: () => NodeJS.MemoryUsage;

  constructor(options: MemoryGuardOptions) {
    this.softPct = options.softPct;
    this.hardPct = options.hardPct;
    this.heapLimitBytes = options.heapLimitMb * 1024 * 1024;
    this.readMemory = options.readMemory || (() => process.memoryUsage());
  }

  level(): MemoryLevel {
    const memUsage = this.readMemory();
    const heapUsed = memUsage.heapUsed;

    const hardThreshold = this.heapLimitBytes * (this.hardPct / 100);
    const softThreshold = this.heapLimitBytes * (this.softPct / 100);

    if (heapUsed >= hardThreshold) {
      return 'hard';
    } else if (heapUsed >= softThreshold) {
      return 'soft';
    } else {
      return 'ok';
    }
  }

  assertAdmissible(): void {
    const currentLevel = this.level();
    if (currentLevel === 'hard') {
      throw new MemoryPressureError();
    }
  }

  async relieve(): Promise<void> {
    const currentLevel = this.level();
    if (currentLevel !== 'ok') {
      // Call garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Short delay to allow GC to complete
      await this.sleep(100);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}