/**
 * Token Budget Manager V2
 * 
 * Manages token budgets for memory retrieval with
 * intelligent level escalation and session awareness.
 * 
 * @module compression/budget/manager-v2
 */

import type {
  CompressionLevel,
  CompressedMemory,
  TokenBudget,
} from '../../types/compressed-memory.js';
import type { SessionContext } from '../../types/session-context.js';
import type { Memory } from '../../types/memory.js';
import { HierarchicalCompressorV2 } from '../compressor/hierarchical.js';
import { TokenEstimator } from './estimator.js';
import { GreedyPacker, type PackableItem } from './packer.js';

/**
 * Scored memory for budget allocation
 */
export interface ScoredMemory {
  /** The memory */
  memory: Memory;
  /** Relevance score (0.0 - 1.0) */
  score: number;
  /** Whether this memory is new to the session */
  isNew?: boolean;
}

/**
 * Options for budget fitting
 */
export interface BudgetOptions {
  /** Prefer newer memories */
  preferNew?: boolean;
  /** Minimum compression level */
  minLevel?: CompressionLevel;
  /** Maximum compression level */
  maxLevel?: CompressionLevel;
  /** Session context for deduplication */
  sessionContext?: SessionContext;
  /** Reserved tokens for system prompts */
  reservedTokens?: number;
  /** Target utilization (0.0 - 1.0) */
  targetUtilization?: number;
}

/**
 * Budget allocation result
 */
export interface BudgetAllocation {
  /** Compressed memories */
  memories: CompressedMemory[];
  /** Total tokens used */
  tokensUsed: number;
  /** Tokens remaining */
  tokensRemaining: number;
  /** Budget utilization (0.0 - 1.0) */
  utilization: number;
  /** Compression level distribution */
  levelDistribution: Record<CompressionLevel, number>;
  /** Memories that didn't fit */
  excluded: string[];
  /** Tokens saved by deduplication */
  tokensSavedByDedup: number;
}

/**
 * Token Budget Manager V2
 * 
 * Fits memories to token budgets with:
 * - Intelligent level escalation
 * - Session-aware deduplication
 * - Priority-based allocation
 */
export class TokenBudgetManagerV2 {
  private compressor: HierarchicalCompressorV2;
  private estimator: TokenEstimator;
  private packer: GreedyPacker;

  constructor(
    compressor?: HierarchicalCompressorV2,
    estimator?: TokenEstimator,
    packer?: GreedyPacker
  ) {
    this.compressor = compressor || new HierarchicalCompressorV2();
    this.estimator = estimator || new TokenEstimator();
    this.packer = packer || new GreedyPacker();
  }

  /**
   * Fit memories to a token budget
   */
  fitToBudget(
    candidates: ScoredMemory[],
    budget: number,
    options: BudgetOptions = {}
  ): BudgetAllocation {
    const {
      preferNew = true,
      minLevel = 0,
      maxLevel = 3,
      sessionContext,
      reservedTokens = 0,
      // targetUtilization is available for future use
    } = options;

    const availableBudget = budget - reservedTokens;
    
    if (availableBudget <= 0 || candidates.length === 0) {
      return this.emptyAllocation(budget);
    }

    // Filter out already-loaded memories if session context provided
    let filteredCandidates = candidates;
    let tokensSavedByDedup = 0;

    if (sessionContext) {
      const { filtered, saved } = this.deduplicateWithSession(
        candidates,
        sessionContext
      );
      filteredCandidates = filtered;
      tokensSavedByDedup = saved;
    }

    // Adjust scores based on preferences
    const adjusted = this.adjustScores(filteredCandidates, preferNew);

    // Convert to packable items with estimated tokens
    const packableItems = this.toPackableItems(adjusted, maxLevel);

    // Pack items into budget
    const packResult = this.packer.pack(packableItems, availableBudget, {
      strategy: 'balanced',
    });

    // Compress packed items with level escalation
    const compressed = this.compressWithEscalation(
      packResult.packed,
      adjusted,
      availableBudget,
      minLevel,
      maxLevel
    );

    // Calculate level distribution
    const levelDistribution = this.calculateLevelDistribution(compressed);

    const tokensUsed = compressed.reduce((sum, c) => sum + c.tokenCount, 0);

    return {
      memories: compressed,
      tokensUsed,
      tokensRemaining: budget - tokensUsed,
      utilization: availableBudget > 0 ? tokensUsed / availableBudget : 0,
      levelDistribution,
      excluded: packResult.remaining.map(r => r.id),
      tokensSavedByDedup,
    };
  }

  /**
   * Calculate token budget breakdown
   */
  calculateBudget(
    totalTokens: number,
    reservedForSystem: number = 0,
    reservedForResponse: number = 0
  ): TokenBudget {
    const reserved = reservedForSystem + reservedForResponse;
    const availableForMemories = Math.max(0, totalTokens - reserved);

    return {
      total: totalTokens,
      used: 0,
      remaining: totalTokens,
      reserved,
      availableForMemories,
    };
  }

