/**
 * Hierarchical Compressor V2
 * 
 * Orchestrates the 4-level compression system.
 * Provides intelligent level selection based on token budgets.
 * 
 * @module compression/compressor/hierarchical
 */

import type {
  CompressionLevel,
  CompressedMemory,
  Level0Output,
  Level1Output,
  Level2Output,
  Level3Output,
} from '../../types/compressed-memory.js';
import type { Memory } from '../../types/memory.js';
import { Level0Compressor } from './level-0.js';
import { Level1Compressor } from './level-1.js';
import { Level2Compressor } from './level-2.js';
import { Level3Compressor } from './level-3.js';

/**
 * Options for compression
 */
export interface HierarchicalCompressionOptions {
  /** Minimum compression level */
  minLevel?: CompressionLevel;
  /** Maximum compression level */
  maxLevel?: CompressionLevel;
  /** Whether to allow level escalation to fit budget */
  allowEscalation?: boolean;
}

/**
 * Hierarchical Compressor V2
 * 
 * Coordinates 4 level compressors to provide flexible
 * compression based on token budgets and requirements.
 */
export class HierarchicalCompressorV2 {
  private level0: Level0Compressor;
  private level1: Level1Compressor;
  private level2: Level2Compressor;
  private level3: Level3Compressor;

  constructor(
    level0?: Level0Compressor,
    level1?: Level1Compressor,
    level2?: Level2Compressor,
    level3?: Level3Compressor
  ) {
    this.level0 = level0 || new Level0Compressor();
    this.level1 = level1 || new Level1Compressor();
    this.level2 = level2 || new Level2Compressor();
    this.level3 = level3 || new Level3Compressor();
  }

  /**
   * Compress a memory to a specific level
   */
  compress(memory: Memory, level: CompressionLevel): CompressedMemory {
    const output = this.compressToLevel(memory, level);
    const originalTokens = this.getTokenCount(memory, 3);

    return {
      memoryId: memory.id,
      level,
      output,
      tokenCount: output.tokens,
      originalTokenCount: originalTokens,
      compressionRatio: originalTokens > 0 ? output.tokens / originalTokens : 1,
      compressedAt: new Date().toISOString(),
    };
  }

  /**
   * Compress a memory to fit within a token budget
   * 
   * Starts at the highest level and decreases until it fits.
   */
  compressToFit(
    memory: Memory,
    maxTokens: number,
    options: HierarchicalCompressionOptions = {}
  ): CompressedMemory {
    const minLevel = options.minLevel ?? 0;
    const maxLevel = options.maxLevel ?? 3;

    // Try from highest to lowest level
    for (let level = maxLevel; level >= minLevel; level--) {
      const output = this.compressToLevel(memory, level as CompressionLevel);
      
      if (output.tokens <= maxTokens) {
        const originalTokens = this.getTokenCount(memory, 3);
        return {
          memoryId: memory.id,
          level: level as CompressionLevel,
          output,
          tokenCount: output.tokens,
          originalTokenCount: originalTokens,
          compressionRatio: originalTokens > 0 ? output.tokens / originalTokens : 1,
          compressedAt: new Date().toISOString(),
        };
      }
    }

    // If nothing fits, return level 0 (always smallest)
    const output = this.level0.compress(memory);
    const originalTokens = this.getTokenCount(memory, 3);
    
    return {
      memoryId: memory.id,
      level: 0,
      output,
      tokenCount: output.tokens,
      originalTokenCount: originalTokens,
      compressionRatio: originalTokens > 0 ? output.tokens / originalTokens : 1,
      compressedAt: new Date().toISOString(),
    };
  }

  /**
   * Compress multiple memories to fit within a total budget
   * 
   * Uses a greedy approach, prioritizing higher importance memories.
   */
  compressBatchToFit(
    memories: Memory[],
    totalBudget: number,
    options: HierarchicalCompressionOptions = {}
  ): CompressedMemory[] {
    const results: CompressedMemory[] = [];
    let remainingBudget = totalBudget;

    // Sort by importance (critical > high > normal > low)
    const sorted = [...memories].sort((a, b) => {
      const importanceOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const aOrder = importanceOrder[a.importance as keyof typeof importanceOrder] ?? 2;
      const bOrder = importanceOrder[b.importance as keyof typeof importanceOrder] ?? 2;
      return aOrder - bOrder;
    });

    for (const memory of sorted) {
      if (remainingBudget <= 0) break;

      const compressed = this.compressToFit(memory, remainingBudget, options);
      results.push(compressed);
      remainingBudget -= compressed.tokenCount;
    }

    return results;
  }

  /**
   * Get token count for a memory at a specific level
   */
  getTokenCount(memory: Memory, level: CompressionLevel): number {
    const output = this.compressToLevel(memory, level);
    return output.tokens;
  }

  /**
   * Get token counts for all levels
   */
  getTokenCountsAllLevels(memory: Memory): Record<CompressionLevel, number> {
    return {
      0: this.getTokenCount(memory, 0),
      1: this.getTokenCount(memory, 1),
      2: this.getTokenCount(memory, 2),
      3: this.getTokenCount(memory, 3),
    };
  }

  /**
   * Suggest optimal level for a given budget
   */
  suggestLevel(memory: Memory, budget: number): CompressionLevel {
    const counts = this.getTokenCountsAllLevels(memory);

    // Return highest level that fits
    if (counts[3] <= budget) return 3;
    if (counts[2] <= budget) return 2;
    if (counts[1] <= budget) return 1;
    return 0;
  }

  /**
   * Format compressed memory as string
   */
  format(compressed: CompressedMemory): string {
    switch (compressed.level) {
      case 0:
        return this.level0.format(compressed.output as Level0Output);
      case 1:
        return this.level1.format(compressed.output as Level1Output);
      case 2:
        return this.level2.format(compressed.output as Level2Output);
      case 3:
        return this.level3.format(compressed.output as Level3Output);
      default:
        return JSON.stringify(compressed.output);
    }
  }

  /**
   * Get target tokens for a level
   */
  getTargetTokens(level: CompressionLevel): number {
    switch (level) {
      case 0:
        return this.level0.getTargetTokens();
      case 1:
        return this.level1.getTargetTokens();
      case 2:
        return this.level2.getTargetTokens();
      case 3:
        return this.level3.getTargetTokens();
      default:
        return 0;
    }
  }

  // Private helper methods

  private compressToLevel(
    memory: Memory,
    level: CompressionLevel
  ): Level0Output | Level1Output | Level2Output | Level3Output {
    switch (level) {
      case 0:
        return this.level0.compress(memory);
      case 1:
        return this.level1.compress(memory);
      case 2:
        return this.level2.compress(memory);
      case 3:
        return this.level3.compress(memory);
      default:
        return this.level0.compress(memory);
    }
  }
}
