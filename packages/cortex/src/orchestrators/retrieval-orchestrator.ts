/**
 * Retrieval Orchestrator
 * 
 * Orchestrates memory retrieval with compression, session
 * deduplication, and prediction caching.
 * 
 * @module orchestrators/retrieval-orchestrator
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { Memory, MemoryType } from '../types/index.js';
import type { Intent, RetrievalContext } from '../retrieval/engine.js';
import type { SessionContextManager } from '../session/context/manager.js';
import type { PredictionCache } from '../prediction/cache/prediction-cache.js';
import type { TokenBudgetManagerV2 } from '../compression/budget/manager-v2.js';
import type { HierarchicalCompressorV2 } from '../compression/compressor/hierarchical.js';
import type { CompressedMemory as CompressedMemoryV2 } from '../types/compressed-memory.js';

/**
 * Retrieval result memory with relevance info
 */
export interface RetrievalMemory {
  /** The compressed memory */
  compressed: CompressedMemoryV2;
  /** Relevance score */
  relevanceScore: number;
  /** Why this memory is relevant */
  relevanceReason: string;
}

/**
 * Retrieval result with session tracking
 */
export interface RetrievalResultV2 {
  /** Retrieved memories */
  memories: RetrievalMemory[];
  /** Total candidates considered */
  totalCandidates: number;
  /** Tokens used */
  tokensUsed: number;
  /** Retrieval time in ms */
  retrievalTime: number;
  /** Session tracking info */
  session: {
    /** Memories deduplicated from session */
    deduplicatedCount: number;
    /** Session ID */
    sessionId: string;
    /** Total tokens sent this session */
    totalTokensSent: number;
  };
  /** Prediction info */
  prediction: {
    /** Whether predictions were used */
    usedPredictions: boolean;
    /** Prediction cache hit rate */
    cacheHitRate: number;
  };
}

/**
 * Scored memory for ranking
 */
interface ScoredMemory {
  memory: Memory;
  score: number;
  relevanceReason: string;
}

/**
 * Retrieval Orchestrator
 * 
 * Coordinates retrieval, compression, session tracking,
 * and prediction caching.
 */
export class RetrievalOrchestrator {
  private storage: IMemoryStorage;
  private compressor: HierarchicalCompressorV2 | null;
  private budgetManager: TokenBudgetManagerV2 | null;
  private sessionManager: SessionContextManager | null;
  private predictionCache: PredictionCache | null;

  constructor(
    storage: IMemoryStorage,
    options?: {
      compressor?: HierarchicalCompressorV2;
      budgetManager?: TokenBudgetManagerV2;
      sessionManager?: SessionContextManager;
      predictionCache?: PredictionCache;
    }
  ) {
    this.storage = storage;
    this.compressor = options?.compressor ?? null;
    this.budgetManager = options?.budgetManager ?? null;
    this.sessionManager = options?.sessionManager ?? null;
    this.predictionCache = options?.predictionCache ?? null;
  }

  /**
   * Retrieve memories with full orchestration
   */
  async retrieve(context: RetrievalContext): Promise<RetrievalResultV2> {
    const startTime = Date.now();
    const activeSession = await this.sessionManager?.getActiveSession();
    const sessionId = activeSession?.id ?? 'default';

    // Step 1: Gather candidates
    const candidates = await this.gatherCandidates(context);

    // Step 2: Score and rank
    const scored = await this.scoreAndRank(candidates, context);

    // Step 3: Compress and fit to budget
    const budget = context.maxTokens ?? 2000;
    const compressed = await this.compressAndFit(scored, budget);

    // Step 4: Deduplicate with session
    const { deduplicated, deduplicatedCount } = await this.deduplicateWithSession(compressed, sessionId);

    // Step 5: Track in session
    const tokensUsed = this.estimateTokens(deduplicated);
    if (this.sessionManager && activeSession) {
      for (const mem of deduplicated) {
        await this.sessionManager.recordMemoryLoaded(
          sessionId,
          mem.compressed.memoryId,
          mem.compressed.tokenCount
        );
      }
    }

    // Calculate prediction stats
    const predictionStats = this.calculatePredictionStats(candidates);

    return {
      memories: deduplicated,
      totalCandidates: candidates.length,
      tokensUsed,
      retrievalTime: Date.now() - startTime,
      session: {
        deduplicatedCount,
        sessionId,
        totalTokensSent: activeSession?.tokensSent ?? tokensUsed,
      },
      prediction: predictionStats,
    };
  }

