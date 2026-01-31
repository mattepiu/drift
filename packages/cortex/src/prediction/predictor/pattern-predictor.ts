/**
 * Pattern-Based Predictor
 * 
 * Predicts memories based on detected code patterns.
 * Uses pattern rationales and related tribal knowledge
 * to predict relevant memories.
 * 
 * @module prediction/predictor/pattern-predictor
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory } from '../../types/index.js';
import type { PredictedMemory, PredictionSource } from '../types.js';

/**
 * Configuration for pattern-based predictor
 */
export interface PatternBasedPredictorConfig {
  /** Maximum predictions to return */
  maxPredictions: number;
  /** Confidence for pattern rationale memories */
  rationaleConfidence: number;
  /** Confidence for tribal knowledge memories */
  tribalConfidence: number;
  /** Confidence for related pattern memories */
  relatedPatternConfidence: number;
  /** Maximum patterns to process */
  maxPatterns: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PatternBasedPredictorConfig = {
  maxPredictions: 15,
  rationaleConfidence: 0.85,
  tribalConfidence: 0.75,
  relatedPatternConfidence: 0.6,
  maxPatterns: 10,
};

/**
 * Pattern-Based Predictor
 * 
 * Predicts memories based on detected code patterns.
 */
export class PatternBasedPredictor {
  private config: PatternBasedPredictorConfig;
  private storage: IMemoryStorage;

  constructor(storage: IMemoryStorage, config?: Partial<PatternBasedPredictorConfig>) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Predict memories based on detected patterns
   */
  async predict(patterns: string[]): Promise<PredictedMemory[]> {
    const predictions: PredictedMemory[] = [];
    const processedPatterns = patterns.slice(0, this.config.maxPatterns);

    for (const pattern of processedPatterns) {
      // Get pattern rationale memories
      const rationales = await this.getPatternRationales(pattern);
      for (const memory of rationales) {
        // Skip if already predicted
        if (predictions.some(p => p.memoryId === memory.id)) continue;

        predictions.push(this.createPrediction(
          memory,
          this.config.rationaleConfidence,
          'pattern_based',
          `Rationale for pattern: ${pattern}`,
          [pattern]
        ));
      }

      // Get related tribal knowledge
      const tribal = await this.getRelatedTribal(pattern);
      for (const memory of tribal) {
        // Skip if already predicted
        if (predictions.some(p => p.memoryId === memory.id)) continue;

        predictions.push(this.createPrediction(
          memory,
          this.config.tribalConfidence,
          'pattern_based',
          `Tribal knowledge for: ${pattern}`,
          [pattern]
        ));
      }
    }

    // Get memories related to pattern combinations
    if (processedPatterns.length > 1) {
      const combinedMemories = await this.getPatternCombinationMemories(processedPatterns);
      for (const memory of combinedMemories) {
        // Skip if already predicted
        if (predictions.some(p => p.memoryId === memory.id)) continue;

        predictions.push(this.createPrediction(
          memory,
          this.config.relatedPatternConfidence,
          'pattern_based',
          `Related to pattern combination`,
          processedPatterns
        ));
      }
    }

    // Sort by confidence and limit
    predictions.sort((a, b) => b.confidence - a.confidence);
    return predictions.slice(0, this.config.maxPredictions);
  }

  /**
   * Get pattern rationale memories
   */
  private async getPatternRationales(pattern: string): Promise<Memory[]> {
    try {
      // Search for pattern rationale memories with matching tags
      const results = await this.storage.search({
        types: ['pattern_rationale'],
        tags: [pattern],
        limit: 5,
      });

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get related tribal knowledge
   */
  private async getRelatedTribal(pattern: string): Promise<Memory[]> {
    try {
      // Search for tribal memories with matching topics
      const results = await this.storage.search({
        types: ['tribal'],
        topics: [pattern],
        limit: 5,
      });

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get memories related to pattern combinations
   */
  private async getPatternCombinationMemories(patterns: string[]): Promise<Memory[]> {
    try {
      // Search for memories with multiple pattern tags
      const results = await this.storage.search({
        tags: patterns.slice(0, 3),
        limit: 10,
      });

      // Filter to memories that have multiple matching tags
      return results.filter(memory => {
        const memoryTags = memory.tags ?? [];
        let matchCount = 0;
        for (const pattern of patterns) {
          if (memoryTags.includes(pattern)) {
            matchCount++;
          }
        }
        return matchCount >= 2;
      });
    } catch {
      return [];
    }
  }

  /**
   * Create a prediction from a memory
   */
  private createPrediction(
    memory: Memory,
    confidence: number,
    strategy: 'pattern_based',
    reason: string,
    contributingSignals: string[]
  ): PredictedMemory {
    const source: PredictionSource = {
      strategy,
      reason,
      contributingSignals,
      confidenceBreakdown: {
        base: confidence,
        typeBoost: this.getTypeBoost(memory.type),
        confidenceBoost: this.getConfidenceBoost(memory),
      },
    };

    // Calculate final confidence with boosts
    const finalConfidence = Math.min(
      confidence +
        source.confidenceBreakdown['typeBoost']! +
        source.confidenceBreakdown['confidenceBoost']!,
      1.0
    );

    return {
      memoryId: memory.id,
      memoryType: memory.type,
      summary: memory.summary.substring(0, 100),
      confidence: finalConfidence,
      source,
      relevanceScore: finalConfidence,
      embeddingPreloaded: false,
    };
  }

  /**
   * Get boost based on memory type
   */
  private getTypeBoost(type: string): number {
    const typeBoosts: Record<string, number> = {
      pattern_rationale: 0.1,
      tribal: 0.08,
      code_smell: 0.05,
      constraint_override: 0.05,
      decision_context: 0.03,
    };

    return typeBoosts[type] ?? 0;
  }

  /**
   * Get boost based on memory confidence
   */
  private getConfidenceBoost(memory: Memory): number {
    const memoryConfidence = memory.confidence ?? 0.5;

    if (memoryConfidence >= 0.9) return 0.05;
    if (memoryConfidence >= 0.7) return 0.02;
    return 0;
  }
}
