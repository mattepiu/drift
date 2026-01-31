/**
 * L1 Memory Cache
 * 
 * In-memory hot cache for frequently accessed memories.
 */

import type { Memory } from '../types/index.js';

/**
 * Cache entry
 */
interface CacheEntry {
  memory: Memory;
  accessCount: number;
  lastAccessed: number;
}

/**
 * L1 memory cache
 */
export class L1MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Get a memory from cache
   */
  get(id: string): Memory | null {
    const entry = this.cache.get(id);
    if (entry) {
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      return entry.memory;
    }
    return null;
  }

  /**
   * Set a memory in cache
   */
  set(id: string, memory: Memory): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evict();
    }

    this.cache.set(id, {
      memory,
      accessCount: 1,
      lastAccessed: Date.now(),
    });
  }

  /**
   * Delete a memory from cache
   */
  delete(id: string): void {
    this.cache.delete(id);
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
   * Evict least recently used entry
   */
  private evict(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldest = id;
        oldestTime = entry.lastAccessed;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }
}
