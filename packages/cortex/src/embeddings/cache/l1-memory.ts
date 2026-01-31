/**
 * L1 Memory Cache
 * 
 * In-memory LRU cache for hot embeddings.
 * Fastest access, limited capacity.
 * 
 * @module embeddings/cache/l1-memory
 */

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  /** The embedding vector */
  embedding: number[];
  /** When the entry was created */
  createdAt: number;
  /** Number of times accessed */
  accessCount: number;
  /** Last access time */
  lastAccess: number;
}

/**
 * L1 cache configuration
 */
export interface L1CacheConfig {
  /** Maximum number of entries */
  maxSize: number;
  /** TTL in milliseconds (0 = no expiry) */
  ttl: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: L1CacheConfig = {
  maxSize: 1000,
  ttl: 0, // No expiry by default
};

/**
 * Cache statistics
 */
export interface L1CacheStats {
  /** Number of entries */
  size: number;
  /** Maximum size */
  maxSize: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate */
  hitRate: number;
  /** Average access count */
  avgAccessCount: number;
}

/**
 * L1 Memory Cache using LRU eviction
 */
export class L1MemoryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: L1CacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config?: Partial<L1CacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get embedding from cache
   */
  get(hash: string): number[] | null {
    const entry = this.cache.get(hash);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (this.config.ttl > 0) {
      const age = Date.now() - entry.createdAt;
      if (age > this.config.ttl) {
        this.cache.delete(hash);
        this.misses++;
        return null;
      }
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccess = Date.now();

    // Move to end (most recently used)
    this.cache.delete(hash);
    this.cache.set(hash, entry);

    this.hits++;
    return entry.embedding;
  }

  /**
   * Set embedding in cache
   */
  set(hash: string, embedding: number[]): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize && !this.cache.has(hash)) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      embedding,
      createdAt: Date.now(),
      accessCount: 1,
      lastAccess: Date.now(),
    };

    this.cache.set(hash, entry);
  }

  /**
   * Check if hash exists in cache
   */
  has(hash: string): boolean {
    const entry = this.cache.get(hash);
    
    if (!entry) return false;

    // Check TTL
    if (this.config.ttl > 0) {
      const age = Date.now() - entry.createdAt;
      if (age > this.config.ttl) {
        this.cache.delete(hash);
        return false;
      }
    }

    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(hash: string): boolean {
    return this.cache.delete(hash);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): L1CacheStats {
    const total = this.hits + this.misses;
    let totalAccessCount = 0;

    for (const entry of this.cache.values()) {
      totalAccessCount += entry.accessCount;
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      avgAccessCount: this.cache.size > 0 ? totalAccessCount / this.cache.size : 0,
    };
  }

  /**
   * Get all keys in cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get current size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Preload entries into cache
   */
  preload(entries: Array<{ hash: string; embedding: number[] }>): void {
    for (const { hash, embedding } of entries) {
      if (this.cache.size >= this.config.maxSize) break;
      
      if (!this.cache.has(hash)) {
        this.set(hash, embedding);
      }
    }
  }

  /**
   * Evict expired entries
   */
  evictExpired(): number {
    if (this.config.ttl === 0) return 0;

    const now = Date.now();
    let evicted = 0;

    for (const [hash, entry] of this.cache) {
      if (now - entry.createdAt > this.config.ttl) {
        this.cache.delete(hash);
        evicted++;
      }
    }

    return evicted;
  }

  // Private helpers

  private evictLRU(): void {
    // Map maintains insertion order, first entry is LRU
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }
}
