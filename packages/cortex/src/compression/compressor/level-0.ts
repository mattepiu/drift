/**
 * Level 0 Compressor
 * 
 * Compresses memories to IDs only (~5 tokens).
 * Minimal representation for high-volume retrieval.
 * 
 * @module compression/compressor/level-0
 */

import type { Level0Output } from '../../types/compressed-memory.js';
import type { Memory } from '../../types/memory.js';

/**
 * Level 0 Compressor
 * 
 * Produces minimal output containing only:
 * - Memory ID
 * - Memory type
 * - Importance level
 */
export class Level0Compressor {
  /** Target tokens for level 0 */
  private readonly TARGET_TOKENS = 5;

  /**
   * Compress a memory to level 0
   */
  compress(memory: Memory): Level0Output {
    return {
      id: memory.id,
      type: memory.type,
      importance: memory.importance,
      tokens: this.estimateTokens(memory),
    };
  }

  /**
   * Compress multiple memories to level 0
   */
  compressBatch(memories: Memory[]): Level0Output[] {
    return memories.map(m => this.compress(m));
  }

  /**
   * Estimate token count for level 0 output
   */
  estimateTokens(memory: Memory): number {
    // ID (UUID) ~8 tokens, type ~1 token, importance ~1 token
    // But we target ~5 tokens for the formatted output
    const idTokens = Math.ceil(memory.id.length / 4);
    const typeTokens = Math.ceil(memory.type.length / 4);
    const importanceTokens = Math.ceil(memory.importance.length / 4);
    
    // Minimum is target, actual may be slightly higher
    return Math.max(this.TARGET_TOKENS, Math.ceil((idTokens + typeTokens + importanceTokens) / 2));
  }

  /**
   * Get target token count for this level
   */
  getTargetTokens(): number {
    return this.TARGET_TOKENS;
  }

  /**
   * Format level 0 output as string
   */
  format(output: Level0Output): string {
    return `[${output.type}:${output.id.slice(0, 8)}:${output.importance}]`;
  }

  /**
   * Format multiple outputs as string
   */
  formatBatch(outputs: Level0Output[]): string {
    return outputs.map(o => this.format(o)).join(' ');
  }
}
