/**
 * MemoryGuard Unit Tests
 *
 * Tests the memory pressure backpressure system:
 * - Returns correct levels (ok/soft/hard) based on thresholds
 * - assertAdmissible throws MemoryPressureError at hard level
 * - relieve() calls GC and waits when needed
 * - Uses injected readMemory for deterministic testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryGuard } from '../../src/core/memory-guard.js';
import { MemoryPressureError } from '../../src/core/errors.js';

describe('MemoryGuard', () => {
  let memoryGuard: MemoryGuard;
  let mockMemoryUsage: NodeJS.MemoryUsage;
  let mockReadMemory: () => NodeJS.MemoryUsage;

  const heapLimitMb = 100; // 100MB for easy testing
  const heapLimitBytes = heapLimitMb * 1024 * 1024;
  const softPct = 75; // 75MB
  const hardPct = 90; // 90MB

  beforeEach(() => {
    mockMemoryUsage = {
      rss: 0,
      heapTotal: 0,
      heapUsed: 50 * 1024 * 1024, // 50MB - below soft threshold
      external: 0,
      arrayBuffers: 0,
    };

    mockReadMemory = vi.fn(() => mockMemoryUsage);

    memoryGuard = new MemoryGuard({
      softPct,
      hardPct,
      heapLimitMb,
      readMemory: mockReadMemory,
    });
  });

  describe('level()', () => {
    it('should return "ok" when heap usage is below soft threshold', () => {
      mockMemoryUsage.heapUsed = 50 * 1024 * 1024; // 50MB < 75MB
      expect(memoryGuard.level()).toBe('ok');
    });

    it('should return "soft" when heap usage is at soft threshold but below hard', () => {
      mockMemoryUsage.heapUsed = 80 * 1024 * 1024; // 80MB: 75MB <= x < 90MB
      expect(memoryGuard.level()).toBe('soft');
    });

    it('should return "hard" when heap usage is at or above hard threshold', () => {
      mockMemoryUsage.heapUsed = 95 * 1024 * 1024; // 95MB >= 90MB
      expect(memoryGuard.level()).toBe('hard');
    });

    it('should handle exact threshold boundaries', () => {
      // Exactly at soft threshold
      mockMemoryUsage.heapUsed = 75 * 1024 * 1024; // 75MB
      expect(memoryGuard.level()).toBe('soft');

      // Exactly at hard threshold
      mockMemoryUsage.heapUsed = 90 * 1024 * 1024; // 90MB
      expect(memoryGuard.level()).toBe('hard');
    });
  });

  describe('assertAdmissible()', () => {
    it('should not throw when memory level is "ok"', () => {
      mockMemoryUsage.heapUsed = 50 * 1024 * 1024; // 50MB
      expect(() => memoryGuard.assertAdmissible()).not.toThrow();
    });

    it('should not throw when memory level is "soft"', () => {
      mockMemoryUsage.heapUsed = 80 * 1024 * 1024; // 80MB
      expect(() => memoryGuard.assertAdmissible()).not.toThrow();
    });

    it('should throw MemoryPressureError when memory level is "hard"', () => {
      mockMemoryUsage.heapUsed = 95 * 1024 * 1024; // 95MB
      expect(() => memoryGuard.assertAdmissible()).toThrow(MemoryPressureError);
    });

    it('should throw MemoryPressureError with correct properties', () => {
      mockMemoryUsage.heapUsed = 95 * 1024 * 1024; // 95MB
      try {
        memoryGuard.assertAdmissible();
        expect.fail('Expected MemoryPressureError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MemoryPressureError);
        expect((error as MemoryPressureError).code).toBe('MEMORY_PRESSURE');
        expect((error as MemoryPressureError).retryAfterSeconds).toBe(30);
      }
    });
  });

  describe('relieve()', () => {
    beforeEach(() => {
      // Mock global.gc
      global.gc = vi.fn();
    });

    afterEach(() => {
      delete global.gc;
    });

    it('should call gc and delay when memory level is "soft"', async () => {
      mockMemoryUsage.heapUsed = 80 * 1024 * 1024; // 80MB - soft level
      
      const startTime = Date.now();
      await memoryGuard.relieve();
      const endTime = Date.now();

      expect(global.gc).toHaveBeenCalledOnce();
      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // ~100ms delay
    });

    it('should call gc and delay when memory level is "hard"', async () => {
      mockMemoryUsage.heapUsed = 95 * 1024 * 1024; // 95MB - hard level
      
      const startTime = Date.now();
      await memoryGuard.relieve();
      const endTime = Date.now();

      expect(global.gc).toHaveBeenCalledOnce();
      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // ~100ms delay
    });

    it('should not call gc or delay when memory level is "ok"', async () => {
      mockMemoryUsage.heapUsed = 50 * 1024 * 1024; // 50MB - ok level
      
      const startTime = Date.now();
      await memoryGuard.relieve();
      const endTime = Date.now();

      expect(global.gc).not.toHaveBeenCalled();
      expect(endTime - startTime).toBeLessThan(50); // No significant delay
    });

    it('should handle missing global.gc gracefully', async () => {
      delete global.gc;
      mockMemoryUsage.heapUsed = 80 * 1024 * 1024; // 80MB - soft level
      
      // Should not throw
      await expect(memoryGuard.relieve()).resolves.toBeUndefined();
    });
  });

  it('should use process.memoryUsage when no readMemory is provided', () => {
    const guardWithoutMock = new MemoryGuard({
      softPct,
      hardPct,
      heapLimitMb,
    });

    // Should not throw (uses real process.memoryUsage)
    expect(() => guardWithoutMock.level()).not.toThrow();
  });
});