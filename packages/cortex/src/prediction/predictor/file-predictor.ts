/**
 * File-Based Predictor
 * 
 * Predicts memories based on file context.
 * Uses file links, patterns, and similar files
 * to predict relevant memories.
 * 
 * @module prediction/predictor/file-predictor
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory } from '../../types/index.js';
import type { FileSignals, PredictedMemory, PredictionSource } from '../types.js';

/**
 * Configuration for file-based predictor
 */
export interface FileBasedPredictorConfig {
  /** Maximum predictions to return */
  maxPredictions: number;
  /** Confidence for directly linked memories */
  linkedConfidence: number;
  /** Confidence for pattern-based memories */
  patternConfidence: number;
  /** Confidence for similar file memories */
  similarFileConfidence: number;
  /** Confidence for directory-based memories */
  directoryConfidence: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FileBasedPredictorConfig = {
  maxPredictions: 20,
  linkedConfidence: 0.9,
  patternConfidence: 0.7,
  similarFileConfidence: 0.5,
  directoryConfidence: 0.4,
};

/**
 * File-Based Predictor
 * 
 * Predicts memories based on file context.
 */
export class FileBasedPredictor {
  private config: FileBasedPredictorConfig;
  private storage: IMemoryStorage;

  constructor(storage: IMemoryStorage, config?: Partial<FileBasedPredictorConfig>) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Predict memories based on file signals
   */
  async predict(signals: FileSignals): Promise<PredictedMemory[]> {
    const predictions: PredictedMemory[] = [];

    // Get directly linked memories (highest confidence)
    const linkedMemories = await this.getLinkedMemories(signals.activeFile);
    for (const memory of linkedMemories) {
      predictions.push(this.createPrediction(
        memory,
        this.config.linkedConfidence,
        'file_based',
        `Directly linked to ${signals.activeFile}`,
        ['activeFile']
      ));
    }

    // Get pattern-based memories
    if (signals.filePatterns.length > 0) {
      const patternMemories = await this.getPatternMemories(signals.filePatterns);
      for (const memory of patternMemories) {
        // Skip if already predicted
        if (predictions.some(p => p.memoryId === memory.id)) continue;

        predictions.push(this.createPrediction(
          memory,
          this.config.patternConfidence,
          'file_based',
          `Matches patterns: ${signals.filePatterns.slice(0, 3).join(', ')}`,
          ['filePatterns']
        ));
      }
    }

    // Get memories from similar files (recent files)
    if (signals.recentFiles.length > 0) {
      const similarFileMemories = await this.getSimilarFileMemories(signals.recentFiles);
      for (const memory of similarFileMemories) {
        // Skip if already predicted
        if (predictions.some(p => p.memoryId === memory.id)) continue;

        predictions.push(this.createPrediction(
          memory,
          this.config.similarFileConfidence,
          'file_based',
          'Linked to recently opened files',
          ['recentFiles']
        ));
      }
    }

    // Get directory-based memories
    const directoryMemories = await this.getDirectoryMemories(signals.directory);
    for (const memory of directoryMemories) {
      // Skip if already predicted
      if (predictions.some(p => p.memoryId === memory.id)) continue;

      predictions.push(this.createPrediction(
        memory,
        this.config.directoryConfidence,
        'file_based',
        `In same directory: ${signals.directory}`,
        ['directory']
      ));
    }

    // Sort by confidence and limit
    predictions.sort((a, b) => b.confidence - a.confidence);
    return predictions.slice(0, this.config.maxPredictions);
  }

  /**
   * Get memories directly linked to a file
   */
  private async getLinkedMemories(file: string): Promise<Memory[]> {
    try {
      return await this.storage.findByFile(file);
    } catch {
      return [];
    }
  }

  /**
   * Get memories related to detected patterns
   */
  private async getPatternMemories(patterns: string[]): Promise<Memory[]> {
    const memories: Memory[] = [];
    const seen = new Set<string>();

    for (const pattern of patterns) {
      try {
        // Search for memories with tags matching the pattern
        const results = await this.storage.search({
          tags: [pattern],
          limit: 5,
        });

        for (const memory of results) {
          if (!seen.has(memory.id)) {
            seen.add(memory.id);
            memories.push(memory);
          }
        }
      } catch {
        // Continue with other patterns
      }
    }

    return memories;
  }

  /**
   * Get memories from similar/recent files
   */
  private async getSimilarFileMemories(recentFiles: string[]): Promise<Memory[]> {
    const memories: Memory[] = [];
    const seen = new Set<string>();

    for (const file of recentFiles.slice(0, 5)) {
      try {
        const fileMemories = await this.storage.findByFile(file);
        for (const memory of fileMemories) {
          if (!seen.has(memory.id)) {
            seen.add(memory.id);
            memories.push(memory);
          }
        }
      } catch {
        // Continue with other files
      }
    }

    return memories;
  }

  /**
   * Get memories related to the directory
   */
  private async getDirectoryMemories(directory: string): Promise<Memory[]> {
    try {
      // Search for memories with directory-related tags
      const dirParts = directory.split('/').filter(p => p.length > 0);
      const results = await this.storage.search({
        tags: dirParts.slice(-2), // Use last 2 directory parts as tags
        limit: 10,
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
    strategy: 'file_based',
    reason: string,
    contributingSignals: string[]
  ): PredictedMemory {
    const source: PredictionSource = {
      strategy,
      reason,
      contributingSignals,
      confidenceBreakdown: {
        base: confidence,
        recency: this.calculateRecencyBoost(memory),
        usage: this.calculateUsageBoost(memory),
      },
    };

    // Calculate final confidence with boosts
    const finalConfidence = Math.min(
      confidence +
        source.confidenceBreakdown['recency']! +
        source.confidenceBreakdown['usage']!,
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
   * Calculate recency boost based on memory age
   */
  private calculateRecencyBoost(memory: Memory): number {
    const now = new Date();
    const created = new Date(memory.createdAt);
    const ageMs = now.getTime() - created.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Newer memories get a boost
    if (ageDays < 1) return 0.1;
    if (ageDays < 7) return 0.05;
    if (ageDays < 30) return 0.02;
    return 0;
  }

  /**
   * Calculate usage boost based on memory access
   */
  private calculateUsageBoost(memory: Memory): number {
    // Use accessCount if available
    const accessCount = (memory as Memory & { accessCount?: number }).accessCount ?? 0;

    if (accessCount > 10) return 0.1;
    if (accessCount > 5) return 0.05;
    if (accessCount > 0) return 0.02;
    return 0;
  }
}
