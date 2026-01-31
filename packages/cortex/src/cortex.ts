/**
 * Drift Cortex
 * 
 * Main entry point for the memory system.
 * Provides a unified interface for all memory operations.
 */

import type { Memory, MemoryQuery, CoreMemory } from './types/index.js';
import type { IMemoryStorage } from './storage/interface.js';
import type { IEmbeddingProvider } from './embeddings/interface.js';
import { createStorage, autoDetectStorage, type StorageConfig } from './storage/factory.js';
import { createEmbeddingProvider, autoDetectEmbeddingProvider, type EmbeddingConfig } from './embeddings/factory.js';
import { RetrievalEngine, type RetrievalContext, type RetrievalResult } from './retrieval/engine.js';
import { ConsolidationEngine, type ConsolidationResult, type ConsolidationConfig } from './consolidation/engine.js';
import { ConsolidationScheduler, type SchedulerConfig } from './consolidation/scheduler.js';
import { ValidationEngine, type ValidationResult } from './validation/engine.js';
import { DecayCalculator, type DecayFactors } from './decay/calculator.js';

/**
 * Cortex configuration
 */
export interface CortexConfig {
  /** Storage configuration */
  storage?: StorageConfig;
  /** Embedding configuration */
  embeddings?: EmbeddingConfig;
  /** Consolidation configuration */
  consolidation?: Partial<ConsolidationConfig>;
  /** Scheduler configuration */
  scheduler?: Partial<SchedulerConfig>;
  /** Auto-initialize on creation */
  autoInitialize?: boolean;
}

/**
 * Cortex instance
 */
export class Cortex {
  /** Storage backend */
  readonly storage: IMemoryStorage;
  /** Embedding provider */
  readonly embeddings: IEmbeddingProvider;
  /** Retrieval engine */
  readonly retrieval: RetrievalEngine;
  /** Consolidation engine */
  readonly consolidation: ConsolidationEngine;
  /** Validation engine */
  readonly validation: ValidationEngine;
  /** Decay calculator */
  readonly decay: DecayCalculator;
  /** Consolidation scheduler */
  readonly scheduler: ConsolidationScheduler;

  private initialized = false;

  private constructor(
    storage: IMemoryStorage,
    embeddings: IEmbeddingProvider,
    consolidationConfig?: Partial<ConsolidationConfig>,
    schedulerConfig?: Partial<SchedulerConfig>
  ) {
    this.storage = storage;
    this.embeddings = embeddings;
    this.retrieval = new RetrievalEngine(storage, embeddings);
    this.consolidation = new ConsolidationEngine(storage, consolidationConfig);
    this.validation = new ValidationEngine(storage);
    this.decay = new DecayCalculator();
    this.scheduler = new ConsolidationScheduler(this.consolidation, schedulerConfig);
  }

  /**
   * Create a new Cortex instance
   */
  static async create(config?: CortexConfig): Promise<Cortex> {
    // Create storage
    const storage = config?.storage
      ? await createStorage(config.storage)
      : await autoDetectStorage();

    // Create embedding provider
    const embeddings = config?.embeddings
      ? await createEmbeddingProvider(config.embeddings)
      : await autoDetectEmbeddingProvider();

    const cortex = new Cortex(
      storage,
      embeddings,
      config?.consolidation,
      config?.scheduler
    );

    if (config?.autoInitialize !== false) {
      await cortex.initialize();
    }

    return cortex;
  }

  /**
   * Initialize the Cortex
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.storage.initialize();
    await this.embeddings.initialize();

    this.initialized = true;
  }

  /**
   * Close the Cortex
   */
  async close(): Promise<void> {
    this.scheduler.stop();
    await this.storage.close();
  }

  // Convenience methods

