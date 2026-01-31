/**
 * Generation Orchestrator
 * 
 * Orchestrates code generation context building,
 * validation, and feedback processing.
 * 
 * @module orchestrators/generation-orchestrator
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { Intent } from '../retrieval/engine.js';
import type {
  GenerationContext,
  GenerationTarget,
  GeneratedCode,
  GenerationOutcome,
  PatternContext,
  TribalContext,
  ConstraintContext,
  AntiPatternContext,
  RelatedMemoryContext,
  TokenBudgetInfo,
  GenerationMetadata,
  GenerationIntent,
} from '../types/generation-context.js';
import type { PatternContextGatherer } from '../generation/context/pattern-gatherer.js';
import type { TribalContextGatherer } from '../generation/context/tribal-gatherer.js';
import type { ConstraintContextGatherer } from '../generation/context/constraint-gatherer.js';
import type { AntiPatternGatherer } from '../generation/context/antipattern-gatherer.js';
import type { GeneratedCodeValidator, ValidationResult } from '../generation/validation/validator.js';
import type { ProvenanceTracker } from '../generation/provenance/tracker.js';
import type { GenerationFeedbackLoop } from '../generation/feedback/loop.js';
import type { TokenBudgetManagerV2 } from '../compression/budget/manager-v2.js';
import type { SessionContextManager } from '../session/context/manager.js';
import { randomUUID } from 'crypto';

/**
 * Context build result
 */
export interface ContextBuildResult {
  /** The generation context */
  context: GenerationContext;
  /** Build time in ms */
  buildTimeMs: number;
  /** Memories considered */
  memoriesConsidered: number;
  /** Memories included */
  memoriesIncluded: number;
}

/**
 * Outcome tracking result
 */
export interface OutcomeTrackResult {
  /** Whether tracking was successful */
  success: boolean;
  /** Memories updated */
  memoriesUpdated: number;
  /** Learning triggered */
  learningTriggered: boolean;
}

/**
 * Generation Orchestrator
 * 
 * Coordinates context building, validation, and feedback
 * for code generation.
 */
export class GenerationOrchestrator {
  private storage: IMemoryStorage;
  private patternGatherer: PatternContextGatherer | null;
  private tribalGatherer: TribalContextGatherer | null;
  private constraintGatherer: ConstraintContextGatherer | null;
  private antiPatternGatherer: AntiPatternGatherer | null;
  private validator: GeneratedCodeValidator | null;
  private feedbackLoop: GenerationFeedbackLoop | null;
  private sessionManager: SessionContextManager | null;

  constructor(
    storage: IMemoryStorage,
    options?: {
      patternGatherer?: PatternContextGatherer;
      tribalGatherer?: TribalContextGatherer;
      constraintGatherer?: ConstraintContextGatherer;
      antiPatternGatherer?: AntiPatternGatherer;
      validator?: GeneratedCodeValidator;
      feedbackLoop?: GenerationFeedbackLoop;
      budgetManager?: TokenBudgetManagerV2;
      sessionManager?: SessionContextManager;
    }
  ) {
    this.storage = storage;
    this.patternGatherer = options?.patternGatherer ?? null;
    this.tribalGatherer = options?.tribalGatherer ?? null;
    this.constraintGatherer = options?.constraintGatherer ?? null;
    this.antiPatternGatherer = options?.antiPatternGatherer ?? null;
    this.validator = options?.validator ?? null;
    this.feedbackLoop = options?.feedbackLoop ?? null;
    this.sessionManager = options?.sessionManager ?? null;
  }

