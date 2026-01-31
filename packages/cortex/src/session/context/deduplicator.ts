/**
 * Context Deduplicator
 * 
 * Deduplicates context before sending to avoid
 * re-sending information already in the session.
 * 
 * @module session/context/deduplicator
 */

import type { Memory } from '../../types/memory.js';
import { LoadedMemoryTracker, type TrackableType } from './tracker.js';

/**
 * Deduplication result
 */
export interface DeduplicationResult<T> {
  /** Items that are new (not previously loaded) */
  new: T[];
  /** Items that were already loaded */
  duplicate: T[];
  /** Number of tokens saved by deduplication */
  tokensSaved: number;
}

/**
 * Context Deduplicator
 * 
 * Uses the LoadedMemoryTracker to filter out
 * items that have already been sent in the session.
 */
export class ContextDeduplicator {
  constructor(private tracker: LoadedMemoryTracker) {}

  /**
   * Deduplicate memories
   */
  deduplicate(memories: Memory[]): Memory[] {
    return memories.filter(m => !this.tracker.isLoaded('memory', m.id));
  }

  /**
   * Deduplicate memories with detailed result
   */
  deduplicateWithDetails(memories: Memory[]): DeduplicationResult<Memory> {
    const newItems: Memory[] = [];
    const duplicates: Memory[] = [];
    let tokensSaved = 0;

    for (const memory of memories) {
      if (this.tracker.isLoaded('memory', memory.id)) {
        duplicates.push(memory);
        // Estimate tokens saved (rough estimate)
        const metadata = this.tracker.getMetadata('memory', memory.id);
        tokensSaved += metadata?.tokenCount ?? 50;
      } else {
        newItems.push(memory);
      }
    }

    return {
      new: newItems,
      duplicate: duplicates,
      tokensSaved,
    };
  }

  /**
   * Deduplicate patterns
   */
  deduplicatePatterns<T extends { id: string }>(patterns: T[]): T[] {
    return patterns.filter(p => !this.tracker.isLoaded('pattern', p.id));
  }

  /**
   * Deduplicate files
   */
  deduplicateFiles(files: string[]): string[] {
    return files.filter(f => !this.tracker.isLoaded('file', f));
  }

  /**
   * Deduplicate constraints
   */
  deduplicateConstraints<T extends { id: string }>(constraints: T[]): T[] {
    return constraints.filter(c => !this.tracker.isLoaded('constraint', c.id));
  }

  /**
   * Get only new items of any type
   */
  getNewOnly<T extends { id: string }>(items: T[], type: TrackableType): T[] {
    return items.filter(item => !this.tracker.isLoaded(type, item.id));
  }

  /**
   * Mark items as loaded after sending
   */
  markSent(
    type: TrackableType,
    ids: string[],
    tokenCounts?: Map<string, number>
  ): void {
    for (const id of ids) {
      const tokenCount = tokenCounts?.get(id);
      if (tokenCount !== undefined) {
        this.tracker.markLoaded(type, id, { tokenCount });
      } else {
        this.tracker.markLoaded(type, id, {});
      }
    }
  }

  /**
   * Mark memories as loaded after sending
   */
  markMemoriesSent(
    memories: Memory[],
    compressionLevels?: Map<string, number>,
    tokenCounts?: Map<string, number>
  ): void {
    for (const memory of memories) {
      const metadata: { compressionLevel?: number; tokenCount?: number } = {};
      const compressionLevel = compressionLevels?.get(memory.id);
      const tokenCount = tokenCounts?.get(memory.id);
      
      if (compressionLevel !== undefined) {
        metadata.compressionLevel = compressionLevel;
      }
      if (tokenCount !== undefined) {
        metadata.tokenCount = tokenCount;
      }
      
      this.tracker.markLoaded('memory', memory.id, metadata);
    }
  }

  /**
   * Get deduplication statistics
   */
  getStats(): {
    memoriesLoaded: number;
    patternsLoaded: number;
    filesLoaded: number;
    constraintsLoaded: number;
    totalTokens: number;
  } {
    return {
      memoriesLoaded: this.tracker.getCount('memory'),
      patternsLoaded: this.tracker.getCount('pattern'),
      filesLoaded: this.tracker.getCount('file'),
      constraintsLoaded: this.tracker.getCount('constraint'),
      totalTokens: this.tracker.getTotalTokens(),
    };
  }

  /**
   * Calculate potential token savings
   */
  calculatePotentialSavings(memories: Memory[]): number {
    let savings = 0;

    for (const memory of memories) {
      if (this.tracker.isLoaded('memory', memory.id)) {
        const metadata = this.tracker.getMetadata('memory', memory.id);
        savings += metadata?.tokenCount || 50;
      }
    }

    return savings;
  }

  /**
   * Reset deduplication state
   */
  reset(): void {
    this.tracker.clear();
  }
}
