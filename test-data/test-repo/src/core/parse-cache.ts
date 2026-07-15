/**
 * Bounded in-memory cache for parsed file content
 *
 * What it does:
 * Stores parsed files + content after indexing so embedding can reuse them
 * without re-reading and re-parsing. Bounded by size to prevent memory issues.
 *
 * Design:
 * - LRU eviction when size exceeds MAX_CACHE_SIZE
 * - Tracks memory usage by content.length + JSON.stringify(parsed).length
 * - Thread-safe (synchronous Map operations)
 *
 * Constraints:
 * - Max ~100MB or 1000 files (whichever comes first)
 * - Restart-safe: cache miss = fallback to read+parse
 */

import type { parseFile } from './parser.js';

const MAX_CACHE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_CACHE_ENTRIES = 1000;

interface CacheEntry {
  content: string;
  parsed: Awaited<ReturnType<typeof parseFile>>;
  size: number; // Approximate memory size in bytes
  lastAccessed: number; // Timestamp for LRU
}

export class ParseCache {
  private cache = new Map<string, CacheEntry>();
  private totalSize = 0;

  /**
   * Store parsed file + content after successful indexing
   */
  set(
    filePath: string,
    content: string,
    parsed: Awaited<ReturnType<typeof parseFile>>
  ): void {
    // Estimate memory size (content + serialized parsed structure)
    const size = content.length + this.estimateParsedSize(parsed);

    // Evict if necessary
    while (
      (this.totalSize + size > MAX_CACHE_SIZE_BYTES ||
        this.cache.size >= MAX_CACHE_ENTRIES) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    // Skip if single entry exceeds max size
    if (size > MAX_CACHE_SIZE_BYTES) {
      return;
    }

    // Remove existing entry if present (to update size)
    if (this.cache.has(filePath)) {
      const existing = this.cache.get(filePath)!;
      this.totalSize -= existing.size;
      this.cache.delete(filePath);
    }

    // Add new entry
    this.cache.set(filePath, {
      content,
      parsed,
      size,
      lastAccessed: Date.now(),
    });
    this.totalSize += size;
  }

  /**
   * Retrieve cached parse + content (undefined on miss)
   */
  get(
    filePath: string
  ): { content: string; parsed: Awaited<ReturnType<typeof parseFile>> } | undefined {
    const entry = this.cache.get(filePath);
    if (!entry) return undefined;

    // Update LRU timestamp
    entry.lastAccessed = Date.now();
    return { content: entry.content, parsed: entry.parsed };
  }

  /**
   * Remove entry from cache
   */
  delete(filePath: string): void {
    const entry = this.cache.get(filePath);
    if (entry) {
      this.totalSize -= entry.size;
      this.cache.delete(filePath);
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }

  /**
   * Get cache statistics
   */
  stats(): { entries: number; totalSizeBytes: number } {
    return {
      entries: this.cache.size,
      totalSizeBytes: this.totalSize,
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestPath: string | undefined;
    let oldestTime = Infinity;

    this.cache.forEach((entry, path) => {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestPath = path;
      }
    });

    if (oldestPath) {
      this.delete(oldestPath);
    }
  }

  /**
   * Estimate memory size of parsed file structure
   */
  private estimateParsedSize(parsed: Awaited<ReturnType<typeof parseFile>>): number {
    // Rough estimate: count nodes, edges, imports, calls, inheritance
    let size = 1000; // Base overhead

    size += parsed.nodes.length * 500; // Approximate per-node overhead
    size += parsed.imports.length * 200;
    size += parsed.calls.length * 200;
    size += parsed.inheritance.length * 200;

    return size;
  }
}

// Singleton instance
export const parseCache = new ParseCache();
