/**
 * Cache Preloader
 * 
 * Preloads frequently accessed memories on startup.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import { L1MemoryCache } from './l1-memory.js';

/**
 * Cache preloader
 */
export class CachePreloader {
  constructor(
    private storage: IMemoryStorage,
    private cache: L1MemoryCache
  ) {}

  /**
   * Preload frequently accessed memories
   */
  async preload(): Promise<number> {
    // Get most frequently accessed memories
    const memories = await this.storage.search({
      minAccessCount: 5,
      orderBy: 'accessCount',
      orderDir: 'desc',
      limit: 50,
    });

    // Load into cache
    for (const memory of memories) {
      this.cache.set(memory.id, memory);
    }

    return memories.length;
  }

  /**
   * Preload memories by type
   */
  async preloadByType(types: string[]): Promise<number> {
    let loaded = 0;

    for (const type of types) {
      const memories = await this.storage.findByType(type as any, { limit: 20 });
      for (const memory of memories) {
        this.cache.set(memory.id, memory);
        loaded++;
      }
    }

    return loaded;
  }
}
