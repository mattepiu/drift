/**
 * Cortex V2 - Main Orchestrator
 * 
 * Top-level orchestrator that coordinates all Cortex v2 subsystems:
 * - Retrieval with compression and session tracking
 * - Learning from feedback and corrections
 * - Generation context building
 * - Prediction and caching
 * - Health monitoring
 * 
 * @module orchestrators/cortex-v2
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { Memory, MemoryType } from '../types/index.js';
import type { Intent, RetrievalContext } from '../retrieval/engine.js';
import type { ICausalStorage } from '../causal/storage/interface.js';
import type { SessionContextManager } from '../session/context/manager.js';
import type { PredictionCache } from '../prediction/cache/prediction-cache.js';
import type { TokenBudgetManagerV2 } from '../compression/budget/manager-v2.js';
import type { HierarchicalCompressorV2 } from '../compression/compressor/hierarchical.js';
import type { CausalInferenceEngine } from '../causal/inference/engine.js';
import type { CausalGraphTraverser } from '../causal/traversal/traverser.js';
import type { NarrativeGenerator } from '../causal/narrative/generator.js';
import type { GenerationTarget, GenerationContext, GeneratedCode, GenerationOutcome } from '../types/generation-context.js';
import type { CompressedMemory } from '../types/compressed-memory.js';
import type { PredictedMemory } from '../types/prediction.js';
import type { CausalNode } from '../types/causal.js';

import { RetrievalOrchestrator } from './retrieval-orchestrator.js';
import { LearningOrchestrator, type LearnResult, type FeedbackType, type FeedbackResult } from './learning-orchestrator.js';
import { GenerationOrchestrator, type OutcomeTrackResult } from './generation-orchestrator.js';

/**
 * Context retrieval options
 */
export interface ContextOptions {
  /** Maximum tokens to use */
  maxTokens?: number;
  /** Compression level (1-3) */
  compressionLevel?: 1 | 2 | 3;
  /** Include causal chains */
  includeCausal?: boolean;
  /** Session ID to use */
  sessionId?: string;
}

/**
 * Context retrieval result
 */
export interface ContextResult {
  /** Retrieved memories */
  memories: Array<{
    compressed: CompressedMemory;
    relevanceScore: number;
    relevanceReason: string;
  }>;
  /** Total tokens used */
  tokensUsed: number;
  /** Session info */
  session: {
    sessionId: string;
    deduplicatedCount: number;
    totalTokensSent: number;
  };
  /** Retrieval time */
  retrievalTimeMs: number;
}

/**
 * Why result with causal narrative
 */
export interface WhyResult {
  /** The narrative explanation */
  narrative: string;
  /** Causal chain */
  causalChain: Array<{
    node: CausalNode;
    relationship: string;
    confidence: number;
  }>;
  /** Sources used */
  sources: string[];
  /** Overall confidence */
  confidence: number;
}

/**
 * Health report
 */
export interface HealthReport {
  /** Overall health score (0-100) */
  overallScore: number;
  /** Memory statistics */
  memoryStats: {
    total: number;
    byType: Record<string, number>;
    avgConfidence: number;
    lowConfidenceCount: number;
  };
  /** Session statistics */
  sessionStats: {
    activeSessions: number;
    totalTokensSent: number;
  };
  /** Prediction statistics */
  predictionStats: {
    cacheHitRate: number;
    totalPredictions: number;
  };
  /** Issues found */
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    recommendation: string;
  }>;
  /** Recommendations */
  recommendations: string[];
}

/**
 * Consolidation options
 */
export interface ConsolidateOptions {
  /** Minimum confidence to keep */
  minConfidence?: number;
  /** Maximum age in days */
  maxAgeDays?: number;
  /** Merge similar memories */
  mergeSimilar?: boolean;
}

/**
 * Consolidation result
 */
export interface ConsolidateResult {
  /** Memories removed */
  removed: number;
  /** Memories merged */
  merged: number;
  /** Memories updated */
  updated: number;
  /** Space saved (estimated tokens) */
  spaceSaved: number;
}

/**
 * Validation options
 */
export interface ValidateOptions {
  /** Fix issues automatically */
  autoFix?: boolean;
  /** Types to validate */
  types?: MemoryType[];
}

/**
 * Validation result
 */
export interface ValidateResult {
  /** Whether all memories are valid */
  valid: boolean;
  /** Issues found */
  issues: Array<{
    memoryId: string;
    issue: string;
    fixed: boolean;
  }>;
  /** Total memories validated */
  totalValidated: number;
}

