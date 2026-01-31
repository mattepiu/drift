/**
 * Result Ranking
 * 
 * Ranks scored memories for final output.
 * Applies diversity bonus to avoid redundant results.
 */

import type { Memory } from '../types/index.js';

/**
 * Scored memory
 */
export interface ScoredMemory {
  memory: Memory;
  score: number;
}

/**
 * Result ranker
 */
export class ResultRanker {
  /**
   * Rank scored memories
   */
  rank(scored: ScoredMemory[]): ScoredMemory[] {
    // Sort by score descending
    const sorted = [...scored].sort((a, b) => b.score - a.score);

    // Apply diversity bonus
    return this.applyDiversityBonus(sorted);
  }

  /**
   * Apply diversity bonus to avoid redundant results
   */
  private applyDiversityBonus(sorted: ScoredMemory[]): ScoredMemory[] {
    const result: ScoredMemory[] = [];
    const seenTypes = new Map<string, number>();

    for (const item of sorted) {
      const type = item.memory.type;
      const typeCount = seenTypes.get(type) || 0;

      // Penalize repeated types
      const diversityPenalty = Math.pow(0.9, typeCount);
      const adjustedScore = item.score * diversityPenalty;

      result.push({
        memory: item.memory,
        score: adjustedScore,
      });

      seenTypes.set(type, typeCount + 1);
    }

    // Re-sort after diversity adjustment
    return result.sort((a, b) => b.score - a.score);
  }
}
