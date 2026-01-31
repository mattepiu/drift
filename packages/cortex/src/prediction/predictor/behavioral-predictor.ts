/**
 * Behavioral Predictor
 * 
 * Predicts memories based on user behavior patterns.
 * Uses recent queries, intents, and usage patterns
 * to predict relevant memories.
 * 
 * @module prediction/predictor/behavioral-predictor
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory } from '../../types/index.js';
import type { BehavioralSignals, Intent, PredictedMemory, PredictionSource } from '../types.js';

/**
 * Configuration for behavioral predictor
 */
export interface BehavioralPredictorConfig {
  /** Maximum predictions to return */
  maxPredictions: number;
  /** Confidence for query-based memories */
  queryConfidence: number;
  /** Confidence for intent-based memories */
  intentConfidence: number;
  /** Confidence for frequent memories */
  frequentConfidence: number;
  /** Confidence for pattern-based memories */
  patternConfidence: number;
  /** Confidence for task-based memories */
  taskConfidence: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BehavioralPredictorConfig = {
  maxPredictions: 15,
  queryConfidence: 0.7,
  intentConfidence: 0.65,
  frequentConfidence: 0.8,
  patternConfidence: 0.6,
  taskConfidence: 0.75,
};

/**
 * Intent to memory type mapping
 */
const INTENT_MEMORY_TYPES: Record<Intent, string[]> = {
  add_feature: ['pattern_rationale', 'tribal', 'decision_context'],
  fix_bug: ['code_smell', 'tribal', 'decision_context'],
  refactor: ['pattern_rationale', 'code_smell', 'tribal'],
  add_test: ['tribal', 'pattern_rationale'],
  review_code: ['pattern_rationale', 'code_smell', 'tribal'],
  understand_code: ['decision_context', 'tribal', 'pattern_rationale'],
  debug: ['code_smell', 'tribal', 'decision_context'],
  optimize: ['pattern_rationale', 'tribal'],
  document: ['tribal', 'decision_context'],
  unknown: ['tribal', 'pattern_rationale'],
};

/**
 * Behavioral Predictor
 * 
 * Predicts memories based on user behavior patterns.
 */
export class BehavioralPredictor {
  private config: BehavioralPredictorConfig;
  private storage: IMemoryStorage;

  constructor(storage: IMemoryStorage, config?: Partial<BehavioralPredictorConfig>) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Predict memories based on behavioral signals
   */
  async predict(signals: BehavioralSignals): Promise<PredictedMemory[]> {
    const predictions: PredictedMemory[] = [];

    // Get frequently used memories (highest confidence)
    if (signals.frequentMemories.length > 0) {
      const frequentMemories = await this.getFrequentMemories(signals.frequentMemories);
      for (const memory of frequentMemories) {
        predictions.push(this.createPrediction(
          memory,
          this.config.frequentConfidence,
          'behavioral',
          'Frequently used memory',
          ['frequentMemories']
        ));
      }
    }

    // Get task-based memories
    if (signals.currentTask) {
      const taskMemories = await this.getTaskMemories(signals.currentTask);
      for (const memory of taskMemories) {
        // Skip if already predicted
        if (predictions.some(p => p.memoryId === memory.id)) continue;

        predictions.push(this.createPrediction(
          memory,
          this.config.taskConfidence,
          'behavioral',
          `Related to task: ${signals.currentTask}`,
          ['currentTask']
        ));
      }
    }

    // Get query-based memories
    if (signals.recentQueries.length > 0) {
      const queryMemories = await this.getRecentQueryMemories(signals.recentQueries);
      for (const memory of queryMemories) {
        // Skip if already predicted
        if (predictions.some(p => p.memoryId === memory.id)) continue;

        predictions.push(this.createPrediction(
          memory,
          this.config.queryConfidence,
          'behavioral',
          'Related to recent queries',
          ['recentQueries']
        ));
      }
    }

    // Get intent-based memories
    if (signals.recentIntents.length > 0) {
      const intentMemories = await this.getIntentMemories(signals.recentIntents);
      for (const memory of intentMemories) {
        // Skip if already predicted
        if (predictions.some(p => p.memoryId === memory.id)) continue;

        predictions.push(this.createPrediction(
          memory,
          this.config.intentConfidence,
          'behavioral',
          `Relevant for intent: ${signals.recentIntents[0]}`,
          ['recentIntents']
        ));
      }
    }

    // Get pattern-based memories
    if (signals.userPatterns.length > 0) {
      const patternMemories = await this.getUserPatternMemories(signals.userPatterns);
      for (const memory of patternMemories) {
        // Skip if already predicted
        if (predictions.some(p => p.memoryId === memory.id)) continue;

        predictions.push(this.createPrediction(
          memory,
          this.config.patternConfidence,
          'behavioral',
          'Matches user behavior pattern',
          ['userPatterns']
        ));
      }
    }

    // Sort by confidence and limit
    predictions.sort((a, b) => b.confidence - a.confidence);
    return predictions.slice(0, this.config.maxPredictions);
  }