/**
 * Cortex V2 - Main Entry Point
 * 
 * Coordinates all Cortex v2 subsystems for a unified API.
 */
export class CortexV2 {
  private storage: IMemoryStorage;
  private causalStorage: ICausalStorage | null;
  private sessionManager: SessionContextManager | null;
  private predictionCache: PredictionCache | null;
  private budgetManager: TokenBudgetManagerV2 | null;
  private compressor: HierarchicalCompressorV2 | null;
  private causalInference: CausalInferenceEngine | null;
  private causalTraverser: CausalGraphTraverser | null;
  private narrativeGenerator: NarrativeGenerator | null;

  private retrievalOrchestrator: RetrievalOrchestrator;
  private learningOrchestrator: LearningOrchestrator;
  private generationOrchestrator: GenerationOrchestrator;

  constructor(
    storage: IMemoryStorage,
    options?: {
      causalStorage?: ICausalStorage;
      sessionManager?: SessionContextManager;
      predictionCache?: PredictionCache;
      budgetManager?: TokenBudgetManagerV2;
      compressor?: HierarchicalCompressorV2;
      causalInference?: CausalInferenceEngine;
      causalTraverser?: CausalGraphTraverser;
      narrativeGenerator?: NarrativeGenerator;
      // Sub-orchestrators (optional - will be created if not provided)
      retrievalOrchestrator?: RetrievalOrchestrator;
      learningOrchestrator?: LearningOrchestrator;
      generationOrchestrator?: GenerationOrchestrator;
    }
  ) {
    this.storage = storage;
    this.causalStorage = options?.causalStorage ?? null;
    this.sessionManager = options?.sessionManager ?? null;
    this.predictionCache = options?.predictionCache ?? null;
    this.budgetManager = options?.budgetManager ?? null;
    this.compressor = options?.compressor ?? null;
    this.causalInference = options?.causalInference ?? null;
    this.causalTraverser = options?.causalTraverser ?? null;
    this.narrativeGenerator = options?.narrativeGenerator ?? null;

    // Initialize sub-orchestrators
    if (options?.retrievalOrchestrator) {
      this.retrievalOrchestrator = options.retrievalOrchestrator;
    } else {
      const retrievalOpts: {
        compressor?: HierarchicalCompressorV2;
        budgetManager?: TokenBudgetManagerV2;
        sessionManager?: SessionContextManager;
        predictionCache?: PredictionCache;
      } = {};
      if (this.compressor) retrievalOpts.compressor = this.compressor;
      if (this.budgetManager) retrievalOpts.budgetManager = this.budgetManager;
      if (this.sessionManager) retrievalOpts.sessionManager = this.sessionManager;
      if (this.predictionCache) retrievalOpts.predictionCache = this.predictionCache;
      this.retrievalOrchestrator = new RetrievalOrchestrator(storage, retrievalOpts);
    }

    if (options?.learningOrchestrator) {
      this.learningOrchestrator = options.learningOrchestrator;
    } else {
      const learningOpts: {
        causalInference?: CausalInferenceEngine;
        causalStorage?: ICausalStorage;
      } = {};
      if (this.causalInference) learningOpts.causalInference = this.causalInference;
      if (this.causalStorage) learningOpts.causalStorage = this.causalStorage;
      this.learningOrchestrator = new LearningOrchestrator(storage, learningOpts);
    }

    if (options?.generationOrchestrator) {
      this.generationOrchestrator = options.generationOrchestrator;
    } else {
      const generationOpts: {
        budgetManager?: TokenBudgetManagerV2;
        sessionManager?: SessionContextManager;
      } = {};
      if (this.budgetManager) generationOpts.budgetManager = this.budgetManager;
      if (this.sessionManager) generationOpts.sessionManager = this.sessionManager;
      this.generationOrchestrator = new GenerationOrchestrator(storage, generationOpts);
    }
  }

  // ==================== RETRIEVAL ====================

  /**
   * Get context for a given intent and focus
   */
  async getContext(
    intent: Intent,
    focus: string,
    options?: ContextOptions
  ): Promise<ContextResult> {
    const context: RetrievalContext = {
      intent,
      focus,
      activeFile: focus,
      maxTokens: options?.maxTokens ?? 2000,
    };

    const result = await this.retrievalOrchestrator.retrieve(context);

    return {
      memories: result.memories,
      tokensUsed: result.tokensUsed,
      session: result.session,
      retrievalTimeMs: result.retrievalTime,
    };
  }

