/**
 * Decay Integrator
 * 
 * Integrates confidence calibration with the existing decay system.
 * Provides a unified interface for confidence management.
 * 
 * @module learning/confidence/decay-integrator
 */

import type { Memory } from '../../types/memory.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import { ConfidenceCalibrator } from './calibrator.js';
import { MetricsCalculator } from './metrics.js';

/**
 * Decay configuration
 */
export interface DecayConfig {
  /** Enable automatic decay */
  enableAutoDecay: boolean;
  /** Interval for decay checks in hours */
  decayCheckIntervalHours: number;
  /** Minimum confidence before archival */
  archivalThreshold: number;
  /** Enable validation prompts */
  enableValidationPrompts: boolean;
}

/**
 * Default decay configuration
 */
const DEFAULT_DECAY_CONFIG: DecayConfig = {
  enableAutoDecay: true,
  decayCheckIntervalHours: 24,
  archivalThreshold: 0.1,
  enableValidationPrompts: true,
};

/**
 * Decay result for a memory
 */
export interface DecayResult {
  /** Memory ID */
  memoryId: string;
  /** Previous confidence */
  previousConfidence: number;
  /** New confidence */
  newConfidence: number;
  /** Whether memory should be archived */
  shouldArchive: boolean;
  /** Whether validation is recommended */
  needsValidation: boolean;
  /** Validation reason if applicable */
  validationReason?: string;
}

/**
 * Decay Integrator
 * 
 * Manages confidence decay and integrates with the calibration system.
 */
export class DecayIntegrator {
  private config: DecayConfig;
  private calibrator: ConfidenceCalibrator;
  private metricsCalculator: MetricsCalculator;

  constructor(
    private storage: IMemoryStorage,
    config: Partial<DecayConfig> = {}
  ) {
    this.config = { ...DEFAULT_DECAY_CONFIG, ...config };
    this.calibrator = new ConfidenceCalibrator();
    this.metricsCalculator = new MetricsCalculator(storage);
  }

  /**
   * Process decay for a single memory
   */
  async processDecay(memoryId: string): Promise<DecayResult> {
    const memory = await this.storage.read(memoryId);
    if (!memory) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const previousConfidence = memory.confidence;

    // Get metrics and calculate new confidence
    const metrics = await this.metricsCalculator.getMetrics(memoryId);
    const calculated = this.calibrator.calculate(memory, metrics);

    // Determine if archival is needed
    const shouldArchive = calculated.confidence < this.config.archivalThreshold;

    // Update memory if confidence changed significantly
    if (Math.abs(calculated.confidence - previousConfidence) > 0.01) {
      await this.storage.update(memoryId, {
        confidence: calculated.confidence,
        updatedAt: new Date().toISOString(),
      });
    }

    const result: DecayResult = {
      memoryId,
      previousConfidence,
      newConfidence: calculated.confidence,
      shouldArchive,
      needsValidation: calculated.needsValidation,
    };
    
    if (calculated.validationReason) {
      result.validationReason = calculated.validationReason;
    }

    return result;
  }

  /**
   * Process decay for all memories
   */
  async processAllDecay(): Promise<DecayResult[]> {
    const results: DecayResult[] = [];

    // Get all non-archived memories
    const memories = await this.storage.search({
      includeArchived: false,
      limit: 10000,
    });

    for (const memory of memories) {
      try {
        const result = await this.processDecay(memory.id);
        results.push(result);

        // Archive if needed
        if (result.shouldArchive) {
          await this.archiveMemory(memory.id, 'confidence_decay');
        }
      } catch (error) {
        // Log error but continue processing
        console.error(`Error processing decay for ${memory.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Get memories needing validation
   */
  async getValidationCandidates(limit: number = 10): Promise<Memory[]> {
    const candidates: Array<{ memory: Memory; priority: number }> = [];

    const memories = await this.storage.search({
      includeArchived: false,
      limit: 1000,
    });

    for (const memory of memories) {
      try {
        const metrics = await this.metricsCalculator.getMetrics(memory.id);
        const calculated = this.calibrator.calculate(memory, metrics);

        if (calculated.needsValidation) {
          // Calculate priority based on importance and confidence
          const importancePriority = this.getImportancePriority(memory.importance);
          const confidencePriority = 1 - calculated.confidence;
          const priority = importancePriority * 0.6 + confidencePriority * 0.4;

          candidates.push({ memory, priority });
        }
      } catch {
        // Skip memories that can't be processed
      }
    }

    // Sort by priority and return top candidates
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates.slice(0, limit).map(c => c.memory);
  }

  /**
   * Boost confidence after validation
   */
  async boostConfidence(
    memoryId: string,
    action: 'confirm' | 'reject' | 'modify'
  ): Promise<void> {
    const memory = await this.storage.read(memoryId);
    if (!memory) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    let newConfidence = memory.confidence;

    switch (action) {
      case 'confirm':
        // Boost confidence by 20%, max 1.0
        newConfidence = Math.min(1.0, memory.confidence + 0.2);
        break;

      case 'reject':
        // Reduce confidence by 50%
        newConfidence = memory.confidence * 0.5;
        break;

      case 'modify':
        // Slight boost for modification (user engaged)
        newConfidence = Math.min(1.0, memory.confidence + 0.1);
        break;
    }

    await this.storage.update(memoryId, {
      confidence: newConfidence,
      lastValidated: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Archive a memory
   */
  async archiveMemory(memoryId: string, reason: string): Promise<void> {
    await this.storage.update(memoryId, {
      archived: true,
      archiveReason: reason,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Restore an archived memory
   */
  async restoreMemory(memoryId: string): Promise<void> {
    await this.storage.update(memoryId, {
      archived: false,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Get decay statistics
   */
  async getDecayStats(): Promise<{
    totalMemories: number;
    lowConfidence: number;
    needsValidation: number;
    archived: number;
    averageConfidence: number;
  }> {
    const allMemories = await this.storage.search({
      includeArchived: true,
      limit: 10000,
    });

    const activeMemories = allMemories.filter(m => !m.archived);
    const archivedMemories = allMemories.filter(m => m.archived);

    let lowConfidence = 0;
    let needsValidation = 0;
    let totalConfidence = 0;

    for (const memory of activeMemories) {
      totalConfidence += memory.confidence;

      if (memory.confidence < 0.5) {
        lowConfidence++;
      }

      if (this.calibrator.shouldAskUser(memory, memory.confidence)) {
        needsValidation++;
      }
    }

    return {
      totalMemories: activeMemories.length,
      lowConfidence,
      needsValidation,
      archived: archivedMemories.length,
      averageConfidence: activeMemories.length > 0
        ? totalConfidence / activeMemories.length
        : 0,
    };
  }

  /**
   * Get importance priority value
   */
  private getImportancePriority(importance: string): number {
    const priorities: Record<string, number> = {
      critical: 1.0,
      high: 0.75,
      normal: 0.5,
      low: 0.25,
    };
    return priorities[importance] || 0.5;
  }

  /**
   * Create integrator with default dependencies
   */
  static create(
    storage: IMemoryStorage,
    config?: Partial<DecayConfig>
  ): DecayIntegrator {
    return new DecayIntegrator(storage, config);
  }
}
