/**
 * Strengthening Phase
 * 
 * Phase 5 of consolidation: Boost frequently accessed memories.
 * Memories that are used often resist decay.
 */

import type { IMemoryStorage } from '../storage/interface.js';

/**
 * Strengthening phase
 */
export class StrengtheningPhase {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Boost frequently accessed memories
   */
  async boost(): Promise<void> {
    // Find frequently accessed memories
    const frequentlyAccessed = await this.storage.search({
      minAccessCount: 5,
      orderBy: 'accessCount',
      orderDir: 'desc',
      limit: 50,
    });

    // Boost their confidence slightly
    for (const memory of frequentlyAccessed) {
      const boost = Math.min(0.1, memory.accessCount * 0.01);
      const newConfidence = Math.min(1.0, memory.confidence + boost);

      if (newConfidence > memory.confidence) {
        await this.storage.update(memory.id, {
          confidence: newConfidence,
        });
      }
    }
  }
}
