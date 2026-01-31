/**
 * Embedding Cache Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  L1MemoryCache,
  L3PrecomputedCache,
  EmbeddingCacheManager,
} from '../../embeddings/cache/index.js';

describe('L1MemoryCache', () => {
  let cache: L1MemoryCache;

  beforeEach(() => {
    cache = new L1MemoryCache({ maxSize: 100 });
  });

  describe('get/set', () => {
    it('should store and retrieve embeddings', () => {
      const embedding = [0.1, 0.2, 0.3];
      cache.set('hash1', embedding);
      
      const result = cache.get('hash1');
      expect(result).toEqual(embedding);
    });

    it('should return null for missing keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('hash1', [0.1, 0.2]);
      expect(cache.has('hash1')).toBe(true);
    });

    it('should return false for missing keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove entries', () => {
      cache.set('hash1', [0.1, 0.2]);
      cache.delete('hash1');
      
      expect(cache.has('hash1')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('hash1', [0.1]);
      cache.set('hash2', [0.2]);
      cache.clear();
      
      expect(cache.size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used when at capacity', () => {
      const smallCache = new L1MemoryCache({ maxSize: 3 });
      
      smallCache.set('hash1', [0.1]);
      smallCache.set('hash2', [0.2]);
      smallCache.set('hash3', [0.3]);
      
      // Access hash1 to make it recently used
      smallCache.get('hash1');
      
      // Add new entry, should evict hash2 (LRU)
      smallCache.set('hash4', [0.4]);
      
      expect(smallCache.has('hash1')).toBe(true);
      expect(smallCache.has('hash2')).toBe(false);
      expect(smallCache.has('hash3')).toBe(true);
      expect(smallCache.has('hash4')).toBe(true);
    });
  });

  describe('TTL', () => {
    it('should expire entries after TTL', async () => {
      const ttlCache = new L1MemoryCache({ maxSize: 100, ttl: 50 });
      
      ttlCache.set('hash1', [0.1]);
      expect(ttlCache.get('hash1')).toEqual([0.1]);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(ttlCache.get('hash1')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should track hits and misses', () => {
      cache.set('hash1', [0.1]);
      
      cache.get('hash1'); // Hit
      cache.get('hash1'); // Hit
      cache.get('nonexistent'); // Miss
      
      const stats = cache.getStats();
      
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2/3, 2);
    });
  });

  describe('preload', () => {
    it('should preload entries', () => {
      const entries = [
        { hash: 'hash1', embedding: [0.1] },
        { hash: 'hash2', embedding: [0.2] },
      ];
      
      cache.preload(entries);
      
      expect(cache.get('hash1')).toEqual([0.1]);
      expect(cache.get('hash2')).toEqual([0.2]);
    });
  });
});

describe('L3PrecomputedCache', () => {
  let cache: L3PrecomputedCache;

  beforeEach(async () => {
    cache = new L3PrecomputedCache();
    await cache.initialize();
  });

  describe('getPattern', () => {
    it('should return precomputed pattern embeddings', () => {
      const embedding = cache.getPattern('async-await');
      
      expect(embedding).toBeDefined();
      expect(embedding!.length).toBe(768);
    });

    it('should return null for unknown patterns', () => {
      const embedding = cache.getPattern('unknown-pattern');
      expect(embedding).toBeNull();
    });
  });

  describe('getFileType', () => {
    it('should return precomputed file type embeddings', () => {
      const embedding = cache.getFileType('typescript');
      
      expect(embedding).toBeDefined();
      expect(embedding!.length).toBe(768);
    });
  });

  describe('getIntent', () => {
    it('should return precomputed intent embeddings', () => {
      const embedding = cache.getIntent('add_feature');
      
      expect(embedding).toBeDefined();
      expect(embedding!.length).toBe(768);
    });
  });

  describe('listPatterns', () => {
    it('should list available patterns', () => {
      const patterns = cache.listPatterns();
      
      expect(patterns).toContain('async-await');
      expect(patterns).toContain('error-handling');
      expect(patterns).toContain('middleware');
    });
  });

  describe('listFileTypes', () => {
    it('should list available file types', () => {
      const types = cache.listFileTypes();
      
      expect(types).toContain('typescript');
      expect(types).toContain('javascript');
      expect(types).toContain('python');
    });
  });

  describe('listIntents', () => {
    it('should list available intents', () => {
      const intents = cache.listIntents();
      
      expect(intents).toContain('add_feature');
      expect(intents).toContain('fix_bug');
      expect(intents).toContain('refactor');
    });
  });

  describe('findClosestPattern', () => {
    it('should find closest pattern to embedding', () => {
      const asyncEmb = cache.getPattern('async-await')!;
      const result = cache.findClosestPattern(asyncEmb);
      
      expect(result).toBeDefined();
      expect(result!.pattern).toBe('async-await');
      expect(result!.similarity).toBeCloseTo(1, 5);
    });
  });

  describe('findClosestIntent', () => {
    it('should find closest intent to embedding', () => {
      const featureEmb = cache.getIntent('add_feature')!;
      const result = cache.findClosestIntent(featureEmb);
      
      expect(result).toBeDefined();
      expect(result!.intent).toBe('add_feature');
      expect(result!.similarity).toBeCloseTo(1, 5);
    });
  });

  describe('addPattern', () => {
    it('should add custom pattern', () => {
      const customEmb = new Array(768).fill(0.1);
      cache.addPattern('custom-pattern', customEmb);
      
      const retrieved = cache.getPattern('custom-pattern');
      expect(retrieved).toEqual(customEmb);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = cache.getStats();
      
      expect(stats.patterns).toBeGreaterThan(0);
      expect(stats.fileTypes).toBeGreaterThan(0);
      expect(stats.intents).toBeGreaterThan(0);
      expect(stats.initialized).toBe(true);
    });
  });
});

describe('EmbeddingCacheManager', () => {
  let manager: EmbeddingCacheManager;

  beforeEach(async () => {
    manager = new EmbeddingCacheManager({
      enableL2: false, // Disable L2 for unit tests (requires DB)
      enableL3: true,
    });
    await manager.initialize();
  });

  describe('get/set', () => {
    it('should store and retrieve from L1', async () => {
      const embedding = [0.1, 0.2, 0.3];
      await manager.set('hash1', embedding);
      
      const result = await manager.get('hash1');
      expect(result).toEqual(embedding);
    });

    it('should return null for missing keys', async () => {
      const result = await manager.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getWithDetails', () => {
    it('should report cache level', async () => {
      await manager.set('hash1', [0.1, 0.2]);
      
      const result = await manager.getWithDetails('hash1');
      
      expect(result.embedding).toEqual([0.1, 0.2]);
      expect(result.level).toBe('l1');
      expect(result.lookupTime).toBeGreaterThanOrEqual(0);
    });

    it('should report miss for missing keys', async () => {
      const result = await manager.getWithDetails('nonexistent');
      
      expect(result.embedding).toBeNull();
      expect(result.level).toBe('miss');
    });
  });

  describe('precomputed access', () => {
    it('should get pattern embeddings', () => {
      const embedding = manager.getPattern('async-await');
      expect(embedding).toBeDefined();
    });

    it('should get file type embeddings', () => {
      const embedding = manager.getFileType('typescript');
      expect(embedding).toBeDefined();
    });

    it('should get intent embeddings', () => {
      const embedding = manager.getIntent('add_feature');
      expect(embedding).toBeDefined();
    });
  });

  describe('has', () => {
    it('should check existence', async () => {
      await manager.set('hash1', [0.1]);
      
      expect(await manager.has('hash1')).toBe(true);
      expect(await manager.has('nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove entries', async () => {
      await manager.set('hash1', [0.1]);
      await manager.delete('hash1');
      
      expect(await manager.has('hash1')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear L1 cache', async () => {
      await manager.set('hash1', [0.1]);
      await manager.set('hash2', [0.2]);
      
      await manager.clear(1);
      
      expect(await manager.has('hash1')).toBe(false);
      expect(await manager.has('hash2')).toBe(false);
    });
  });

  describe('getBatch', () => {
    it('should get multiple embeddings', async () => {
      await manager.set('hash1', [0.1]);
      await manager.set('hash2', [0.2]);
      
      const results = await manager.getBatch(['hash1', 'hash2', 'hash3']);
      
      expect(results.get('hash1')).toEqual([0.1]);
      expect(results.get('hash2')).toEqual([0.2]);
      expect(results.has('hash3')).toBe(false);
    });
  });

  describe('setBatch', () => {
    it('should set multiple embeddings', async () => {
      await manager.setBatch([
        { hash: 'hash1', embedding: [0.1] },
        { hash: 'hash2', embedding: [0.2] },
      ]);
      
      expect(await manager.get('hash1')).toEqual([0.1]);
      expect(await manager.get('hash2')).toEqual([0.2]);
    });
  });

  describe('getStats', () => {
    it('should return combined statistics', async () => {
      await manager.set('hash1', [0.1]);
      await manager.get('hash1');
      await manager.get('nonexistent');
      
      const stats = await manager.getStats();
      
      expect(stats.l1).toBeDefined();
      expect(stats.l3).toBeDefined();
      expect(stats.totalHits).toBeGreaterThanOrEqual(1);
      expect(stats.totalMisses).toBeGreaterThanOrEqual(1);
    });
  });

  describe('findClosestPattern', () => {
    it('should find closest pattern', () => {
      const asyncEmb = manager.getPattern('async-await')!;
      const result = manager.findClosestPattern(asyncEmb);
      
      expect(result).toBeDefined();
      expect(result!.pattern).toBe('async-await');
    });
  });

  describe('findClosestIntent', () => {
    it('should find closest intent', () => {
      const featureEmb = manager.getIntent('add_feature')!;
      const result = manager.findClosestIntent(featureEmb);
      
      expect(result).toBeDefined();
      expect(result!.intent).toBe('add_feature');
    });
  });
});
