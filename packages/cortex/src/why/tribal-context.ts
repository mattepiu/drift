/**
 * Tribal Context Gatherer
 * 
 * Gathers tribal knowledge from memory.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { TribalMemory } from '../types/index.js';
import type { TribalContext } from './synthesizer.js';

/**
 * Tribal context gatherer
 */
export class TribalContextGatherer {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Gather tribal knowledge for a focus area
   */
  async gather(focus: string): Promise<TribalContext[]> {
    // Search for tribal memories related to the focus
    const memories = await this.storage.search({
      types: ['tribal'],
      topics: [focus],
      limit: 20,
    });

    return memories.map(m => {
      const mem = m as TribalMemory;
      return {
        topic: mem.topic,
        knowledge: mem.knowledge,
        severity: mem.severity,
        confidence: mem.confidence,
      };
    });
  }
}
