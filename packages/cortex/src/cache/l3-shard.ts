/**
 * L3 Shard Cache
 * 
 * Caches memory shards for large result sets.
 */

import type { Memory } from '../types/index.js';

/**
 * Shard cache entry
 */
interface ShardEntry {
  memories: Memory[];
  timestamp: number;
}

/**
 * L3 shard cache
 */
export class L3ShardCache {
  private cache = new Map<string, ShardEntry>();
  private ttlMs: number;
  private maxShards: number;

  constructor(ttlMs = 300000, maxShards = 20) { // 5 minute TTL, 20 shards max
    this.ttlMs = ttlMs;
    this.maxShards = maxShards;
  }

  /**
   * Get cached shard
   */
  get(key: string): Memory[] | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.ttlMs) {
      return entry.memories;
    }
    // Expired or not found
    this.cache.delete(key);
    return null;
  }

  /**
   * Set cached shard
   */
  set(key: string, memories: Memory[]): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxShards) {
      this.evictOldest();
    }

    this.cache.set(key, {
      memories,
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

  /**
   * Evict oldest entry
   */
  private evictOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldest = key;
        oldestTime = entry.timestamp;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }
}
