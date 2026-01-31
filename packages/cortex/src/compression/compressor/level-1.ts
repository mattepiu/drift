/**
 * Level 1 Compressor
 * 
 * Compresses memories to one-liners (~50 tokens).
 * Includes summary and key tags for quick scanning.
 * 
 * @module compression/compressor/level-1
 */

import type { Level1Output } from '../../types/compressed-memory.js';
import type { Memory } from '../../types/memory.js';

/**
 * Level 1 Compressor
 * 
 * Produces output containing:
 * - Level 0 fields (ID, type, importance)
 * - One-line summary
 * - Key tags (max 3)
 * - Confidence score
 */
export class Level1Compressor {
  /** Target tokens for level 1 */
  private readonly TARGET_TOKENS = 50;
  /** Maximum tags to include */
  private readonly MAX_TAGS = 3;
  /** Maximum one-liner length in characters */
  private readonly MAX_ONELINER_CHARS = 150;

  /**
   * Compress a memory to level 1
   */
  compress(memory: Memory): Level1Output {
    const oneLiner = this.generateOneLiner(memory);
    const tags = this.selectTags(memory, this.MAX_TAGS);

    return {
      id: memory.id,
      type: memory.type,
      importance: memory.importance,
      oneLiner,
      tags,
      confidence: memory.confidence,
      tokens: this.estimateTokens(oneLiner, tags),
    };
  }

  /**
   * Compress multiple memories to level 1
   */
  compressBatch(memories: Memory[]): Level1Output[] {
    return memories.map(m => this.compress(m));
  }

  /**
   * Generate a one-line summary of the memory
   */
  generateOneLiner(memory: Memory): string {
    // Use summary if available
    if (memory.summary && memory.summary.length <= this.MAX_ONELINER_CHARS) {
      return memory.summary;
    }

    // Generate from type-specific fields
    const parts: string[] = [];

    // Add type-specific prefix
    switch (memory.type) {
      case 'tribal':
        parts.push(`[Tribal] ${this.extractTribalSummary(memory)}`);
        break;
      case 'pattern_rationale':
        parts.push(`[Pattern] ${this.extractPatternSummary(memory)}`);
        break;
      case 'code_smell':
        parts.push(`[Smell] ${this.extractSmellSummary(memory)}`);
        break;
      default:
        parts.push(`[${memory.type}] ${memory.summary || 'No summary'}`);
    }

    const result = parts.join(' ');
    return result.length > this.MAX_ONELINER_CHARS
      ? result.slice(0, this.MAX_ONELINER_CHARS - 3) + '...'
      : result;
  }

  /**
   * Select the most relevant tags
   */
  selectTags(memory: Memory, maxTags: number): string[] {
    const tags = memory.tags || [];
    
    if (tags.length <= maxTags) {
      return [...tags];
    }

    // Prioritize tags by relevance
    // 1. Type-specific tags
    // 2. Importance-related tags
    // 3. First tags (usually most relevant)
    const prioritized: string[] = [];
    const typeKeywords = this.getTypeKeywords(memory.type);

    for (const tag of tags) {
      if (prioritized.length >= maxTags) break;
      
      const lowerTag = tag.toLowerCase();
      if (typeKeywords.some(k => lowerTag.includes(k))) {
        prioritized.push(tag);
      }
    }

    // Fill remaining slots
    for (const tag of tags) {
      if (prioritized.length >= maxTags) break;
      if (!prioritized.includes(tag)) {
        prioritized.push(tag);
      }
    }

    return prioritized;
  }

  /**
   * Estimate token count for level 1 output
   */
  estimateTokens(oneLiner: string, tags: string[]): number {
    const baseTokens = 5; // Level 0 fields
    const oneLinerTokens = Math.ceil(oneLiner.length / 4);
    const tagTokens = tags.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
    const confidenceTokens = 2;

    return Math.max(this.TARGET_TOKENS, baseTokens + oneLinerTokens + tagTokens + confidenceTokens);
  }

  /**
   * Get target token count for this level
   */
  getTargetTokens(): number {
    return this.TARGET_TOKENS;
  }

  /**
   * Format level 1 output as string
   */
  format(output: Level1Output): string {
    const tagStr = output.tags.length > 0 ? ` [${output.tags.join(', ')}]` : '';
    return `${output.oneLiner}${tagStr} (conf: ${output.confidence.toFixed(2)})`;
  }

  // Private helper methods

  private extractTribalSummary(memory: Memory): string {
    const m = memory as unknown as Record<string, unknown>;
    if (m['topic'] && typeof m['topic'] === 'string') {
      return m['topic'];
    }
    if (m['knowledge'] && typeof m['knowledge'] === 'string') {
      return (m['knowledge'] as string).slice(0, 100);
    }
    return memory.summary || 'Tribal knowledge';
  }

  private extractPatternSummary(memory: Memory): string {
    const m = memory as unknown as Record<string, unknown>;
    if (m['rationale'] && typeof m['rationale'] === 'string') {
      return (m['rationale'] as string).slice(0, 100);
    }
    if (m['patternId'] && typeof m['patternId'] === 'string') {
      return `Rationale for ${m['patternId']}`;
    }
    return memory.summary || 'Pattern rationale';
  }

  private extractSmellSummary(memory: Memory): string {
    const m = memory as unknown as Record<string, unknown>;
    if (m['name'] && typeof m['name'] === 'string') {
      return m['name'] as string;
    }
    if (m['description'] && typeof m['description'] === 'string') {
      return (m['description'] as string).slice(0, 100);
    }
    return memory.summary || 'Code smell';
  }

  private getTypeKeywords(type: string): string[] {
    const keywords: Record<string, string[]> = {
      tribal: ['team', 'convention', 'practice', 'rule'],
      pattern_rationale: ['pattern', 'why', 'reason', 'rationale'],
      code_smell: ['smell', 'anti', 'avoid', 'bad'],
    };
    return keywords[type] || [];
  }
}
