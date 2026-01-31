/**
 * Temporal Predictor
 * 
 * Predicts memories based on time patterns.
 * Uses time of day, day of week, and session
 * duration to predict relevant memories.
 * 
 * @module prediction/predictor/temporal-predictor
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory } from '../../types/index.js';
import type { TemporalSignals, PredictedMemory, PredictionSource } from '../types.js';

/**
 * Configuration for temporal predictor
 */
export interface TemporalPredictorConfig {
  /** Maximum predictions to return */
  maxPredictions: number;
  /** Confidence for time-of-day memories */
  timeOfDayConfidence: number;
  /** Confidence for day-of-week memories */
  dayOfWeekConfidence: number;
  /** Confidence for session-based memories */
  sessionConfidence: number;
  /** Confidence for new session memories */
  newSessionConfidence: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TemporalPredictorConfig = {
  maxPredictions: 10,
  timeOfDayConfidence: 0.5,
  dayOfWeekConfidence: 0.4,
  sessionConfidence: 0.6,
  newSessionConfidence: 0.7,
};

/**
 * Temporal usage record for tracking
 */
interface TemporalUsageRecord {
  memoryId: string;
  timeOfDay: Map<string, number>;
  dayOfWeek: Map<string, number>;
  totalUsage: number;
}

/**
 * Temporal Predictor
 * 
 * Predicts memories based on time patterns.
 */
export class TemporalPredictor {
  private config: TemporalPredictorConfig;
  private storage: IMemoryStorage;
  private usageRecords: Map<string, TemporalUsageRecord> = new Map();

  constructor(storage: IMemoryStorage, config?: Partial<TemporalPredictorConfig>) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Predict memories based on temporal signals
   */
  async predict(signals: TemporalSignals): Promise<PredictedMemory[]> {
    const predictions: PredictedMemory[] = [];

    // If new session, get commonly used memories
    if (signals.isNewSession) {
      const newSessionMemories = await this.getNewSessionMemories();
      for (const memory of newSessionMemories) {
        predictions.push(this.createPrediction(
          memory,
          this.config.newSessionConfidence,
          'temporal',
          'Commonly used at session start',
          ['isNewSession']
        ));
      }
    }

    // Get time-of-day specific memories
    const timeOfDayMemories = await this.getTimeOfDayMemories(signals.timeOfDay);
    for (const memory of timeOfDayMemories) {
      // Skip if already predicted
      if (predictions.some(p => p.memoryId === memory.id)) continue;

      predictions.push(this.createPrediction(
        memory,
        this.config.timeOfDayConfidence,
        'temporal',
        `Often used in the ${signals.timeOfDay}`,
        ['timeOfDay']
      ));
    }

    // Get day-of-week specific memories
    const dayOfWeekMemories = await this.getDayOfWeekMemories(signals.dayOfWeek);
    for (const memory of dayOfWeekMemories) {
      // Skip if already predicted
      if (predictions.some(p => p.memoryId === memory.id)) continue;

      predictions.push(this.createPrediction(
        memory,
        this.config.dayOfWeekConfidence,
        'temporal',
        `Often used on ${signals.dayOfWeek}`,
        ['dayOfWeek']
      ));
    }

    // Get session-duration based memories
    if (signals.sessionDuration > 0) {
      const sessionMemories = await this.getSessionDurationMemories(signals.sessionDuration);
      for (const memory of sessionMemories) {
        // Skip if already predicted
        if (predictions.some(p => p.memoryId === memory.id)) continue;

        predictions.push(this.createPrediction(
          memory,
          this.config.sessionConfidence,
          'temporal',
          `Relevant at ${signals.sessionDuration} minutes into session`,
          ['sessionDuration']
        ));
      }
    }

    // Sort by confidence and limit
    predictions.sort((a, b) => b.confidence - a.confidence);
    return predictions.slice(0, this.config.maxPredictions);
  }

  /**
   * Record memory usage for temporal tracking
   */
  recordUsage(
    memoryId: string,
    timeOfDay: string,
    dayOfWeek: string
  ): void {
    let record = this.usageRecords.get(memoryId);

    if (!record) {
      record = {
        memoryId,
        timeOfDay: new Map(),
        dayOfWeek: new Map(),
        totalUsage: 0,
      };
      this.usageRecords.set(memoryId, record);
    }

    // Update time of day count
    const todCount = record.timeOfDay.get(timeOfDay) ?? 0;
    record.timeOfDay.set(timeOfDay, todCount + 1);

    // Update day of week count
    const dowCount = record.dayOfWeek.get(dayOfWeek) ?? 0;
    record.dayOfWeek.set(dayOfWeek, dowCount + 1);

    record.totalUsage++;
  }