  /**
   * Get causal "why" narrative for a focus area
   */
  async getWhy(_intent: Intent, focus: string): Promise<WhyResult> {
    if (!this.causalTraverser || !this.narrativeGenerator) {
      return {
        narrative: 'Causal analysis not available',
        causalChain: [],
        sources: [],
        confidence: 0,
      };
    }

    // Find relevant memories
    const memories = await this.storage.findByFile(focus);
    if (memories.length === 0) {
      return {
        narrative: `No memories found for ${focus}`,
        causalChain: [],
        sources: [],
        confidence: 0,
      };
    }

    // Get causal chain for the first relevant memory
    const rootMemory = memories[0];
    if (!rootMemory) {
      return {
        narrative: `No memories found for ${focus}`,
        causalChain: [],
        sources: [],
        confidence: 0,
      };
    }

    const chain = await this.causalTraverser.traceOrigins(rootMemory.id, { maxDepth: 5 });

    // Generate narrative
    const narrative = this.narrativeGenerator.generateNarrative(chain);

    return {
      narrative: narrative.text,
      causalChain: chain.nodes.map((node: CausalNode) => ({
        node,
        relationship: 'caused_by',
        confidence: chain.chainConfidence,
      })),
      sources: chain.nodes.map((n: CausalNode) => n.memoryId),
      confidence: narrative.confidence,
    };
  }

  // ==================== LEARNING ====================

  /**
   * Learn from a correction
   */
  async learn(
    original: string,
    feedback: string,
    correctedCode?: string,
    context?: {
      activeFile?: string;
      intent?: string;
      relatedMemoryIds?: string[];
    }
  ): Promise<LearnResult> {
    return this.learningOrchestrator.learnFromCorrection(
      original,
      feedback,
      correctedCode,
      context
    );
  }

  /**
   * Process feedback on a memory
   */
  async processFeedback(
    memoryId: string,
    feedback: FeedbackType,
    details?: string
  ): Promise<FeedbackResult> {
    return this.learningOrchestrator.processFeedback(memoryId, feedback, details);
  }

  /**
   * Get memories that need validation
   */
  async getValidationCandidates(limit: number = 10): Promise<Array<{
    memoryId: string;
    reason: string;
    priority: number;
    suggestedPrompt: string;
  }>> {
    const candidates = await this.learningOrchestrator.getValidationCandidates(limit);
    return candidates.map(c => ({
      memoryId: c.memoryId,
      reason: c.reason,
      priority: c.priority,
      suggestedPrompt: c.suggestedPrompt,
    }));
  }

  // ==================== GENERATION ====================

  /**
   * Build generation context
   */
  async buildGenerationContext(
    intent: Intent,
    target: GenerationTarget,
    query: string,
    options?: { maxTokens?: number }
  ): Promise<GenerationContext> {
    const result = await this.generationOrchestrator.buildContext(
      intent,
      target,
      query,
      options
    );
    return result.context;
  }

  /**
   * Track generation outcome
   */
  async trackGenerationOutcome(
    generation: GeneratedCode,
    outcome: GenerationOutcome,
    feedback?: string
  ): Promise<OutcomeTrackResult> {
    return this.generationOrchestrator.trackOutcome(generation, outcome, feedback);
  }

  // ==================== PREDICTION ====================

  /**
   * Get predicted memories for a file
   */
  async predict(activeFile: string): Promise<PredictedMemory[]> {
    if (!this.predictionCache) {
      return [];
    }

    const cached = await this.predictionCache.getForFile(activeFile);
    return cached ?? [];
  }

  // ==================== HEALTH ====================