  /**
   * Get the budget manager (for external use)
   */
  getBudgetManager(): TokenBudgetManagerV2 | null {
    return this.budgetManager;
  }

  /**
   * Gather candidate memories
   */
  private async gatherCandidates(context: RetrievalContext): Promise<Memory[]> {
    const candidates: Memory[] = [];
    const seen = new Set<string>();

    // Get from active file
    if (context.activeFile) {
      const fileMemories = await this.storage.findByFile(context.activeFile);
      for (const mem of fileMemories) {
        if (!seen.has(mem.id)) {
          seen.add(mem.id);
          candidates.push(mem);
        }
      }
    }

    // Get from relevant patterns
    if (context.relevantPatterns) {
      for (const patternId of context.relevantPatterns) {
        const patternMemories = await this.storage.findByPattern(patternId);
        for (const mem of patternMemories) {
          if (!seen.has(mem.id)) {
            seen.add(mem.id);
            candidates.push(mem);
          }
        }
      }
    }

    // Get from prediction cache
    if (this.predictionCache && context.activeFile) {
      const predicted = await this.predictionCache.getForFile(context.activeFile);
      if (predicted) {
        for (const pred of predicted) {
          const mem = await this.storage.read(pred.memoryId);
          if (mem && !seen.has(mem.id)) {
            seen.add(mem.id);
            candidates.push(mem);
          }
        }
      }
    }

    // Get by intent-based search
    const intentTypes = this.getTypesForIntent(context.intent);
    for (const type of intentTypes) {
      const typeMemories = await this.storage.findByType(type, { limit: 20 });
      for (const mem of typeMemories) {
        if (!seen.has(mem.id)) {
          seen.add(mem.id);
          candidates.push(mem);
        }
      }
    }

    return candidates;
  }