  /**
   * Build generation context
   */
  async buildContext(
    intent: Intent,
    target: GenerationTarget,
    query: string,
    options?: {
      maxTokens?: number;
      includeExamples?: boolean;
    }
  ): Promise<ContextBuildResult> {
    const startTime = Date.now();
    const requestId = randomUUID();
    let memoriesConsidered = 0;
    let memoriesIncluded = 0;

    // Get budget
    const totalBudget = options?.maxTokens ?? 4000;
    const budgetAllocation = this.allocateBudget(totalBudget);

    // Gather pattern context
    const patterns = await this.gatherPatterns(target, query, budgetAllocation.patterns);
    memoriesConsidered += patterns.considered;
    memoriesIncluded += patterns.contexts.length;

    // Gather tribal context
    const tribal = await this.gatherTribal(target, query, budgetAllocation.tribal);
    memoriesConsidered += tribal.considered;
    memoriesIncluded += tribal.contexts.length;

    // Gather constraint context
    const constraints = await this.gatherConstraints(target, budgetAllocation.constraints);
    memoriesConsidered += constraints.considered;
    memoriesIncluded += constraints.contexts.length;

    // Gather anti-pattern context
    const antiPatterns = await this.gatherAntiPatterns(target, query, budgetAllocation.antiPatterns);
    memoriesConsidered += antiPatterns.considered;
    memoriesIncluded += antiPatterns.contexts.length;

    // Gather related memories
    const related = await this.gatherRelated(target, query, budgetAllocation.related);
    memoriesConsidered += related.considered;
    memoriesIncluded += related.contexts.length;

    // Calculate token usage
    const tokenBudget = this.calculateTokenBudget(
      totalBudget,
      patterns.tokensUsed,
      tribal.tokensUsed,
      constraints.tokensUsed,
      antiPatterns.tokensUsed,
      related.tokensUsed
    );

    // Get session info
    const activeSession = await this.sessionManager?.getActiveSession();

    // Build metadata
    const metadata: GenerationMetadata = {
      requestId,
      buildTimeMs: Date.now() - startTime,
      memoriesConsidered,
      memoriesIncluded,
    };

    // Add sessionId only if available
    if (activeSession?.id) {
      (metadata as GenerationMetadata & { sessionId?: string }).sessionId = activeSession.id;
    }

    // Build context
    const context: GenerationContext = {
      target,
      intent: this.intentToGenerationIntent(intent),
      query,
      patterns: patterns.contexts,
      tribal: tribal.contexts,
      constraints: constraints.contexts,
      antiPatterns: antiPatterns.contexts,
      relatedMemories: related.contexts,
      tokenBudget,
      builtAt: new Date().toISOString(),
      metadata,
    };

    return {
      context,
      buildTimeMs: Date.now() - startTime,
      memoriesConsidered,
      memoriesIncluded,
    };
  }

  /**
   * Validate generated code against context
   */
  async validateGenerated(
    code: string,
    context: GenerationContext
  ): Promise<ValidationResult> {
    if (!this.validator) {
      // Return a passing result if no validator
      return {
        valid: true,
        score: 1.0,
        patternViolations: [],
        tribalViolations: [],
        antiPatternMatches: [],
        summary: 'No validator configured',
        suggestions: [],
      };
    }

    return this.validator.validate(code, context);
  }

  /**
   * Track generation outcome
   */
  async trackOutcome(
    generation: GeneratedCode,
    outcome: GenerationOutcome,
    feedback?: string
  ): Promise<OutcomeTrackResult> {
    let memoriesUpdated = 0;
    let learningTriggered = false;

    // Track in feedback loop
    if (this.feedbackLoop) {
      await this.feedbackLoop.trackOutcome(generation, outcome, feedback);
    }

    // Update memory confidence based on outcome
    for (const influence of generation.provenance.influences) {
      const adjustment = this.getConfidenceAdjustment(outcome, influence.strength);
      
      if (adjustment !== 0) {
        const memory = await this.storage.read(influence.memoryId);
        if (memory) {
          const newConfidence = Math.max(0.1, Math.min(1.0, memory.confidence + adjustment));
          await this.storage.update(influence.memoryId, { confidence: newConfidence });
          memoriesUpdated++;
        }
      }
    }

    // Trigger learning if rejected or modified with feedback
    if ((outcome === 'rejected' || outcome === 'modified') && feedback) {
      learningTriggered = true;
      // Learning would be handled by LearningOrchestrator
    }

    return {
      success: true,
      memoriesUpdated,
      learningTriggered,
    };
  }

  /**
   * Create provenance tracker for a generation
   */
  createProvenanceTracker(context: GenerationContext): ProvenanceTracker {
    // Import dynamically to avoid circular dependency
    const tracker = new (require('../generation/provenance/tracker.js').ProvenanceTracker)(
      context.metadata?.requestId
    );
    tracker.initFromContext(context);
    return tracker;
  }

  /**
   * Get feedback statistics
   */
  getFeedbackStats(): { acceptanceRate: number; total: number } | null {
    if (!this.feedbackLoop) {
      return null;
    }

    const stats = this.feedbackLoop.getStats();
    return {
      acceptanceRate: stats.acceptanceRate,
      total: stats.total,
    };
  }

  // Private helper methods

  private allocateBudget(total: number): {
    patterns: number;
    tribal: number;
    constraints: number;
    antiPatterns: number;
    related: number;
  } {
    // Allocate budget proportionally
    return {
      patterns: Math.floor(total * 0.35),      // 35% for patterns
      tribal: Math.floor(total * 0.25),        // 25% for tribal
      constraints: Math.floor(total * 0.15),   // 15% for constraints
      antiPatterns: Math.floor(total * 0.15),  // 15% for anti-patterns
      related: Math.floor(total * 0.10),       // 10% for related
    };
  }

