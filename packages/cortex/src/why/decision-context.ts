/**
 * Decision Context Gatherer
 * 
 * Gathers decision context from memory.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { DecisionContextMemory } from '../types/index.js';
import type { DecisionContext } from './synthesizer.js';

/**
 * Decision context gatherer
 */
export class DecisionContextGatherer {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Gather decision context for a focus area
   */
  async gather(focus: string): Promise<DecisionContext[]> {
    // Search for decision context memories related to the focus
    const memories = await this.storage.search({
      types: ['decision_context'],
      topics: [focus],
      limit: 10,
    });

    return memories.map(m => {
      const mem = m as DecisionContextMemory;
      const result: DecisionContext = {
        decisionId: mem.decisionId,
        summary: mem.decisionSummary,
        stillValid: mem.stillValid,
      };
      if (mem.businessContext) {
        result.businessContext = mem.businessContext;
      }
      return result;
    });
  }
}
