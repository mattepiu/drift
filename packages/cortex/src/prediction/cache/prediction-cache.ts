/**
 * Prediction Cache
 * 
 * Caches predictions for fast retrieval.
 * Enables efficient prediction reuse when
 * context hasn't changed significantly.
 * 
 * @module prediction/cache/prediction-cache
 */

import type {
  PredictedMemory,
  CachedPrediction,
  PredictionCacheStats,
  PredictionSignals,
} from '../types.js';
import { createHash } from 'crypto';

/**
 * Configuration for prediction cache
 */
export interface PredictionCacheConfig {
  /** Maximum cache entries */
  maxEntries: number;
  /** Default TTL in milliseconds */
  defaultTtlMs: number;
  /** Whether to use file-based cache keys */
  useFileBasedKeys: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PredictionCacheConfig = {
  maxEntries: 100,
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  useFileBasedKeys: true,
};

/**
 * Prediction Cache
 * 
 * Caches predictions for fast retrieval.
 */
export class PredictionCache {
  private config: PredictionCacheConfig;
  private cache: Map<string, CachedPrediction> = new Map();
  private stats: PredictionCacheStats = {
    totalEntries: 0,
    hits: 0,
    misses: 0,
    hitRate: 0,
    avgPredictionTimeMs: 0,
    embeddingsPreloaded: 0,
  };
  private predictionTimes: number[] = [];

  constructor(config?: Partial<PredictionCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get cached predictions for a file
   */
  async getForFile(file: string): Promise<PredictedMemory[] | null> {
    const key = this.generateFileKey(file);
    return this.get(key);
  }

  /**
   * Get cached predictions by key
   */
  async get(key: string): Promise<PredictedMemory[] | null> {
    const cached = this.cache.get(key);

    if (!cached) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if expired
    if (new Date(cached.expiresAt) < new Date()) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.totalEntries = this.cache.size;
      this.updateHitRate();
      return null;
    }

    this.stats.hits++;
    this.updateHitRate();
    return cached.predictions;
  }

  /**
   * Cache predictions
   */
  async set(
    key: string,
    predictions: PredictedMemory[],
    signals: PredictionSignals,
    ttlMs?: number
  ): Promise<void> {
    const now = new Date();
    const ttl = ttlMs ?? this.config.defaultTtlMs;
    const expiresAt = new Date(now.getTime() + ttl);

    const cached: CachedPrediction = {
      key,
      predictions,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      signals,
    };

    this.cache.set(key, cached);
    this.stats.totalEntries = this.cache.size;

    // Evict old entries if over limit
    if (this.cache.size > this.config.maxEntries) {
      this.evictOldest();
    }
  }

  /**
   * Cache predictions for a file
   */
  async setForFile(
    file: string,
    predictions: PredictedMemory[],
    signals: PredictionSignals,
    ttlMs?: number
  ): Promise<void> {
    const key = this.generateFileKey(file);
    await this.set(key, predictions, signals, ttlMs);
  }

  /**
   * Handle file opened event
   */
  async onFileOpened(file: string): Promise<PredictedMemory[] | null> {
    return this.getForFile(file);
  }

  /**
   * Check if predictions cover a query
   */
  predictionsCoverQuery(
    predictions: PredictedMemory[],
    query: string
  ): boolean {
    if (predictions.length === 0) {
      return false;
    }

    // Check if any prediction summary contains query terms
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    for (const prediction of predictions) {
      const summary = prediction.summary.toLowerCase();
      const matchCount = queryTerms.filter(term => summary.includes(term)).length;
      
      // If more than half the query terms match, consider it covered
      if (matchCount >= queryTerms.length / 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Invalidate cache for a file
   */
  invalidateForFile(file: string): void {
    const key = this.generateFileKey(file);
    this.cache.delete(key);
    this.stats.totalEntries = this.cache.size;
  }

  /**
   * Invalidate cache entries containing a memory
   */
  invalidateForMemory(memoryId: string): void {
    const keysToDelete: string[] = [];

    for (const [key, cached] of this.cache) {
      if (cached.predictions.some(p => p.memoryId === memoryId)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    this.stats.totalEntries = this.cache.size;
  }

  /**
   * Record prediction time for stats
   */
  recordPredictionTime(timeMs: number): void {
    this.predictionTimes.push(timeMs);

    // Keep last 100 times
    if (this.predictionTimes.length > 100) {
      this.predictionTimes.shift();
    }

    // Update average
    const sum = this.predictionTimes.reduce((a, b) => a + b, 0);
    this.stats.avgPredictionTimeMs = sum / this.predictionTimes.length;
  }

  /**
   * Record embedding preload
   */
  recordEmbeddingPreload(count: number): void {
    this.stats.embeddingsPreloaded += count;
  }

  /**
   * Get cache statistics
   */
  getStats(): PredictionCacheStats {
    return { ...this.stats };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.stats.totalEntries = 0;
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.hitRate = 0;
    this.predictionTimes = [];
  }

  /**
   * Get all cached entries
   */
  getAll(): CachedPrediction[] {
    return Array.from(this.cache.values());
  }

  /**
   * Check if cache has entry for key
   */
  has(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;

    // Check if expired
    if (new Date(cached.expiresAt) < new Date()) {
      this.cache.delete(key);
      this.stats.totalEntries = this.cache.size;
      return false;
    }

    return true;
  }

  /**
   * Generate cache key from signals
   */
  generateKey(signals: PredictionSignals): string {
    const keyData = {
      file: signals.file.activeFile,
      patterns: signals.file.filePatterns.slice(0, 5),
      timeOfDay: signals.temporal.timeOfDay,
      intents: signals.behavioral.recentIntents.slice(0, 3),
    };

    const hash = createHash('md5')
      .update(JSON.stringify(keyData))
      .digest('hex');

    return `pred_${hash}`;
  }

  // Private helpers

  private generateFileKey(file: string): string {
    const hash = createHash('md5').update(file).digest('hex').substring(0, 16);
    return `file_${hash}`;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private evictOldest(): void {
    // Find oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, cached] of this.cache) {
      const cachedTime = new Date(cached.cachedAt).getTime();
      if (cachedTime < oldestTime) {
        oldestTime = cachedTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.totalEntries = this.cache.size;
    }
  }
}
