/**
 * Prediction Cache Tests
 * 
 * Tests for prediction caching and preloading components.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IEmbeddingProvider } from '../../embeddings/interface.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory } from '../../types/index.js';
import type { PredictedMemory, PredictionSignals } from '../../prediction/types.js';
import { PredictionCache } from '../../prediction/cache/prediction-cache.js';
import { EmbeddingPreloader } from '../../prediction/cache/preloader.js';

// Create mock predictions
function createMockPredictions(count: number): PredictedMemory[] {
  return Array.from({ length: count }, (_, i) => ({
    memoryId: `mem${i}`,
    memoryType: 'tribal',
    summary: `Test memory ${i} content`,
    confidence: 0.9 - i * 0.1,
    source: {
      strategy: 'file_based' as const,
      reason: 'Test reason',
      contributingSignals: ['activeFile'],
      confidenceBreakdown: { base: 0.9 },
    },
    relevanceScore: 0.9 - i * 0.1,
    embeddingPreloaded: false,
  }));
}

// Create mock signals
function createMockSignals(): PredictionSignals {
  return {
    file: {
      activeFile: '/src/test.ts',
      recentFiles: [],
      fileType: 'ts',
      filePatterns: ['async-function'],
      fileImports: [],
      fileSymbols: [],
      directory: '/src',
    },
    temporal: {
      timeOfDay: 'morning',
      dayOfWeek: 'monday',
      sessionDuration: 30,
      timeSinceLastQuery: 60,
      isNewSession: false,
    },
    behavioral: {
      recentQueries: ['test query'],
      recentIntents: ['add_feature'],
      frequentMemories: [],
      userPatterns: [],
    },
    git: {
      currentBranch: 'main',
      recentlyModifiedFiles: [],
      recentCommitMessages: [],
      uncommittedFiles: [],
      isFeatureBranch: false,
    },
    gatheredAt: new Date().toISOString(),
  };
}

describe('PredictionCache', () => {
  let cache: PredictionCache;

  beforeEach(() => {
    cache = new PredictionCache();
  });

  describe('basic operations', () => {
    it('should cache and retrieve predictions', async () => {
      const predictions = createMockPredictions(5);
      const signals = createMockSignals();
      const key = 'test_key';

      await cache.set(key, predictions, signals);
      const retrieved = await cache.get(key);

      expect(retrieved).toEqual(predictions);
    });

    it('should return null for missing key', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should cache and retrieve by file', async () => {
      const predictions = createMockPredictions(3);
      const signals = createMockSignals();
      const file = '/src/auth/login.ts';

      await cache.setForFile(file, predictions, signals);
      const retrieved = await cache.getForFile(file);

      expect(retrieved).toEqual(predictions);
    });

    it('should check if key exists', async () => {
      const predictions = createMockPredictions(2);
      const signals = createMockSignals();
      const key = 'exists_key';

      expect(cache.has(key)).toBe(false);
      await cache.set(key, predictions, signals);
      expect(cache.has(key)).toBe(true);
    });
  });

  describe('expiration', () => {
    it('should expire entries after TTL', async () => {
      const predictions = createMockPredictions(2);
      const signals = createMockSignals();
      const key = 'expire_key';

      // Set with very short TTL
      await cache.set(key, predictions, signals, 1); // 1ms TTL

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await cache.get(key);
      expect(result).toBeNull();
    });

    it('should not expire entries before TTL', async () => {
      const predictions = createMockPredictions(2);
      const signals = createMockSignals();
      const key = 'no_expire_key';

      await cache.set(key, predictions, signals, 60000); // 1 minute TTL

      const result = await cache.get(key);
      expect(result).toEqual(predictions);
    });
  });

  describe('invalidation', () => {
    it('should invalidate by file', async () => {
      const predictions = createMockPredictions(2);
      const signals = createMockSignals();
      const file = '/src/test.ts';

      await cache.setForFile(file, predictions, signals);
      cache.invalidateForFile(file);

      const result = await cache.getForFile(file);
      expect(result).toBeNull();
    });

    it('should invalidate by memory ID', async () => {
      const predictions = createMockPredictions(3);
      const signals = createMockSignals();
      const key = 'mem_invalidate_key';

      await cache.set(key, predictions, signals);
      cache.invalidateForMemory('mem1');

      const result = await cache.get(key);
      expect(result).toBeNull();
    });

    it('should clear all entries', async () => {
      const predictions = createMockPredictions(2);
      const signals = createMockSignals();

      await cache.set('key1', predictions, signals);
      await cache.set('key2', predictions, signals);

      cache.clear();

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', async () => {
      const predictions = createMockPredictions(2);
      const signals = createMockSignals();
      const key = 'stats_key';

      await cache.set(key, predictions, signals);

      await cache.get(key); // Hit
      await cache.get(key); // Hit
      await cache.get('nonexistent'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    });

    it('should track total entries', async () => {
      const predictions = createMockPredictions(2);
      const signals = createMockSignals();

      await cache.set('key1', predictions, signals);
      await cache.set('key2', predictions, signals);

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(2);
    });

    it('should record prediction times', () => {
      cache.recordPredictionTime(100);
      cache.recordPredictionTime(200);
      cache.recordPredictionTime(150);

      const stats = cache.getStats();
      expect(stats.avgPredictionTimeMs).toBe(150);
    });

    it('should record embedding preloads', () => {
      cache.recordEmbeddingPreload(5);
      cache.recordEmbeddingPreload(3);

      const stats = cache.getStats();
      expect(stats.embeddingsPreloaded).toBe(8);
    });
  });

  describe('query coverage', () => {
    it('should detect when predictions cover query', () => {
      const predictions = createMockPredictions(3);
      predictions[0]!.summary = 'How to handle authentication errors';

      const covers = cache.predictionsCoverQuery(predictions, 'authentication errors');
      expect(covers).toBe(true);
    });

    it('should detect when predictions do not cover query', () => {
      const predictions = createMockPredictions(3);

      const covers = cache.predictionsCoverQuery(predictions, 'completely unrelated topic');
      expect(covers).toBe(false);
    });

    it('should return false for empty predictions', () => {
      const covers = cache.predictionsCoverQuery([], 'any query');
      expect(covers).toBe(false);
    });
  });

  describe('key generation', () => {
    it('should generate consistent keys for same signals', () => {
      const signals = createMockSignals();
      const key1 = cache.generateKey(signals);
      const key2 = cache.generateKey(signals);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different signals', () => {
      const signals1 = createMockSignals();
      const signals2 = createMockSignals();
      signals2.file.activeFile = '/different/file.ts';

      const key1 = cache.generateKey(signals1);
      const key2 = cache.generateKey(signals2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('eviction', () => {
    it('should evict oldest entries when over limit', async () => {
      const smallCache = new PredictionCache({ maxEntries: 3 });
      const signals = createMockSignals();

      await smallCache.set('key1', createMockPredictions(1), signals);
      await new Promise(resolve => setTimeout(resolve, 10));
      await smallCache.set('key2', createMockPredictions(1), signals);
      await new Promise(resolve => setTimeout(resolve, 10));
      await smallCache.set('key3', createMockPredictions(1), signals);
      await new Promise(resolve => setTimeout(resolve, 10));
      await smallCache.set('key4', createMockPredictions(1), signals);

      // key1 should be evicted
      expect(await smallCache.get('key1')).toBeNull();
      expect(await smallCache.get('key4')).not.toBeNull();
    });
  });

  describe('getAll', () => {
    it('should return all cached entries', async () => {
      const predictions = createMockPredictions(2);
      const signals = createMockSignals();

      await cache.set('key1', predictions, signals);
      await cache.set('key2', predictions, signals);

      const all = cache.getAll();
      expect(all.length).toBe(2);
    });
  });
});

describe('EmbeddingPreloader', () => {
  let preloader: EmbeddingPreloader;
  let mockEmbeddings: IEmbeddingProvider;
  let mockStorage: IMemoryStorage;

  beforeEach(() => {
    mockEmbeddings = {
      name: 'mock',
      dimensions: 768,
      maxTokens: 8192,
      embed: vi.fn(async () => Array(768).fill(0)),
      embedBatch: vi.fn(async (texts: string[]) => texts.map(() => Array(768).fill(0))),
      isAvailable: vi.fn(async () => true),
    };

    const memories: Map<string, Memory> = new Map();
    for (let i = 0; i < 10; i++) {
      memories.set(`mem${i}`, {
        id: `mem${i}`,
        type: 'tribal',
        summary: `Test memory ${i} content`,
        confidence: 0.9,
        importance: 'normal',
        accessCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        transactionTime: { recordedAt: new Date().toISOString() },
        validTime: { validFrom: new Date().toISOString() },
        topic: 'test',
        knowledge: `Test memory ${i} content`,
        severity: 'info',
        source: { type: 'manual' },
      } as Memory);
    }

    mockStorage = {
      read: vi.fn(async (id: string) => memories.get(id) ?? null),
    } as unknown as IMemoryStorage;

    preloader = new EmbeddingPreloader(mockEmbeddings, mockStorage);
  });

  describe('preload', () => {
    it('should preload embeddings for predictions', async () => {
      const predictions = createMockPredictions(5);
      const result = await preloader.preload(predictions);

      expect(result.preloaded).toBeGreaterThan(0);
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });

    it('should mark predictions as preloaded', async () => {
      const predictions = createMockPredictions(3);
      await preloader.preload(predictions);

      for (const prediction of predictions) {
        expect(prediction.embeddingPreloaded).toBe(true);
      }
    });

    it('should filter by minimum confidence', async () => {
      const predictions = createMockPredictions(5);
      predictions[4]!.confidence = 0.1; // Below default threshold

      const lowConfPreloader = new EmbeddingPreloader(mockEmbeddings, mockStorage, {
        minConfidence: 0.5,
      });

      await lowConfPreloader.preload(predictions);

      // Low confidence prediction should not be preloaded
      expect(predictions[4]!.embeddingPreloaded).toBe(false);
    });

    it('should not re-preload already preloaded memories', async () => {
      const predictions = createMockPredictions(3);
      
      await preloader.preload(predictions);
      const firstCallCount = (mockEmbeddings.embed as ReturnType<typeof vi.fn>).mock.calls.length;

      await preloader.preload(predictions);
      const secondCallCount = (mockEmbeddings.embed as ReturnType<typeof vi.fn>).mock.calls.length;

      // Should not have made additional calls
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should handle missing memories gracefully', async () => {
      const predictions = createMockPredictions(3);
      predictions[1]!.memoryId = 'nonexistent';

      const result = await preloader.preload(predictions);
      expect(result.failed).toBe(1);
    });
  });

  describe('queue operations', () => {
    it('should queue memories for background preload', () => {
      // Disable background preload for this test
      const noBackgroundPreloader = new EmbeddingPreloader(mockEmbeddings, mockStorage, {
        backgroundPreload: false,
      });
      noBackgroundPreloader.queueForPreload(['mem1', 'mem2', 'mem3']);
      expect(noBackgroundPreloader.getQueueLength()).toBe(3);
    });

    it('should not queue already preloaded memories', async () => {
      // Disable background preload for this test
      const noBackgroundPreloader = new EmbeddingPreloader(mockEmbeddings, mockStorage, {
        backgroundPreload: false,
      });
      const predictions = createMockPredictions(2);
      await noBackgroundPreloader.preload(predictions);

      noBackgroundPreloader.queueForPreload(['mem0', 'mem1', 'mem5']);
      // mem0 and mem1 are already preloaded
      expect(noBackgroundPreloader.getQueueLength()).toBe(1);
    });

    it('should not queue duplicates', () => {
      // Disable background preload for this test
      const noBackgroundPreloader = new EmbeddingPreloader(mockEmbeddings, mockStorage, {
        backgroundPreload: false,
      });
      noBackgroundPreloader.queueForPreload(['mem1', 'mem2']);
      noBackgroundPreloader.queueForPreload(['mem2', 'mem3']);
      expect(noBackgroundPreloader.getQueueLength()).toBe(3);
    });
  });

  describe('state management', () => {
    it('should track preloaded IDs', async () => {
      const predictions = createMockPredictions(3);
      await preloader.preload(predictions);

      expect(preloader.isPreloaded('mem0')).toBe(true);
      expect(preloader.isPreloaded('mem1')).toBe(true);
      expect(preloader.isPreloaded('nonexistent')).toBe(false);
    });

    it('should get all preloaded IDs', async () => {
      const predictions = createMockPredictions(3);
      await preloader.preload(predictions);

      const ids = preloader.getPreloadedIds();
      expect(ids).toContain('mem0');
      expect(ids).toContain('mem1');
      expect(ids).toContain('mem2');
    });

    it('should clear preloaded state', async () => {
      const predictions = createMockPredictions(3);
      await preloader.preload(predictions);

      preloader.clear();

      expect(preloader.isPreloaded('mem0')).toBe(false);
      expect(preloader.getPreloadedIds().length).toBe(0);
    });

    it('should invalidate specific memory', async () => {
      const predictions = createMockPredictions(3);
      await preloader.preload(predictions);

      preloader.invalidate('mem1');

      expect(preloader.isPreloaded('mem0')).toBe(true);
      expect(preloader.isPreloaded('mem1')).toBe(false);
      expect(preloader.isPreloaded('mem2')).toBe(true);
    });
  });

  describe('batching', () => {
    it('should respect batch size', async () => {
      const smallBatchPreloader = new EmbeddingPreloader(mockEmbeddings, mockStorage, {
        maxBatchSize: 2,
        batchDelayMs: 0,
      });

      const predictions = createMockPredictions(5);
      await smallBatchPreloader.preload(predictions);

      // Should have processed in batches
      expect((mockEmbeddings.embed as ReturnType<typeof vi.fn>).mock.calls.length).toBe(5);
    });
  });
});
