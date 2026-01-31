/**
 * Embedding Cache Module
 * 
 * Multi-level caching for embeddings:
 * - L1: In-memory LRU cache
 * - L2: SQLite persistent cache
 * - L3: Precomputed embeddings
 * 
 * @module embeddings/cache
 */

export {
  EmbeddingCacheManager,
  type CacheManagerConfig,
  type CacheStats,
  type CacheLookupResult,
} from './manager.js';

export {
  L1MemoryCache,
  type L1CacheConfig,
  type L1CacheStats,
} from './l1-memory.js';

export {
  L2SQLiteCache,
  type L2CacheConfig,
  type L2CacheStats,
} from './l2-sqlite.js';

export {
  L3PrecomputedCache,
  type L3CacheConfig,
  type Intent,
} from './l3-precomputed.js';