  private async gatherPatterns(
    target: GenerationTarget,
    query: string,
    budget: number
  ): Promise<{ contexts: PatternContext[]; considered: number; tokensUsed: number }> {
    if (!this.patternGatherer) {
      return { contexts: [], considered: 0, tokensUsed: 0 };
    }

    const contexts = await this.patternGatherer.gather(target, query);

    // Trim to budget
    const trimmed = this.trimToBudget(contexts, budget);

    return {
      contexts: trimmed,
      considered: contexts.length,
      tokensUsed: this.estimateTokens(trimmed),
    };
  }

  private async gatherTribal(
    target: GenerationTarget,
    query: string,
    budget: number
  ): Promise<{ contexts: TribalContext[]; considered: number; tokensUsed: number }> {
    if (!this.tribalGatherer) {
      return { contexts: [], considered: 0, tokensUsed: 0 };
    }

    const contexts = await this.tribalGatherer.gather(target, query);

    // Trim to budget
    const trimmed = this.trimToBudget(contexts, budget);

    return {
      contexts: trimmed,
      considered: contexts.length,
      tokensUsed: this.estimateTokens(trimmed),
    };
  }

  private async gatherConstraints(
    target: GenerationTarget,
    budget: number
  ): Promise<{ contexts: ConstraintContext[]; considered: number; tokensUsed: number }> {
    if (!this.constraintGatherer) {
      return { contexts: [], considered: 0, tokensUsed: 0 };
    }

    const contexts = await this.constraintGatherer.gather(target);

    // Trim to budget
    const trimmed = this.trimToBudget(contexts, budget);

    return {
      contexts: trimmed,
      considered: contexts.length,
      tokensUsed: this.estimateTokens(trimmed),
    };
  }

  private async gatherAntiPatterns(
    target: GenerationTarget,
    query: string,
    budget: number
  ): Promise<{ contexts: AntiPatternContext[]; considered: number; tokensUsed: number }> {
    if (!this.antiPatternGatherer) {
      return { contexts: [], considered: 0, tokensUsed: 0 };
    }

    const contexts = await this.antiPatternGatherer.gather(target, query);

    // Trim to budget
    const trimmed = this.trimToBudget(contexts, budget);

    return {
      contexts: trimmed,
      considered: contexts.length,
      tokensUsed: this.estimateTokens(trimmed),
    };
  }

  private async gatherRelated(
    target: GenerationTarget,
    _query: string,
    budget: number
  ): Promise<{ contexts: RelatedMemoryContext[]; considered: number; tokensUsed: number }> {
    // Get related memories from storage
    const memories = await this.storage.findByFile(target.filePath);
    const contexts: RelatedMemoryContext[] = [];

    for (const memory of memories.slice(0, 10)) {
      contexts.push({
        memoryId: memory.id,
        memoryType: memory.type,
        summary: memory.summary,
        relationship: 'linked_to_file',
        relevanceScore: memory.confidence,
      });
    }

    // Trim to budget
    const trimmed = this.trimToBudget(contexts, budget);

    return {
      contexts: trimmed,
      considered: memories.length,
      tokensUsed: this.estimateTokens(trimmed),
    };
  }

  private estimateTokens(items: unknown[]): number {
    const json = JSON.stringify(items);
    return Math.ceil(json.length / 4);
  }

  private trimToBudget<T>(items: T[], budget: number): T[] {
    const result: T[] = [];
    let usedTokens = 0;

    for (const item of items) {
      const itemTokens = this.estimateTokens([item]);
      if (usedTokens + itemTokens <= budget) {
        result.push(item);
        usedTokens += itemTokens;
      } else {
        break;
      }
    }

    return result;
  }

  private calculateTokenBudget(
    total: number,
    patternsUsed: number,
    tribalUsed: number,
    constraintsUsed: number,
    antiPatternsUsed: number,
    relatedUsed: number
  ): TokenBudgetInfo {
    const totalUsed = patternsUsed + tribalUsed + constraintsUsed + antiPatternsUsed + relatedUsed;

    return {
      total,
      patternsUsed,
      tribalUsed,
      constraintsUsed,
      antiPatternsUsed,
      relatedUsed,
      remaining: total - totalUsed,
    };
  }

  private intentToGenerationIntent(intent: Intent): GenerationIntent {
    switch (intent) {
      case 'add_feature':
        return 'implement';
      case 'fix_bug':
        return 'fix';
      case 'refactor':
        return 'refactor';
      case 'add_test':
        return 'test';
      case 'understand_code':
        return 'explain';
      case 'security_audit':
        return 'optimize';
      default:
        return 'implement';
    }
  }

  private getConfidenceAdjustment(outcome: GenerationOutcome, influenceStrength: number): number {
    const baseAdjustment = outcome === 'accepted' ? 0.05 : outcome === 'rejected' ? -0.1 : -0.03;
    return baseAdjustment * influenceStrength;
  }
}
