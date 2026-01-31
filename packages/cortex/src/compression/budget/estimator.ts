/**
 * Token Estimator
 * 
 * Estimates token counts for text and objects.
 * Uses a simple character-based estimation that works
 * well for most LLM tokenizers.
 * 
 * @module compression/budget/estimator
 */

import type { CompressionLevel } from '../../types/compressed-memory.js';
import type { Memory } from '../../types/memory.js';

/**
 * Token Estimator
 * 
 * Provides token count estimation for various content types.
 * Uses ~4 characters per token as a reasonable approximation.
 */
export class TokenEstimator {
  /** Average characters per token */
  private readonly CHARS_PER_TOKEN = 4;
  /** Overhead for JSON structure */
  private readonly JSON_OVERHEAD_FACTOR = 1.2;
  /** Overhead for code (more tokens due to symbols) */
  private readonly CODE_OVERHEAD_FACTOR = 1.3;

  /**
   * Estimate tokens for plain text
   */
  estimate(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  /**
   * Estimate tokens for an object (JSON serialized)
   */
  estimateObject(obj: object): number {
    if (!obj) return 0;
    
    try {
      const json = JSON.stringify(obj);
      return Math.ceil((json.length / this.CHARS_PER_TOKEN) * this.JSON_OVERHEAD_FACTOR);
    } catch {
      // If serialization fails, estimate based on keys
      return this.estimateObjectRecursive(obj);
    }
  }

  /**
   * Estimate tokens for code
   */
  estimateCode(code: string): number {
    if (!code) return 0;
    return Math.ceil((code.length / this.CHARS_PER_TOKEN) * this.CODE_OVERHEAD_FACTOR);
  }

  /**
   * Estimate tokens for a memory at a specific compression level
   */
  estimateMemory(memory: Memory, level: CompressionLevel): number {
    switch (level) {
      case 0:
        return this.estimateLevel0(memory);
      case 1:
        return this.estimateLevel1(memory);
      case 2:
        return this.estimateLevel2(memory);
      case 3:
        return this.estimateLevel3(memory);
      default:
        return this.estimateLevel0(memory);
    }
  }

  /**
   * Estimate tokens for an array of strings
   */
  estimateArray(items: string[]): number {
    return items.reduce((sum, item) => sum + this.estimate(item), 0);
  }

  /**
   * Get the characters per token ratio
   */
  getCharsPerToken(): number {
    return this.CHARS_PER_TOKEN;
  }

  // Private estimation methods for each level

  private estimateLevel0(memory: Memory): number {
    // ID (~8 tokens) + type (~2 tokens) + importance (~2 tokens)
    const idTokens = Math.ceil(memory.id.length / this.CHARS_PER_TOKEN);
    const typeTokens = Math.ceil(memory.type.length / this.CHARS_PER_TOKEN);
    const importanceTokens = Math.ceil(memory.importance.length / this.CHARS_PER_TOKEN);
    
    return Math.max(5, idTokens + typeTokens + importanceTokens);
  }

  private estimateLevel1(memory: Memory): number {
    const level0 = this.estimateLevel0(memory);
    
    // Summary/one-liner
    const summaryTokens = memory.summary 
      ? this.estimate(memory.summary)
      : 20; // Default estimate
    
    // Tags (max 3)
    const tags = memory.tags || [];
    const tagTokens = tags.slice(0, 3).reduce(
      (sum, tag) => sum + this.estimate(tag),
      0
    );
    
    // Confidence (~2 tokens)
    const confidenceTokens = 2;
    
    return Math.max(50, level0 + summaryTokens + tagTokens + confidenceTokens);
  }

  private estimateLevel2(memory: Memory): number {
    const level1 = this.estimateLevel1(memory);
    const m = memory as unknown as Record<string, unknown>;
    
    // Knowledge/content
    let knowledgeTokens = 50; // Default
    const knowledgeFields = ['knowledge', 'content', 'rationale', 'description'];
    for (const field of knowledgeFields) {
      const value = m[field];
      if (value && typeof value === 'string') {
        knowledgeTokens = Math.min(100, this.estimate(value));
        break;
      }
    }
    
    // One example
    let exampleTokens = 0;
    const examplesArr = m['examples'];
    if (examplesArr && Array.isArray(examplesArr) && examplesArr.length > 0) {
      const firstExample = examplesArr[0];
      if (typeof firstExample === 'string') {
        exampleTokens = Math.min(75, this.estimateCode(firstExample));
      } else if (firstExample && typeof firstExample === 'object') {
        const ex = firstExample as Record<string, unknown>;
        const code = ex['code'];
        if (code && typeof code === 'string') {
          exampleTokens = Math.min(75, this.estimateCode(code));
        }
      }
    }
    
    // Evidence (max 2 items)
    const evidenceTokens = 20; // Estimate for 2 short evidence items
    
    return Math.max(200, level1 + knowledgeTokens + exampleTokens + evidenceTokens);
  }

  private estimateLevel3(memory: Memory): number {
    const level2 = this.estimateLevel2(memory);
    const m = memory as unknown as Record<string, unknown>;
    
    // Full knowledge (no truncation)
    let fullKnowledgeTokens = 0;
    const knowledgeFields = ['knowledge', 'content', 'rationale', 'description', 'explanation'];
    for (const field of knowledgeFields) {
      const value = m[field];
      if (value && typeof value === 'string') {
        fullKnowledgeTokens += this.estimate(value);
      }
    }
    
    // All examples
    let allExamplesTokens = 0;
    const examplesArr = m['examples'];
    if (examplesArr && Array.isArray(examplesArr)) {
      for (const ex of examplesArr) {
        if (typeof ex === 'string') {
          allExamplesTokens += this.estimateCode(ex);
        } else if (ex && typeof ex === 'object') {
          const exObj = ex as Record<string, unknown>;
          const code = exObj['code'];
          if (code && typeof code === 'string') {
            allExamplesTokens += this.estimateCode(code);
          }
        }
      }
    }
    
    // Related memories (IDs)
    let relatedTokens = 0;
    const relatedMemories = m['relatedMemories'];
    if (relatedMemories && Array.isArray(relatedMemories)) {
      relatedTokens = relatedMemories.length * 8; // ~8 tokens per UUID
    }
    
    // Linked entities
    let linkedTokens = 0;
    const linkedFields = ['linkedPatterns', 'linkedConstraints', 'linkedFiles', 'linkedFunctions'];
    for (const field of linkedFields) {
      const value = m[field];
      if (value && Array.isArray(value)) {
        linkedTokens += value.length * 5;
      }
    }
    
    return Math.max(
      500,
      level2 + fullKnowledgeTokens + allExamplesTokens + relatedTokens + linkedTokens
    );
  }

  private estimateObjectRecursive(obj: unknown, depth = 0): number {
    if (depth > 5) return 10; // Prevent infinite recursion
    
    if (obj === null || obj === undefined) return 1;
    if (typeof obj === 'string') return this.estimate(obj);
    if (typeof obj === 'number' || typeof obj === 'boolean') return 1;
    
    if (Array.isArray(obj)) {
      return obj.reduce(
        (sum, item) => sum + this.estimateObjectRecursive(item, depth + 1),
        2 // Array brackets
      );
    }
    
    if (typeof obj === 'object') {
      const entries = Object.entries(obj);
      return entries.reduce(
        (sum, [key, value]) => 
          sum + this.estimate(key) + this.estimateObjectRecursive(value, depth + 1),
        2 // Object braces
      );
    }
    
    return 1;
  }
}
