/**
 * Memory Predictor Engine
 * 
 * Orchestrates memory prediction using multiple strategies.
 * Combines file-based, pattern-based, temporal, and behavioral
 * predictors to generate comprehensive predictions.
 * 
 * @module prediction/predictor/engine
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type {
  PredictionSignals,
  PredictedMemory,
  PredictionResult,
  PredictionConfig,
  PredictionStrategy,
} from '../types.js';
import { DEFAULT_PREDICTION_CONFIG } from '../types.js';
import { FileBasedPredictor, type FileBasedPredictorConfig } from './file-predictor.js';
import { PatternBasedPredictor, type PatternBasedPredictorConfig } from './pattern-predictor.js';
import { TemporalPredictor, type TemporalPredictorConfig } from './temporal-predictor.js';
import { BehavioralPredictor, type BehavioralPredictorConfig } from './behavioral-predictor.js';

/**
 * Configuration for memory predictor engine
 */
export interface MemoryPredictorConfig extends PredictionConfig {
  /** File predictor config */
  file?: Partial<FileBasedPredictorConfig>;
  /** Pattern predictor config */
  pattern?: Partial<PatternBasedPredictorConfig>;
  /** Temporal predictor config */
  temporal?: Partial<TemporalPredictorConfig>;
  /** Behavioral predictor config */
  behavioral?: Partial<BehavioralPredictorConfig>;
}

/**
 * Memory Predictor Engine
 * 
 * Orchestrates memory prediction using multiple strategies.
 */
export class MemoryPredictor {
  private config: MemoryPredictorConfig;
  private filePredictor: FileBasedPredictor;
  private patternPredictor: PatternBasedPredictor;
  private temporalPredictor: TemporalPredictor;
  private behavioralPredictor: BehavioralPredictor;

  constructor(storage: IMemoryStorage, config?: Partial<MemoryPredictorConfig>) {
    this.config = { ...DEFAULT_PREDICTION_CONFIG, ...config };

    this.filePredictor = new FileBasedPredictor(storage, this.config.file);
    this.patternPredictor = new PatternBasedPredictor(storage, this.config.pattern);
    this.temporalPredictor = new TemporalPredictor(storage, this.config.temporal);
    this.behavioralPredictor = new BehavioralPredictor(storage, this.config.behavioral);
  }

  /**
   * Predict memories based on signals
   */
  async predict(signals: PredictionSignals): Promise<PredictionResult> {
    const startTime = Date.now();
    const allPredictions: PredictedMemory[] = [];
    const strategiesUsed: PredictionStrategy[] = [];

    // Run enabled strategies
    const strategyPromises: Array<Promise<PredictedMemory[]>> = [];

    if (this.config.strategies.includes('file_based')) {
      strategyPromises.push(
        this.filePredictor.predict(signals.file).then(predictions => {
          strategiesUsed.push('file_based');
          return predictions;
        })
      );
    }

    if (this.config.strategies.includes('pattern_based')) {
      strategyPromises.push(
        this.patternPredictor.predict(signals.file.filePatterns).then(predictions => {
          strategiesUsed.push('pattern_based');
          return predictions;
        })
      );
    }

    if (this.config.strategies.includes('temporal')) {
      strategyPromises.push(
        this.temporalPredictor.predict(signals.temporal).then(predictions => {
          strategiesUsed.push('temporal');
          return predictions;
        })
      );
    }

    if (this.config.strategies.includes('behavioral') && this.config.useBehavioralSignals) {
      strategyPromises.push(
        this.behavioralPredictor.predict(signals.behavioral).then(predictions => {
          strategiesUsed.push('behavioral');
          return predictions;
        })
      );
    }

    // Wait for all strategies to complete
    const results = await Promise.all(strategyPromises);

    // Combine all predictions
    for (const predictions of results) {
      allPredictions.push(...predictions);
    }

    // Deduplicate and rank predictions
    const deduped = this.deduplicatePredictions(allPredictions);
    const ranked = this.rankPredictions(deduped);

    // Filter by minimum confidence
    const filtered = ranked.filter(p => p.confidence >= this.config.minConfidence);

    // Limit to max predictions
    const final = filtered.slice(0, this.config.maxPredictions);

    const predictionTimeMs = Date.now() - startTime;

    return {
      predictions: final,
      signals,
      strategiesUsed,
      predictionTimeMs,
      cacheStatus: 'miss', // Will be updated by cache layer
      predictedAt: new Date().toISOString(),
    };
  }

