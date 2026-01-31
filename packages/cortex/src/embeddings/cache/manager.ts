/**
 * Embedding Cache Manager
 * 
 * Orchestrates multi-level caching for embeddings.
 * L1 (memory) -> L2 (SQLite) -> L3 (precomputed)
 * 
 * @module embeddings/cache/manager
 */

import type Database from 'better-sqlite3';
import { L1MemoryCache, type L1CacheConfig, type L1CacheStats } from './l1-memory.js';
import { L2SQLiteCache, type L2CacheConfig, type L2CacheStats } from './l2-sqlite.js';
import { L3PrecomputedCache, type L3CacheConfig, type Intent } from './l3-precomputed.js';

/**
 * Cache manager configuration
 */
export interface CacheManagerConfig {
  /** L1 cache config */
  l1?: Partial<L1CacheConfig>;
  /** L2 cache config */
  l2?: Partial<L2CacheConfig>;
  /** L3 cache config */
  l3?: Partial<L3CacheConfig>;
  /** Whether to enable L2 (requires database) */
  enableL2: boolean;
  /** Whether to enable L3 */
  enableL3: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CacheManagerConfig = {
  enableL2: true,
  enableL3: true,
};

/**
 * Combined cache statistics
 */
export interface CacheStats {
  l1: L1CacheStats;
  l2: L2CacheStats | null;
  l3: {
    patterns: number;
    fileTypes: number;
    intents: number;
  } | null;
  totalHits: number;
  totalMisses: number;
  overallHitRate: number;
}

/**
 * Cache lookup result
 */
export interface CacheLookupResult {
  /** The embedding if found */
  embedding: number[] | null;
  /** Which cache level it was found in */
  level: 'l1' | 'l2' | 'l3' | 'miss';
  /** Lookup time in ms */
  lookupTime: number;
}

/**
 * Embedding Cache Manager
 * 
 * Provides a unified interface for multi-level caching:
 * - L1: In-memory LRU cache (fastest, limited size)
 * - L2: SQLite persistent cache (slower, larger)
 * - L3: Precomputed embeddings (instant, fixed set)
 */
export class EmbeddingCacheManager {
  private l1: L1MemoryCache;
  private l2: L2SQLiteCache | null = null;
  private l3: L3PrecomputedCache | null = null;
  private config: CacheManagerConfig;
  private initialized = false;

  constructor(config?: Partial<CacheManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.l1 = new L1MemoryCache(this.config.l1);

    if (this.config.enableL2) {
      this.l2 = new L2SQLiteCache(this.config.l2);
    }

    if (this.config.enableL3) {
      this.l3 = new L3PrecomputedCache(this.config.l3);
    }
  }

  /**
   * Initialize the cache manager
   */
  async initialize(db?: Database.Database): Promise<void> {
    if (this.initialized) return;

    // Initialize L2 if database provided
    if (this.l2 && db) {
      await this.l2.initialize(db);
    }

    // Initialize L3
    if (this.l3) {
      await this.l3.initialize();
    }

    this.initialized = true;
  }

  /**
   * Get embedding from cache (checks all levels)
   */
  async get(hash: string): Promise<number[] | null> {
    const result = await this.getWithDetails(hash);
    return result.embedding;
  }

  /**
   * Get embedding with cache level information
   */
  async getWithDetails(hash: string): Promise<CacheLookupResult> {
    const startTime = Date.now();

    // Check L1 first (fastest)
    const l1Result = this.l1.get(hash);
    if (l1Result) {
      return {
        embedding: l1Result,
        level: 'l1',
        lookupTime: Date.now() - startTime,
      };
    }

    // Check L2 (persistent)
    if (this.l2) {
      const l2Result = await this.l2.get(hash);
      if (l2Result) {
        // Promote to L1
        this.l1.set(hash, l2Result);
        return {
          embedding: l2Result,
          level: 'l2',
          lookupTime: Date.now() - startTime,
        };
      }
    }

    // L3 is for precomputed patterns, not hash lookups
    // So we return miss here

    return {
      embedding: null,
      level: 'miss',
      lookupTime: Date.now() - startTime,
    };
  }

  /**
   * Set embedding in cache
   */
  async set(hash: string, embedding: number[]): Promise<void> {
    // Always set in L1
    this.l1.set(hash, embedding);

    // Also set in L2 for persistence
    if (this.l2) {
      await this.l2.set(hash, embedding);
    }
  }