  /**
   * Get comprehensive health report
   */
  async getHealth(): Promise<HealthReport> {
    // Get all memories using search
    const memories = await this.storage.search({ limit: 1000 });
    
    // Calculate memory stats
    const byType: Record<string, number> = {};
    let confidenceSum = 0;
    let lowConfidenceCount = 0;

    for (const memory of memories) {
      byType[memory.type] = (byType[memory.type] ?? 0) + 1;
      confidenceSum += memory.confidence;
      if (memory.confidence < 0.5) {
        lowConfidenceCount++;
      }
    }

    const avgConfidence = memories.length > 0 ? confidenceSum / memories.length : 0;

    // Get session stats
    const activeSession = await this.sessionManager?.getActiveSession();
    const sessionStats = {
      activeSessions: activeSession ? 1 : 0,
      totalTokensSent: activeSession?.tokensSent ?? 0,
    };

    // Get prediction stats
    const predictionStats = this.predictionCache?.getStats();
    const cacheHitRate = predictionStats?.hitRate ?? 0;

    // Identify issues
    const issues: HealthReport['issues'] = [];
    const recommendations: string[] = [];

    if (avgConfidence < 0.5) {
      issues.push({
        severity: 'high',
        message: 'Average memory confidence is low',
        recommendation: 'Run validation to confirm or remove low-confidence memories',
      });
      recommendations.push('Consider running drift_memory_validate to clean up low-confidence memories');
    }

    if (lowConfidenceCount > memories.length * 0.3) {
      issues.push({
        severity: 'medium',
        message: `${lowConfidenceCount} memories have low confidence`,
        recommendation: 'Review and validate these memories',
      });
    }

    if (memories.length > 500) {
      recommendations.push('Consider running consolidation to merge similar memories');
    }

    // Calculate overall score
    let overallScore = 100;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          overallScore -= 30;
          break;
        case 'high':
          overallScore -= 20;
          break;
        case 'medium':
          overallScore -= 10;
          break;
        case 'low':
          overallScore -= 5;
          break;
      }
    }

    return {
      overallScore: Math.max(0, overallScore),
      memoryStats: {
        total: memories.length,
        byType,
        avgConfidence,
        lowConfidenceCount,
      },
      sessionStats,
      predictionStats: {
        cacheHitRate,
        totalPredictions: 0,
      },
      issues,
      recommendations,
    };
  }

  /**
   * Consolidate memories
   */
  async consolidate(options?: ConsolidateOptions): Promise<ConsolidateResult> {
    const minConfidence = options?.minConfidence ?? 0.2;
    const maxAgeDays = options?.maxAgeDays ?? 365;

    const memories = await this.storage.search({ limit: 1000 });
    let removed = 0;
    let merged = 0;
    let updated = 0;
    let spaceSaved = 0;

    const now = new Date();

    for (const memory of memories) {
      // Remove low confidence memories
      if (memory.confidence < minConfidence) {
        await this.storage.delete(memory.id);
        removed++;
        spaceSaved += this.estimateTokens(memory);
        continue;
      }

      // Remove old memories
      const createdAt = new Date(memory.createdAt);
      const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays > maxAgeDays && memory.accessCount < 5) {
        await this.storage.delete(memory.id);
        removed++;
        spaceSaved += this.estimateTokens(memory);
        continue;
      }
    }

    return {
      removed,
      merged,
      updated,
      spaceSaved,
    };
  }

  /**
   * Validate memories
   */
  async validate(options?: ValidateOptions): Promise<ValidateResult> {
    const memories = await this.storage.search({ limit: 1000 });
    const issues: ValidateResult['issues'] = [];
    let totalValidated = 0;

    for (const memory of memories) {
      // Skip if type filter is set and doesn't match
      if (options?.types && !options.types.includes(memory.type)) {
        continue;
      }

      totalValidated++;

      // Check for missing required fields
      if (!memory.summary || memory.summary.trim() === '') {
        const fixed = options?.autoFix ?? false;
        if (fixed) {
          await this.storage.update(memory.id, { summary: `Memory ${memory.id}` });
        }
        issues.push({
          memoryId: memory.id,
          issue: 'Missing summary',
          fixed,
        });
      }

      // Check for invalid confidence
      if (memory.confidence < 0 || memory.confidence > 1) {
        const fixed = options?.autoFix ?? false;
        if (fixed) {
          await this.storage.update(memory.id, {
            confidence: Math.max(0, Math.min(1, memory.confidence)),
          });
        }
        issues.push({
          memoryId: memory.id,
          issue: 'Invalid confidence value',
          fixed,
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      totalValidated,
    };
  }

  // ==================== UTILITIES ====================

  /**
   * Get the underlying storage
   */
  getStorage(): IMemoryStorage {
    return this.storage;
  }

  /**
   * Get the retrieval orchestrator
   */
  getRetrievalOrchestrator(): RetrievalOrchestrator {
    return this.retrievalOrchestrator;
  }

  /**
   * Get the learning orchestrator
   */
  getLearningOrchestrator(): LearningOrchestrator {
    return this.learningOrchestrator;
  }

  /**
   * Get the generation orchestrator
   */
  getGenerationOrchestrator(): GenerationOrchestrator {
    return this.generationOrchestrator;
  }

  private estimateTokens(memory: Memory): number {
    const json = JSON.stringify(memory);
    return Math.ceil(json.length / 4);
  }
}
