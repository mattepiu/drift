/**
 * Generation Context Builder
 * 
 * Orchestrates the gathering of all context needed for
 * code generation. Coordinates pattern, tribal, constraint,
 * and anti-pattern gatherers.
 * 
 * @module generation/context/builder
 */

import { randomUUID } from 'crypto';
import type { PatternContextGatherer } from './pattern-gatherer.js';
import type { TribalContextGatherer } from './tribal-gatherer.js';
import type { ConstraintContextGatherer } from './constraint-gatherer.js';
import type { AntiPatternGatherer } from './antipattern-gatherer.js';
import type {
  GenerationContext,
  GenerationTarget,
  GenerationIntent,
  PatternContext,
  TribalContext,
  ConstraintContext,
  AntiPatternContext,
  RelatedMemoryContext,
  TokenBudgetInfo,
  GenerationMetadata,
} from '../types.js';

/**
 * Configuration for context builder
 */
export interface ContextBuilderConfig {
  /** Total token budget */
  tokenBudget: number;
  /** Budget allocation percentages */
  budgetAllocation: {
    patterns: number;
    tribal: number;
    constraints: number;
    antiPatterns: number;
    related: number;
  };
  /** Include related memories */
  includeRelated: boolean;
  /** Session ID for tracking */
  sessionId?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ContextBuilderConfig = {
  tokenBudget: 4000,
  budgetAllocation: {
    patterns: 0.30,
    tribal: 0.25,
    constraints: 0.20,
    antiPatterns: 0.15,
    related: 0.10,
  },
  includeRelated: true,
};

/**
 * Generation Context Builder
 * 
 * Orchestrates the gathering of all context needed for
 * code generation.
 */
export class GenerationContextBuilder {
  private config: ContextBuilderConfig;
  private patternGatherer: PatternContextGatherer;
  private tribalGatherer: TribalContextGatherer;
  private constraintGatherer: ConstraintContextGatherer;
  private antiPatternGatherer: AntiPatternGatherer;

  constructor(
    patternGatherer: PatternContextGatherer,
    tribalGatherer: TribalContextGatherer,
    constraintGatherer: ConstraintContextGatherer,
    antiPatternGatherer: AntiPatternGatherer,
    config?: Partial<ContextBuilderConfig>
  ) {
    this.patternGatherer = patternGatherer;
    this.tribalGatherer = tribalGatherer;
    this.constraintGatherer = constraintGatherer;
    this.antiPatternGatherer = antiPatternGatherer;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build complete generation context
   */
  async build(
    intent: GenerationIntent,
    target: GenerationTarget,
    query: string
  ): Promise<GenerationContext> {
    const startTime = Date.now();
    const requestId = randomUUID();

    // Gather all context in parallel
    const [patterns, tribal, constraints, antiPatterns] = await Promise.all([
      this.patternGatherer.gather(target, query),
      this.tribalGatherer.gather(target, query),
      this.constraintGatherer.gather(target),
      this.antiPatternGatherer.gather(target, query),
    ]);

    // Calculate token usage
    const tokenBudget = this.calculateTokenBudget(patterns, tribal, constraints, antiPatterns);

    // Trim context to fit budget
    const trimmedPatterns = this.trimToTokenBudget(
      patterns,
      this.config.tokenBudget * this.config.budgetAllocation.patterns
    );
    const trimmedTribal = this.trimToTokenBudget(
      tribal,
      this.config.tokenBudget * this.config.budgetAllocation.tribal
    );
    const trimmedConstraints = this.trimToTokenBudget(
      constraints,
      this.config.tokenBudget * this.config.budgetAllocation.constraints
    );
    const trimmedAntiPatterns = this.trimToTokenBudget(
      antiPatterns,
      this.config.tokenBudget * this.config.budgetAllocation.antiPatterns
    );

    // Build related memories (empty for now - can be extended)
    const relatedMemories: RelatedMemoryContext[] = [];

    // Build metadata
    const metadata: GenerationMetadata = {
      requestId,
      buildTimeMs: Date.now() - startTime,
      memoriesConsidered: patterns.length + tribal.length + constraints.length + antiPatterns.length,
      memoriesIncluded: trimmedPatterns.length + trimmedTribal.length + trimmedConstraints.length + trimmedAntiPatterns.length,
    };

    if (this.config.sessionId) {
      metadata.sessionId = this.config.sessionId;
    }

    return {
      target,
      intent,
      query,
      patterns: trimmedPatterns,
      tribal: trimmedTribal,
      constraints: trimmedConstraints,
      antiPatterns: trimmedAntiPatterns,
      relatedMemories,
      tokenBudget,
      builtAt: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * Calculate token budget usage
   */
  private calculateTokenBudget(
    patterns: PatternContext[],
    tribal: TribalContext[],
    constraints: ConstraintContext[],
    antiPatterns: AntiPatternContext[]
  ): TokenBudgetInfo {
    const patternsUsed = this.estimateTokens(patterns);
    const tribalUsed = this.estimateTokens(tribal);
    const constraintsUsed = this.estimateTokens(constraints);
    const antiPatternsUsed = this.estimateTokens(antiPatterns);
    const relatedUsed = 0; // No related memories yet

    const totalUsed = patternsUsed + tribalUsed + constraintsUsed + antiPatternsUsed + relatedUsed;

    return {
      total: this.config.tokenBudget,
      patternsUsed,
      tribalUsed,
      constraintsUsed,
      antiPatternsUsed,
      relatedUsed,
      remaining: Math.max(0, this.config.tokenBudget - totalUsed),
    };
  }

  /**
   * Estimate tokens for an array of context items
   */
  private estimateTokens(items: unknown[]): number {
    // Rough estimate: ~4 characters per token
    const json = JSON.stringify(items);
    return Math.ceil(json.length / 4);
  }

  /**
   * Trim context items to fit within token budget
   */
  private trimToTokenBudget<T extends { relevanceScore: number }>(
    items: T[],
    budget: number
  ): T[] {
    // Sort by relevance (highest first)
    const sorted = [...items].sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    const result: T[] = [];
    let usedTokens = 0;

    for (const item of sorted) {
      const itemTokens = this.estimateTokens([item]);
      if (usedTokens + itemTokens <= budget) {
        result.push(item);
        usedTokens += itemTokens;
      } else {
        // Stop if we can't fit more
        break;
      }
    }

    return result;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContextBuilderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ContextBuilderConfig {
    return { ...this.config };
  }
}
