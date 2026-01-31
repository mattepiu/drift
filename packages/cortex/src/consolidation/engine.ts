/**
 * Consolidation Engine
 * 
 * Main orchestrator for sleep-inspired memory consolidation.
 * Runs periodically to compress episodic memories into semantic knowledge.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import { ReplayPhase } from './replay.js';
import { AbstractionPhase } from './abstraction.js';
import { IntegrationPhase } from './integration.js';
import { PruningPhase } from './pruning.js';
import { StrengtheningPhase } from './strengthening.js';

/**
 * Result of consolidation
 */
export interface ConsolidationResult {
  /** Number of episodes processed */
  episodesProcessed: number;
  /** Number of new memories created */
  memoriesCreated: number;
  /** Number of memories updated */
  memoriesUpdated: number;
  /** Number of memories pruned */
  memoriesPruned: number;
  /** Tokens freed by pruning */
  tokensFreed: number;
  /** Duration in ms */
  duration: number;
}

/**
 * Consolidation configuration
 */
export interface ConsolidationConfig {
  /** Minimum episodes before consolidation */
  minEpisodes: number;
  /** Days before episode is eligible */
  maxEpisodeAge: number;
  /** Minimum similar episodes to consolidate */
  consolidationThreshold: number;
  /** Whether to prune after consolidation */
  pruneAfterConsolidation: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ConsolidationConfig = {
  minEpisodes: 5,
  maxEpisodeAge: 7,
  consolidationThreshold: 3,
  pruneAfterConsolidation: true,
};

/**
 * Consolidation engine
 */
export class ConsolidationEngine {
  private config: ConsolidationConfig;

  private replayPhase: ReplayPhase;
  private abstractionPhase: AbstractionPhase;
  private integrationPhase: IntegrationPhase;
  private pruningPhase: PruningPhase;
  private strengtheningPhase: StrengtheningPhase;

  constructor(storage: IMemoryStorage, config?: Partial<ConsolidationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.replayPhase = new ReplayPhase(storage);
    this.abstractionPhase = new AbstractionPhase();
    this.integrationPhase = new IntegrationPhase(storage);
    this.pruningPhase = new PruningPhase(storage);
    this.strengtheningPhase = new StrengtheningPhase(storage);
  }

  /**
   * Run consolidation
   */
  async consolidate(dryRun = false): Promise<ConsolidationResult> {
    const startTime = Date.now();

    // PHASE 1: REPLAY - Select episodic memories for consolidation
    const episodes = await this.replayPhase.selectMemories({
      minAge: this.config.maxEpisodeAge,
      status: 'pending',
      limit: 100,
    });

    if (episodes.length < this.config.minEpisodes) {
      return {
        episodesProcessed: 0,
        memoriesCreated: 0,
        memoriesUpdated: 0,
        memoriesPruned: 0,
        tokensFreed: 0,
        duration: Date.now() - startTime,
      };
    }

    // PHASE 2: ABSTRACTION - Extract patterns from episodes
    const abstractions = await this.abstractionPhase.extract(episodes);

    // PHASE 3: INTEGRATION - Merge with existing semantic memory
    const { created, updated } = dryRun
      ? { created: abstractions.length, updated: 0 }
      : await this.integrationPhase.merge(abstractions);

    // PHASE 4: PRUNING - Remove redundant episodes
    let pruned = 0;
    let tokensFreed = 0;
    if (this.config.pruneAfterConsolidation && !dryRun) {
      const pruneResult = await this.pruningPhase.prune(episodes, abstractions);
      pruned = pruneResult.pruned;
      tokensFreed = pruneResult.tokensFreed;
    }

    // PHASE 5: STRENGTHENING - Boost frequently accessed memories
    if (!dryRun) {
      await this.strengtheningPhase.boost();
    }

    return {
      episodesProcessed: episodes.length,
      memoriesCreated: created,
      memoriesUpdated: updated,
      memoriesPruned: pruned,
      tokensFreed,
      duration: Date.now() - startTime,
    };
  }
}