  /**
   * Get memories commonly used at session start
   */
  private async getNewSessionMemories(): Promise<Memory[]> {
    // Get most frequently used memories overall
    const sortedRecords = Array.from(this.usageRecords.values())
      .sort((a, b) => b.totalUsage - a.totalUsage)
      .slice(0, 10);

    const memories: Memory[] = [];
    for (const record of sortedRecords) {
      try {
        const memory = await this.storage.read(record.memoryId);
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
   * Get memories commonly used at a specific time of day
   */
  private async getTimeOfDayMemories(
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  ): Promise<Memory[]> {
    // Find memories with high usage at this time of day
    const candidates: Array<{ memoryId: string; score: number }> = [];

    for (const record of this.usageRecords.values()) {
      const todCount = record.timeOfDay.get(timeOfDay) ?? 0;
      if (todCount > 0) {
        // Score based on proportion of usage at this time
        const score = todCount / record.totalUsage;
        candidates.push({ memoryId: record.memoryId, score });
      }
    }

    // Sort by score and get top memories
    candidates.sort((a, b) => b.score - a.score);

    const memories: Memory[] = [];
    for (const candidate of candidates.slice(0, 5)) {
      try {
        const memory = await this.storage.read(candidate.memoryId);
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
   * Get memories commonly used on a specific day of week
   */
  private async getDayOfWeekMemories(dayOfWeek: string): Promise<Memory[]> {
    // Find memories with high usage on this day
    const candidates: Array<{ memoryId: string; score: number }> = [];

    for (const record of this.usageRecords.values()) {
      const dowCount = record.dayOfWeek.get(dayOfWeek) ?? 0;
      if (dowCount > 0) {
        // Score based on proportion of usage on this day
        const score = dowCount / record.totalUsage;
        candidates.push({ memoryId: record.memoryId, score });
      }
    }

    // Sort by score and get top memories
    candidates.sort((a, b) => b.score - a.score);

    const memories: Memory[] = [];
    for (const candidate of candidates.slice(0, 5)) {
      try {
        const memory = await this.storage.read(candidate.memoryId);
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
   * Get memories relevant to session duration
   */
  private async getSessionDurationMemories(duration: number): Promise<Memory[]> {
    // Early session (< 10 min): Get quick reference memories
    // Mid session (10-60 min): Get detailed memories
    // Long session (> 60 min): Get comprehensive memories

    let types: import('../../types/index.js').MemoryType[];
    if (duration < 10) {
      types = ['tribal', 'pattern_rationale'];
    } else if (duration < 60) {
      types = ['tribal', 'pattern_rationale', 'decision_context'];
    } else {
      types = ['tribal', 'pattern_rationale', 'decision_context', 'code_smell'];
    }

    try {
      const results = await this.storage.search({
        types,
        limit: 5,
      });
      return results;
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
    strategy: 'temporal',
    reason: string,
    contributingSignals: string[]
  ): PredictedMemory {
    const source: PredictionSource = {
      strategy,
      reason,
      contributingSignals,
      confidenceBreakdown: {
        base: confidence,
        usageBoost: this.getUsageBoost(memory.id),
      },
    };

    // Calculate final confidence with boosts
    const finalConfidence = Math.min(
      confidence + source.confidenceBreakdown['usageBoost']!,
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
   * Get usage boost for a memory
   */
  private getUsageBoost(memoryId: string): number {
    const record = this.usageRecords.get(memoryId);
    if (!record) return 0;

    if (record.totalUsage > 20) return 0.15;
    if (record.totalUsage > 10) return 0.1;
    if (record.totalUsage > 5) return 0.05;
    return 0;
  }

  /**
   * Clear usage records
   */
  clear(): void {
    this.usageRecords.clear();
  }

  /**
   * Export state for persistence
   */
  export(): Array<[string, {
    memoryId: string;
    timeOfDay: [string, number][];
    dayOfWeek: [string, number][];
    totalUsage: number;
  }]> {
    return Array.from(this.usageRecords.entries()).map(([id, record]) => [
      id,
      {
        memoryId: record.memoryId,
        timeOfDay: Array.from(record.timeOfDay.entries()),
        dayOfWeek: Array.from(record.dayOfWeek.entries()),
        totalUsage: record.totalUsage,
      },
    ]);
  }

  /**
   * Import state from persistence
   */
  import(state: Array<[string, {
    memoryId: string;
    timeOfDay: [string, number][];
    dayOfWeek: [string, number][];
    totalUsage: number;
  }]>): void {
    this.usageRecords.clear();
    for (const [id, data] of state) {
      this.usageRecords.set(id, {
        memoryId: data.memoryId,
        timeOfDay: new Map(data.timeOfDay),
        dayOfWeek: new Map(data.dayOfWeek),
        totalUsage: data.totalUsage,
      });
    }
  }
}
