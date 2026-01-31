/**
 * Replay Phase
 * 
 * Phase 1 of consolidation: Select episodic memories for processing.
 * Inspired by memory replay during sleep.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { EpisodicMemory } from '../types/index.js';

/**
 * Criteria for selecting memories to replay
 */
export interface ReplayCriteria {
  /** Minimum age in days */
  minAge: number;
  /** Consolidation status filter */
  status: 'pending' | 'all';
  /** Maximum memories to select */
  limit: number;
}

/**
 * Replay phase
 */
export class ReplayPhase {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Select memories for consolidation
   */
  async selectMemories(criteria: ReplayCriteria): Promise<EpisodicMemory[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - criteria.minAge);

    const query: Parameters<typeof this.storage.search>[0] = {
      types: ['episodic'],
      maxDate: cutoffDate.toISOString(),
      limit: criteria.limit,
      orderBy: 'accessCount',
      orderDir: 'desc',
    };

    // Only add consolidationStatus if filtering for pending
    if (criteria.status === 'pending') {
      query.consolidationStatus = 'pending';
    }

    const episodes = await this.storage.search(query);

    return episodes as EpisodicMemory[];
  }
}