  /**
   * Add a new memory
   */
  async add(memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'transactionTime' | 'validTime'>): Promise<string> {
    const now = new Date().toISOString();
    const fullMemory = {
      ...memory,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      transactionTime: { recordedAt: now },
      validTime: { validFrom: now },
    } as Memory;

    const id = await this.storage.create(fullMemory);

    // Generate embedding
    const text = this.getEmbeddingText(fullMemory);
    if (text) {
      try {
        const embedding = await this.embeddings.embed(text);
        await this.storage.upsertEmbedding(id, embedding);
      } catch {
        // Embedding generation failed, continue without it
      }
    }

    return id;
  }

  /**
   * Get a memory by ID
   */
  async get(id: string): Promise<Memory | null> {
    return this.storage.read(id);
  }

  /**
   * Update a memory
   */
  async update(id: string, updates: Partial<Memory>): Promise<void> {
    return this.storage.update(id, updates);
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<void> {
    return this.storage.delete(id);
  }

  /**
   * Search memories
   */
  async search(query: MemoryQuery): Promise<Memory[]> {
    return this.storage.search(query);
  }

  /**
   * Retrieve memories for a context
   */
  async retrieve(context: RetrievalContext): Promise<RetrievalResult> {
    return this.retrieval.retrieve(context);
  }

  /**
   * Run consolidation
   */
  async consolidate(dryRun = false): Promise<ConsolidationResult> {
    return this.consolidation.consolidate(dryRun);
  }

  /**
   * Run validation
   */
  async validate(options: { scope: 'all' | 'stale' | 'recent'; autoHeal: boolean }): Promise<ValidationResult> {
    return this.validation.validate(options);
  }

  /**
   * Calculate decay for a memory
   */
  calculateDecay(memory: Memory): DecayFactors {
    return this.decay.calculate(memory);
  }

  /**
   * Get core memory
   */
  async getCoreMemory(): Promise<CoreMemory | null> {
    const cores = await this.storage.findByType('core', { limit: 1 });
    return (cores[0] as CoreMemory) || null;
  }

  /**
   * Get average confidence across all memories
   */
  async getAverageConfidence(): Promise<number> {
    const memories = await this.storage.search({ limit: 1000 });
    if (memories.length === 0) return 1.0;

    const sum = memories.reduce((acc, m) => acc + m.confidence, 0);
    return sum / memories.length;
  }

  /**
   * Get last consolidation date
   */
  async getLastConsolidationDate(): Promise<string | null> {
    return this.scheduler.getLastRun()?.toISOString() ?? null;
  }

  /**
   * Get last validation date
   */
  async getLastValidationDate(): Promise<string | null> {
    // Would need to track this in storage
    return null;
  }

  /**
   * Start the consolidation scheduler
   */
  startScheduler(): void {
    this.scheduler.start();
  }

  /**
   * Stop the consolidation scheduler
   */
  stopScheduler(): void {
    this.scheduler.stop();
  }

  // Private helpers

  private getEmbeddingText(memory: Memory): string | null {
    switch (memory.type) {
      case 'tribal':
        return `${memory.topic}: ${memory.knowledge}`;
      case 'procedural':
        return `${memory.name}: ${memory.description}`;
      case 'semantic':
        return `${memory.topic}: ${memory.knowledge}`;
      case 'pattern_rationale':
        return `${memory.patternName}: ${memory.rationale}`;
      case 'constraint_override':
        return `${memory.constraintName}: ${memory.reason}`;
      case 'code_smell':
        return `${memory.name}: ${memory.description}`;
      case 'decision_context':
        return `${memory.decisionSummary}: ${memory.businessContext || ''}`;
      case 'episodic':
        return `${memory.context.focus || ''}: ${memory.interaction.userQuery}`;
      case 'core':
        return `${memory.project.name}: ${memory.project.description || ''}`;
      default:
        return (memory as Memory).summary;
    }
  }
}

// Singleton instance
let instance: Cortex | null = null;

/**
 * Get the global Cortex instance
 */
export async function getCortex(config?: CortexConfig): Promise<Cortex> {
  if (!instance) {
    instance = await Cortex.create(config);
  }
  return instance;
}

/**
 * Reset the global Cortex instance
 */
export async function resetCortex(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