  /**
   * Deduplicate predictions by memory ID
   */
  private deduplicatePredictions(predictions: PredictedMemory[]): PredictedMemory[] {
    const seen = new Map<string, PredictedMemory>();

    for (const prediction of predictions) {
      const existing = seen.get(prediction.memoryId);

      if (!existing) {
        seen.set(prediction.memoryId, prediction);
      } else {
        // Keep the one with higher confidence
        if (prediction.confidence > existing.confidence) {
          // Merge contributing signals
          const mergedSignals = new Set([
            ...existing.source.contributingSignals,
            ...prediction.source.contributingSignals,
          ]);

          const merged: PredictedMemory = {
            ...prediction,
            source: {
              ...prediction.source,
              contributingSignals: Array.from(mergedSignals),
              confidenceBreakdown: {
                ...prediction.source.confidenceBreakdown,
                multiStrategyBoost: 0.05, // Boost for appearing in multiple strategies
              },
            },
          };

          // Recalculate confidence with multi-strategy boost
          merged.confidence = Math.min(prediction.confidence + 0.05, 1.0);
          merged.relevanceScore = merged.confidence;

          seen.set(prediction.memoryId, merged);
        } else {
          // Add multi-strategy boost to existing
          const mergedSignals = new Set([
            ...existing.source.contributingSignals,
            ...prediction.source.contributingSignals,
          ]);

          existing.source.contributingSignals = Array.from(mergedSignals);
          existing.source.confidenceBreakdown['multiStrategyBoost'] = 0.05;
          existing.confidence = Math.min(existing.confidence + 0.05, 1.0);
          existing.relevanceScore = existing.confidence;
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Rank predictions by relevance
   */
  private rankPredictions(predictions: PredictedMemory[]): PredictedMemory[] {
    return predictions.sort((a, b) => {
      // Primary: confidence
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }

      // Secondary: number of contributing signals
      const aSignals = a.source.contributingSignals.length;
      const bSignals = b.source.contributingSignals.length;
      if (bSignals !== aSignals) {
        return bSignals - aSignals;
      }

      // Tertiary: relevance score
      return b.relevanceScore - a.relevanceScore;
    });
  }

  /**
   * Record temporal usage for learning
   */
  recordTemporalUsage(
    memoryId: string,
    timeOfDay: string,
    dayOfWeek: string
  ): void {
    this.temporalPredictor.recordUsage(memoryId, timeOfDay, dayOfWeek);
  }

  /**
   * Get file predictor for direct access
   */
  getFilePredictor(): FileBasedPredictor {
    return this.filePredictor;
  }

  /**
   * Get pattern predictor for direct access
   */
  getPatternPredictor(): PatternBasedPredictor {
    return this.patternPredictor;
  }

  /**
   * Get temporal predictor for direct access
   */
  getTemporalPredictor(): TemporalPredictor {
    return this.temporalPredictor;
  }

  /**
   * Get behavioral predictor for direct access
   */
  getBehavioralPredictor(): BehavioralPredictor {
    return this.behavioralPredictor;
  }

  /**
   * Clear temporal usage data
   */
  clearTemporalData(): void {
    this.temporalPredictor.clear();
  }

  /**
   * Export state for persistence
   */
  export(): {
    temporal: ReturnType<TemporalPredictor['export']>;
  } {
    return {
      temporal: this.temporalPredictor.export(),
    };
  }

  /**
   * Import state from persistence
   */
  import(state: {
    temporal?: Parameters<TemporalPredictor['import']>[0];
  }): void {
    if (state.temporal) {
      this.temporalPredictor.import(state.temporal);
    }
  }
}