  /**
   * Estimate how many memories can fit at each level
   */
  estimateCapacity(
    budget: number
  ): Record<CompressionLevel, number> {
    return {
      0: Math.floor(budget / 5),   // ~5 tokens per level 0
      1: Math.floor(budget / 50),  // ~50 tokens per level 1
      2: Math.floor(budget / 200), // ~200 tokens per level 2
      3: Math.floor(budget / 500), // ~500 tokens per level 3
    };
  }

  /**
   * Suggest optimal level distribution for a set of memories
   */
  suggestLevelDistribution(
    memories: ScoredMemory[],
    budget: number
  ): Map<string, CompressionLevel> {
    const distribution = new Map<string, CompressionLevel>();
    
    // Sort by score
    const sorted = [...memories].sort((a, b) => b.score - a.score);
    
    let remainingBudget = budget;
    
    for (const { memory, score } of sorted) {
      // Higher scored memories get higher levels
      let targetLevel: CompressionLevel;
      
      if (score >= 0.8) {
        targetLevel = 3;
      } else if (score >= 0.6) {
        targetLevel = 2;
      } else if (score >= 0.4) {
        targetLevel = 1;
      } else {
        targetLevel = 0;
      }

      // Check if it fits
      const tokens = this.compressor.getTokenCount(memory, targetLevel);
      
      while (targetLevel > 0 && tokens > remainingBudget) {
        targetLevel = (targetLevel - 1) as CompressionLevel;
      }

      const actualTokens = this.compressor.getTokenCount(memory, targetLevel);
      
      if (actualTokens <= remainingBudget) {
        distribution.set(memory.id, targetLevel);
        remainingBudget -= actualTokens;
      } else {
        // Doesn't fit at any level
        distribution.set(memory.id, 0);
      }
    }

    return distribution;
  }

  // Private helper methods

  private emptyAllocation(budget: number): BudgetAllocation {
    return {
      memories: [],
      tokensUsed: 0,
      tokensRemaining: budget,
      utilization: 0,
      levelDistribution: { 0: 0, 1: 0, 2: 0, 3: 0 },
      excluded: [],
      tokensSavedByDedup: 0,
    };
  }

  private deduplicateWithSession(
    candidates: ScoredMemory[],
    sessionContext: SessionContext
  ): { filtered: ScoredMemory[]; saved: number } {
    const filtered: ScoredMemory[] = [];
    let saved = 0;

    for (const candidate of candidates) {
      if (sessionContext.loadedMemories.has(candidate.memory.id)) {
        // Already loaded - estimate tokens saved
        saved += this.estimator.estimateMemory(candidate.memory, 2);
      } else {
        filtered.push({ ...candidate, isNew: true });
      }
    }

    return { filtered, saved };
  }

  private adjustScores(
    candidates: ScoredMemory[],
    preferNew: boolean
  ): ScoredMemory[] {
    if (!preferNew) {
      return candidates;
    }

    return candidates.map(c => ({
      ...c,
      score: c.isNew ? c.score * 1.1 : c.score, // 10% boost for new memories
    }));
  }

  private toPackableItems(
    candidates: ScoredMemory[],
    maxLevel: CompressionLevel
  ): PackableItem[] {
    return candidates.map(c => ({
      id: c.memory.id,
      tokens: this.estimator.estimateMemory(c.memory, maxLevel),
      priority: c.score,
      metadata: { memory: c.memory },
    }));
  }

  private compressWithEscalation(
    packed: PackableItem[],
    candidates: ScoredMemory[],
    budget: number,
    minLevel: CompressionLevel,
    maxLevel: CompressionLevel
  ): CompressedMemory[] {
    const compressed: CompressedMemory[] = [];
    let remainingBudget = budget;

    // Create lookup for memories
    const memoryMap = new Map<string, Memory>();
    for (const c of candidates) {
      memoryMap.set(c.memory.id, c.memory);
    }

    // Sort packed items by priority (highest first)
    const sortedPacked = [...packed].sort((a, b) => b.priority - a.priority);

    for (const item of sortedPacked) {
      const memory = memoryMap.get(item.id);
      if (!memory) continue;

      // Try to compress at highest level that fits
      const result = this.compressor.compressToFit(memory, remainingBudget, {
        minLevel,
        maxLevel,
      });

      compressed.push(result);
      remainingBudget -= result.tokenCount;
    }

    return compressed;
  }

  private calculateLevelDistribution(
    compressed: CompressedMemory[]
  ): Record<CompressionLevel, number> {
    const distribution: Record<CompressionLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

    for (const c of compressed) {
      distribution[c.level]++;
    }

    return distribution;
  }
}