  /**
   * Score and rank candidates
   */
  private async scoreAndRank(candidates: Memory[], context: RetrievalContext): Promise<ScoredMemory[]> {
    const scored: ScoredMemory[] = [];

    for (const memory of candidates) {
      const score = this.calculateScore(memory, context);
      scored.push({
        memory,
        score,
        relevanceReason: this.getRelevanceReason(memory, context),
      });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  /**
   * Calculate relevance score for a memory
   */
  private calculateScore(memory: Memory, context: RetrievalContext): number {
    let score = memory.confidence;

    // Boost for matching intent
    const intentTypes = this.getTypesForIntent(context.intent);
    if (intentTypes.includes(memory.type)) {
      score += 0.2;
    }

    // Boost for linked to active file
    if (context.activeFile && memory.linkedFiles?.includes(context.activeFile)) {
      score += 0.3;
    }

    // Boost for linked to relevant patterns
    if (context.relevantPatterns && memory.linkedPatterns) {
      const overlap = memory.linkedPatterns.filter(p => context.relevantPatterns!.includes(p));
      score += overlap.length * 0.1;
    }

    // Boost for high importance
    if (memory.importance === 'critical') {
      score += 0.2;
    } else if (memory.importance === 'high') {
      score += 0.1;
    }

    // Boost for recent access
    if (memory.accessCount > 10) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Get relevance reason for a memory
   */
  private getRelevanceReason(memory: Memory, context: RetrievalContext): string {
    if (context.activeFile && memory.linkedFiles?.includes(context.activeFile)) {
      return 'Linked to active file';
    }
    if (context.relevantPatterns && memory.linkedPatterns?.some(p => context.relevantPatterns!.includes(p))) {
      return 'Linked to relevant pattern';
    }
    const intentTypes = this.getTypesForIntent(context.intent);
    if (intentTypes.includes(memory.type)) {
      return `Relevant for ${context.intent}`;
    }
    return 'General relevance';
  }

  /**
   * Compress and fit memories to budget
   */
  private async compressAndFit(scored: ScoredMemory[], budget: number): Promise<RetrievalMemory[]> {
    const result: RetrievalMemory[] = [];
    let usedTokens = 0;

    for (const { memory, score, relevanceReason } of scored) {
      // Estimate tokens for this memory
      const memoryTokens = this.estimateMemoryTokens(memory);

      // Check if it fits
      if (usedTokens + memoryTokens <= budget) {
        if (this.compressor) {
          const compressed = this.compressor.compress(memory, 3);
          result.push({
            compressed,
            relevanceScore: score,
            relevanceReason,
          });
          usedTokens += compressed.tokenCount;
        } else {
          // No compressor - create a simple compressed memory
          result.push({
            compressed: {
              memoryId: memory.id,
              level: 3,
              output: { id: memory.id, type: memory.type, importance: memory.importance, tokens: memoryTokens },
              tokenCount: memoryTokens,
              originalTokenCount: memoryTokens,
              compressionRatio: 1,
              compressedAt: new Date().toISOString(),
            },
            relevanceScore: score,
            relevanceReason,
          });
          usedTokens += memoryTokens;
        }
      } else if (this.compressor) {
        // Try to compress to fit
        const compressed = this.compressor.compressToFit(memory, budget - usedTokens);
        if (compressed.tokenCount <= budget - usedTokens) {
          result.push({
            compressed,
            relevanceScore: score,
            relevanceReason,
          });
          usedTokens += compressed.tokenCount;
        }
      }

      // Stop if budget exhausted
      if (usedTokens >= budget * 0.95) {
        break;
      }
    }

    return result;
  }

  /**
   * Deduplicate with session context
   */
  private async deduplicateWithSession(
    memories: RetrievalMemory[],
    sessionId: string
  ): Promise<{ deduplicated: RetrievalMemory[]; deduplicatedCount: number }> {
    if (!this.sessionManager) {
      return { deduplicated: memories, deduplicatedCount: 0 };
    }

    const activeSession = await this.sessionManager.getActiveSession();
    if (!activeSession || activeSession.id !== sessionId) {
      return { deduplicated: memories, deduplicatedCount: 0 };
    }

    const deduplicated: RetrievalMemory[] = [];
    let deduplicatedCount = 0;

    for (const mem of memories) {
      if (!activeSession.loadedMemories.has(mem.compressed.memoryId)) {
        deduplicated.push(mem);
      } else {
        deduplicatedCount++;
      }
    }

    return { deduplicated, deduplicatedCount };
  }

  /**
   * Get memory types relevant for an intent
   */
  private getTypesForIntent(intent: Intent): MemoryType[] {
    switch (intent) {
      case 'add_feature':
        return ['pattern_rationale', 'tribal', 'procedural', 'constraint_override'];
      case 'fix_bug':
        return ['tribal', 'code_smell', 'decision_context'];
      case 'refactor':
        return ['pattern_rationale', 'decision_context', 'code_smell'];
      case 'security_audit':
        return ['tribal', 'constraint_override', 'code_smell'];
      case 'understand_code':
        return ['pattern_rationale', 'decision_context', 'semantic'];
      case 'add_test':
        return ['procedural', 'pattern_rationale'];
      default:
        return ['tribal', 'pattern_rationale', 'procedural'];
    }
  }

  /**
   * Estimate tokens for memories
   */
  private estimateTokens(memories: RetrievalMemory[]): number {
    return memories.reduce((sum, m) => sum + m.compressed.tokenCount, 0);
  }

  /**
   * Estimate tokens for a single memory
   */
  private estimateMemoryTokens(memory: Memory): number {
    const json = JSON.stringify(memory);
    return Math.ceil(json.length / 4);
  }

  /**
   * Calculate prediction statistics
   */
  private calculatePredictionStats(candidates: Memory[]): { usedPredictions: boolean; cacheHitRate: number } {
    if (!this.predictionCache) {
      return { usedPredictions: false, cacheHitRate: 0 };
    }

    const stats = this.predictionCache.getStats();
    return {
      usedPredictions: candidates.length > 0,
      cacheHitRate: stats.hitRate,
    };
  }
}