  /**
   * Get precomputed pattern embedding
   */
  getPattern(name: string): number[] | null {
    return this.l3?.getPattern(name) ?? null;
  }

  /**
   * Get precomputed file type embedding
   */
  getFileType(type: string): number[] | null {
    return this.l3?.getFileType(type) ?? null;
  }

  /**
   * Get precomputed intent embedding
   */
  getIntent(intent: Intent): number[] | null {
    return this.l3?.getIntent(intent) ?? null;
  }

  /**
   * Preload embeddings into L1 cache
   */
  async preload(hashes: string[]): Promise<number> {
    if (!this.l2) return 0;

    // Get from L2
    const embeddings = await this.l2.getBatch(hashes);

    // Load into L1
    let loaded = 0;
    for (const [hash, embedding] of embeddings) {
      this.l1.set(hash, embedding);
      loaded++;
    }

    return loaded;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const l1Stats = this.l1.getStats();
    const l2Stats = this.l2 ? await this.l2.getStats() : null;
    const l3Stats = this.l3 ? this.l3.getStats() : null;

    const totalHits = l1Stats.hits + (l2Stats?.hits ?? 0);
    const totalMisses = l1Stats.misses + (l2Stats?.misses ?? 0);
    const total = totalHits + totalMisses;

    return {
      l1: l1Stats,
      l2: l2Stats,
      l3: l3Stats ? {
        patterns: l3Stats.patterns,
        fileTypes: l3Stats.fileTypes,
        intents: l3Stats.intents,
      } : null,
      totalHits,
      totalMisses,
      overallHitRate: total > 0 ? totalHits / total : 0,
    };
  }

  /**
   * Clear cache at specified level(s)
   */
  async clear(level?: 1 | 2 | 3 | 'all'): Promise<void> {
    if (level === 1 || level === 'all' || level === undefined) {
      this.l1.clear();
    }

    if ((level === 2 || level === 'all') && this.l2) {
      await this.l2.clear();
    }

    // L3 is precomputed, don't clear it
  }

  /**
   * Evict expired entries from all levels
   */
  async evictExpired(): Promise<{ l1: number; l2: number }> {
    const l1Evicted = this.l1.evictExpired();
    const l2Evicted = this.l2 ? await this.l2.evictExpired() : 0;

    return { l1: l1Evicted, l2: l2Evicted };
  }

  /**
   * Check if hash exists in any cache level
   */
  async has(hash: string): Promise<boolean> {
    if (this.l1.has(hash)) return true;
    if (this.l2 && await this.l2.has(hash)) return true;
    return false;
  }

  /**
   * Delete from all cache levels
   */
  async delete(hash: string): Promise<void> {
    this.l1.delete(hash);
    if (this.l2) {
      await this.l2.delete(hash);
    }
  }

  /**
   * Get batch of embeddings
   */
  async getBatch(hashes: string[]): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    const missingHashes: string[] = [];

    // Check L1 first
    for (const hash of hashes) {
      const embedding = this.l1.get(hash);
      if (embedding) {
        result.set(hash, embedding);
      } else {
        missingHashes.push(hash);
      }
    }

    // Check L2 for missing
    if (this.l2 && missingHashes.length > 0) {
      const l2Results = await this.l2.getBatch(missingHashes);
      for (const [hash, embedding] of l2Results) {
        result.set(hash, embedding);
        // Promote to L1
        this.l1.set(hash, embedding);
      }
    }

    return result;
  }

  /**
   * Set batch of embeddings
   */
  async setBatch(entries: Array<{ hash: string; embedding: number[] }>): Promise<void> {
    // Set in L1
    for (const { hash, embedding } of entries) {
      this.l1.set(hash, embedding);
    }

    // Set in L2
    if (this.l2) {
      await this.l2.setBatch(entries);
    }
  }

  /**
   * Find closest precomputed pattern
   */
  findClosestPattern(embedding: number[]): { pattern: string; similarity: number } | null {
    return this.l3?.findClosestPattern(embedding) ?? null;
  }

  /**
   * Find closest precomputed intent
   */
  findClosestIntent(embedding: number[]): { intent: Intent; similarity: number } | null {
    return this.l3?.findClosestIntent(embedding) ?? null;
  }
}
