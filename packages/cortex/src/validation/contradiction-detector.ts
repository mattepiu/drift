/**
 * Contradiction Detector
 * 
 * Detects contradictions between memories.
 * Newer memories with higher confidence win.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { Memory } from '../types/index.js';
import type { ValidationIssue } from './engine.js';

/**
 * Contradiction detector
 */
export class ContradictionDetector {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Detect contradictions for a memory
   */
  async detect(memory: Memory): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Find related memories
    const related = await this.findRelated(memory);

    for (const other of related) {
      if (other.id === memory.id) continue;

      const contradiction = this.checkContradiction(memory, other);
      if (contradiction) {
        // Newer memory with higher confidence wins
        const otherWins =
          other.confidence > memory.confidence &&
          new Date(other.createdAt) > new Date(memory.createdAt);

        if (otherWins) {
          issues.push({
            dimension: 'contradiction',
            severity: 'moderate',
            description: `Contradicted by newer memory: ${other.summary}`,
            suggestion: 'Consider archiving this memory',
          });
        }
      }
    }

    return issues;
  }

  /**
   * Find related memories
   */
  private async findRelated(memory: Memory): Promise<Memory[]> {
    const queries: Promise<Memory[]>[] = [];

    if ('topic' in memory && memory.topic) {
      queries.push(this.storage.search({ topics: [memory.topic], limit: 10 }));
    }

    if (memory.linkedPatterns?.length) {
      for (const patternId of memory.linkedPatterns.slice(0, 3)) {
        queries.push(this.storage.findByPattern(patternId));
      }
    }

    const results = await Promise.all(queries);
    return results.flat();
  }

  /**
   * Check if two memories contradict each other
   */
  private checkContradiction(a: Memory, b: Memory): boolean {
    // Simple heuristic: same topic but different content
    const aWithTopic = a as Memory & { topic?: string; knowledge?: string };
    const bWithTopic = b as Memory & { topic?: string; knowledge?: string };

    if (aWithTopic.topic && bWithTopic.topic) {
      if (aWithTopic.topic === bWithTopic.topic) {
        const aContent = aWithTopic.knowledge || a.summary;
        const bContent = bWithTopic.knowledge || b.summary;

        // High topic overlap + low content similarity = contradiction
        const similarity = this.calculateSimilarity(aContent, bContent);
        return similarity < 0.3;
      }
    }

    return false;
  }

  /**
   * Calculate similarity between two strings
   */
  private calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.size / union.size;
  }
}
