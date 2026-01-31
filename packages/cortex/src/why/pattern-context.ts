/**
 * Pattern Context Gatherer
 * 
 * Gathers pattern rationales from memory.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { PatternRationaleMemory } from '../types/index.js';
import type { PatternContext } from './synthesizer.js';

/**
 * Pattern context gatherer
 */
export class PatternContextGatherer {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Gather pattern context for given pattern IDs
   */
  async gather(patternIds: string[]): Promise<PatternContext[]> {
    if (patternIds.length === 0) return [];

    const contexts: PatternContext[] = [];

    for (const patternId of patternIds) {
      const memories = await this.storage.findByPattern(patternId);
      const rationale = memories.find(m => m.type === 'pattern_rationale') as PatternRationaleMemory | undefined;

      if (rationale) {
        const ctx: PatternContext = {
          patternId: rationale.patternId,
          patternName: rationale.patternName,
          rationale: rationale.rationale,
        };
        if (rationale.businessContext) {
          ctx.businessContext = rationale.businessContext;
        }
        contexts.push(ctx);
      } else {
        // No rationale found, just include pattern ID
        contexts.push({
          patternId,
          patternName: patternId,
        });
      }
    }

    return contexts;
  }
}
