/**
 * L2 Index Cache
 * 
 * Caches index lookups (by type, pattern, file, etc.)
 */

/**
 * Index cache entry
 */
interface IndexEntry {
  ids: string[];
  timestamp: number;
}

/**
 * L2 index cache
 */
export class L2IndexCache {
  private cache = new Map<string, IndexEntry>();
  private ttlMs: number;

  constructor(ttlMs = 60000) { // 1 minute default TTL
    this.ttlMs = ttlMs;
  }

  /**
   * Get cached index
   */
  get(key: string): string[] | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.ttlMs) {
      return entry.ids;
    }
    // Expired or not found
    this.cache.delete(key);
    return null;
  }

  /**
   * Set cached index
   */
  set(key: string, ids: string[]): void {
    this.cache.set(key, {
      ids,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate a key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching a pattern
   */
  invalidatePattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }
}