  /**
   * Get frequently used memories
   */
  private async getFrequentMemories(memoryIds: string[]): Promise<Memory[]> {
    const memories: Memory[] = [];

    for (const id of memoryIds.slice(0, 10)) {
      try {
        const memory = await this.storage.read(id);
        if (memory) {
          memories.push(memory);
        }
      } catch {
        // Continue with other memories
      }
    }

    return memories;
  }

  /**
   * Get memories related to current task
   */
  private async getTaskMemories(task: string): Promise<Memory[]> {
    try {
      // Extract keywords from task and search by tags
      const keywords = task.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const results = await this.storage.search({
        tags: keywords.slice(0, 5),
        limit: 10,
      });
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get memories related to recent queries
   */
  private async getRecentQueryMemories(queries: string[]): Promise<Memory[]> {
    const memories: Memory[] = [];
    const seen = new Set<string>();

    // Use most recent queries - extract keywords and search by tags
    for (const query of queries.slice(-5)) {
      try {
        const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const results = await this.storage.search({
          tags: keywords.slice(0, 3),
          limit: 3,
        });

        for (const memory of results) {
          if (!seen.has(memory.id)) {
            seen.add(memory.id);
            memories.push(memory);
          }
        }
      } catch {
        // Continue with other queries
      }
    }

    return memories;
  }

  /**
   * Get memories based on recent intents
   */
  private async getIntentMemories(intents: Intent[]): Promise<Memory[]> {
    const memories: Memory[] = [];
    const seen = new Set<string>();

    for (const intent of intents.slice(0, 3)) {
      const types = INTENT_MEMORY_TYPES[intent] ?? INTENT_MEMORY_TYPES['unknown'];

      try {
        const results = await this.storage.search({
          types: types as import('../../types/index.js').MemoryType[],
          limit: 5,
        });

        for (const memory of results) {
          if (!seen.has(memory.id)) {
            seen.add(memory.id);
            memories.push(memory);
          }
        }
      } catch {
        // Continue with other intents
      }
    }

    return memories;
  }

  /**
   * Get memories from user behavior patterns
   */
  private async getUserPatternMemories(
    patterns: BehavioralSignals['userPatterns']
  ): Promise<Memory[]> {
    const memories: Memory[] = [];
    const seen = new Set<string>();

    for (const pattern of patterns) {
      // Get associated memories from the pattern
      for (const memoryId of pattern.associatedMemories) {
        if (seen.has(memoryId)) continue;

        try {
          const memory = await this.storage.read(memoryId);
          if (memory) {
            seen.add(memoryId);
            memories.push(memory);
          }
        } catch {
          // Continue with other memories
        }
      }
    }

    return memories;
  }

  /**
   * Create a prediction from a memory
   */
  private createPrediction(
    memory: Memory,
    confidence: number,
    strategy: 'behavioral',
    reason: string,
    contributingSignals: string[]
  ): PredictedMemory {
    const source: PredictionSource = {
      strategy,
      reason,
      contributingSignals,
      confidenceBreakdown: {
        base: confidence,
        recencyBoost: this.getRecencyBoost(memory),
        confidenceBoost: this.getConfidenceBoost(memory),
      },
    };

    // Calculate final confidence with boosts
    const finalConfidence = Math.min(
      confidence +
        source.confidenceBreakdown['recencyBoost']! +
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
   * Get recency boost based on memory age
   */
  private getRecencyBoost(memory: Memory): number {
    const now = new Date();
    const created = new Date(memory.createdAt);
    const ageMs = now.getTime() - created.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays < 1) return 0.1;
    if (ageDays < 7) return 0.05;
    if (ageDays < 30) return 0.02;
    return 0;
  }

  /**
   * Get confidence boost based on memory confidence
   */
  private getConfidenceBoost(memory: Memory): number {
    const memoryConfidence = memory.confidence ?? 0.5;

    if (memoryConfidence >= 0.9) return 0.05;
    if (memoryConfidence >= 0.7) return 0.02;
    return 0;
  }
}
