/**
 * Embedding Preloader
 * 
 * Preloads embeddings for predicted memories.
 * Ensures embeddings are ready when memories
 * are actually needed for retrieval.
 * 
 * @module prediction/cache/preloader
 */

import type { IEmbeddingProvider } from '../../embeddings/interface.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { PredictedMemory } from '../types.js';

/**
 * Configuration for embedding preloader
 */
export interface EmbeddingPreloaderConfig {
  /** Maximum memories to preload at once */
  maxBatchSize: number;
  /** Minimum confidence to preload */
  minConfidence: number;
  /** Whether to preload in background */
  backgroundPreload: boolean;
  /** Delay between batches in ms */
  batchDelayMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: EmbeddingPreloaderConfig = {
  maxBatchSize: 10,
  minConfidence: 0.5,
  backgroundPreload: true,
  batchDelayMs: 100,
};

/**
 * Preload result
 */
export interface PreloadResult {
  /** Number of embeddings preloaded */
  preloaded: number;
  /** Number of embeddings already cached */
  alreadyCached: number;
  /** Number of failures */
  failed: number;
  /** Total time in ms */
  timeMs: number;
}

/**
 * Embedding Preloader
 * 
 * Preloads embeddings for predicted memories.
 */
export class EmbeddingPreloader {
  private config: EmbeddingPreloaderConfig;
  private embeddings: IEmbeddingProvider;
  private storage: IMemoryStorage;
  private preloadedIds: Set<string> = new Set();
  private preloadQueue: string[] = [];
  private isPreloading = false;

  constructor(
    embeddings: IEmbeddingProvider,
    storage: IMemoryStorage,
    config?: Partial<EmbeddingPreloaderConfig>
  ) {
    this.embeddings = embeddings;
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Preload embeddings for predictions
   */
  async preload(predictions: PredictedMemory[]): Promise<PreloadResult> {
    const startTime = Date.now();
    let preloaded = 0;
    let alreadyCached = 0;
    let failed = 0;

    // Filter predictions by confidence
    const toPreload = predictions
      .filter(p => p.confidence >= this.config.minConfidence)
      .filter(p => !this.preloadedIds.has(p.memoryId));

    if (toPreload.length === 0) {
      return {
        preloaded: 0,
        alreadyCached: predictions.length,
        failed: 0,
        timeMs: Date.now() - startTime,
      };
    }

    // Preload in batches
    const batches = this.createBatches(toPreload);

    for (const batch of batches) {
      const result = await this.preloadBatch(batch.map(p => p.memoryId));
      preloaded += result.preloaded;
      alreadyCached += result.alreadyCached;
      failed += result.failed;

      // Mark as preloaded
      for (const prediction of batch) {
        if (!this.preloadedIds.has(prediction.memoryId)) {
          this.preloadedIds.add(prediction.memoryId);
          prediction.embeddingPreloaded = true;
        }
      }

      // Delay between batches if configured
      if (this.config.batchDelayMs > 0 && batches.indexOf(batch) < batches.length - 1) {
        await this.delay(this.config.batchDelayMs);
      }
    }

    return {
      preloaded,
      alreadyCached,
      failed,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Preload a batch of memory IDs
   */
  private async preloadBatch(memoryIds: string[]): Promise<{
    preloaded: number;
    alreadyCached: number;
    failed: number;
  }> {
    let preloaded = 0;
    let alreadyCached = 0;
    let failed = 0;

    for (const memoryId of memoryIds) {
      try {
        // Get memory content
        const memory = await this.storage.read(memoryId);
        if (!memory) {
          failed++;
          continue;
        }

        // Generate embedding using summary (this will cache it)
        await this.embeddings.embed(memory.summary);
        preloaded++;
      } catch {
        failed++;
      }
    }

    return { preloaded, alreadyCached, failed };
  }

  /**
   * Queue memories for background preloading
   */
  queueForPreload(memoryIds: string[]): void {
    for (const id of memoryIds) {
      if (!this.preloadedIds.has(id) && !this.preloadQueue.includes(id)) {
        this.preloadQueue.push(id);
      }
    }

    // Start background preloading if not already running
    // Use setImmediate to allow queue length to be checked before processing starts
    if (this.config.backgroundPreload && !this.isPreloading) {
      setImmediate(() => this.startBackgroundPreload());
    }
  }

  /**
   * Start background preloading
   */
  private async startBackgroundPreload(): Promise<void> {
    if (this.isPreloading) return;
    this.isPreloading = true;

    while (this.preloadQueue.length > 0) {
      const batch = this.preloadQueue.splice(0, this.config.maxBatchSize);
      await this.preloadBatch(batch);

      // Mark as preloaded
      for (const id of batch) {
        this.preloadedIds.add(id);
      }

      // Delay between batches
      if (this.preloadQueue.length > 0 && this.config.batchDelayMs > 0) {
        await this.delay(this.config.batchDelayMs);
      }
    }

    this.isPreloading = false;
  }

  /**
   * Check if a memory's embedding is preloaded
   */
  isPreloaded(memoryId: string): boolean {
    return this.preloadedIds.has(memoryId);
  }

  /**
   * Get preloaded memory IDs
   */
  getPreloadedIds(): string[] {
    return Array.from(this.preloadedIds);
  }

  /**
   * Get preload queue length
   */
  getQueueLength(): number {
    return this.preloadQueue.length;
  }

  /**
   * Check if background preloading is active
   */
  isBackgroundPreloading(): boolean {
    return this.isPreloading;
  }

  /**
   * Clear preloaded cache
   */
  clear(): void {
    this.preloadedIds.clear();
    this.preloadQueue = [];
  }

  /**
   * Remove a memory from preloaded set
   */
  invalidate(memoryId: string): void {
    this.preloadedIds.delete(memoryId);
  }

  // Private helpers

  private createBatches(predictions: PredictedMemory[]): PredictedMemory[][] {
    const batches: PredictedMemory[][] = [];

    for (let i = 0; i < predictions.length; i += this.config.maxBatchSize) {
      batches.push(predictions.slice(i, i + this.config.maxBatchSize));
    }

    return batches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
