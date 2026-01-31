/**
 * Pruning Phase
 * 
 * Phase 4 of consolidation: Remove redundant episodic memories.
 * Marks consolidated episodes as pruned to free up space.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { EpisodicMemory } from '../types/index.js';
import type { AbstractedKnowledge } from './abstraction.js';

/**
 * Pruning result
 */
export interface PruneResult {
  /** Number of memories pruned */
  pruned: number;
  /** Tokens freed */
  tokensFreed: number;
}

/**
 * Pruning phase
 */
export class PruningPhase {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Prune consolidated episodes
   */
  async prune(
    episodes: EpisodicMemory[],
    abstractions: AbstractedKnowledge[]
  ): Promise<PruneResult> {
    // Find episodes that were fully consolidated
    const consolidatedIds = new Set(
      abstractions.flatMap(a => a.sourceEpisodes)
    );

    let pruned = 0;
    let tokensFreed = 0;

    for (const episode of episodes) {
      if (consolidatedIds.has(episode.id)) {
        // Mark as pruned (don't delete, just update status)
        await this.storage.update(episode.id, {
          consolidationStatus: 'pruned',
          archived: true,
          archiveReason: 'consolidated',
        });

        pruned++;
        tokensFreed += this.estimateTokens(episode);
      }
    }

    return { pruned, tokensFreed };
  }

  /**
   * Estimate tokens for an episode
   */
  private estimateTokens(episode: EpisodicMemory): number {
    const content = JSON.stringify(episode);
    return Math.ceil(content.length / 4); // Rough estimate
  }
}
