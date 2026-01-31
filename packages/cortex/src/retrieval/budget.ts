/**
 * Token Budget Manager
 * 
 * Manages token budget for memory retrieval.
 * Fits memories into budget using hierarchical compression.
 */

import type { Memory } from '../types/index.js';
import type { CompressedMemory } from './engine.js';
import { HierarchicalCompressor } from './compression.js';

/**
 * Token budget manager
 */
export class TokenBudgetManager {
  private compressor = new HierarchicalCompressor();

  /**
   * Fit ranked memories into a token budget
   */
  fitToBudget(
    ranked: Array<{ memory: Memory; score: number }>,
    budget: number
  ): CompressedMemory[] {
    const result: CompressedMemory[] = [];
    let usedTokens = 0;

    // First pass: add summaries
    for (const { memory, score } of ranked) {
      const compressed = this.compressor.compress(memory);

      // Try summary first
      if (usedTokens + compressed.summaryTokens <= budget) {
        result.push({
          memory,
          level: 'summary',
          tokens: compressed.summaryTokens,
          relevanceScore: score,
        });
        usedTokens += compressed.summaryTokens;
      } else {
        // Budget exhausted
        break;
      }
    }

    // Second pass: expand top memories if budget allows
    const leftover = budget - usedTokens;
    if (leftover > 100 && result.length > 0) {
      // Expand the most relevant memories
      for (let i = 0; i < Math.min(3, result.length); i++) {
        const item = result[i];
        if (!item) continue;

        const compressed = this.compressor.compress(item.memory);
        const expandCost = compressed.expandedTokens - item.tokens;

        if (expandCost <= leftover && expandCost > 0) {
          result[i] = {
            ...item,
            level: 'expanded',
            tokens: compressed.expandedTokens,
          };
          usedTokens += expandCost;
        }
      }
    }

    return result;
  }

  /**
   * Estimate tokens for a memory at a given level
   */
  estimateTokens(memory: Memory, level: 'summary' | 'expanded' | 'full'): number {
    const compressed = this.compressor.compress(memory);

    switch (level) {
      case 'summary':
        return compressed.summaryTokens;
      case 'expanded':
        return compressed.expandedTokens;
      case 'full':
        return compressed.fullTokens;
    }
  }
}
