/**
 * Unified Detector - Composite detector with multiple detection strategies
 *
 * Consolidates detector variants (base, learning, semantic) into a single class
 * that can run multiple detection strategies and merge results.
 *
 * This is part of Phase 4 of the Pattern System Consolidation.
 *
 * @requirements 6.4 - THE Detector_System SHALL support multiple detection methods
 */

import { BaseDetector, type DetectionContext, type DetectionResult } from './base-detector.js';

import type {
  PatternMatch,
  Violation,
} from 'driftdetect-core';


// ============================================================================
// Types
// ============================================================================

/**
 * Detection strategies that can be combined in a unified detector
 */
export type DetectionStrategy = 
  | 'structural'   // File/directory structure analysis
  | 'ast'          // AST-based analysis
  | 'regex'        // Regular expression matching
  | 'semantic'     // Keyword-based semantic matching
  | 'learning';    // Learns conventions from codebase

/**
 * Result from a single strategy execution
 */
export interface StrategyResult {
  /** Strategy that produced this result */
  strategy: DetectionStrategy;
  /** Patterns found by this strategy */
  patterns: PatternMatch[];
  /** Violations found by this strategy */
  violations: Violation[];
  /** Confidence score for this strategy's results */
  confidence: number;
  /** Whether this strategy was skipped (e.g., no AST available) */
  skipped?: boolean;
  /** Reason for skipping */
  skipReason?: string;
}

/**
 * Options for running detection strategies
 */
export interface StrategyOptions {
  /** Only run specific strategies (default: all supported) */
  strategies?: DetectionStrategy[];
  /** Stop after first strategy finds results */
  stopOnFirstMatch?: boolean;
  /** Minimum confidence to include results */
  minConfidence?: number;
}

/**
 * Configuration for merging strategy results
 */
export interface MergeConfig {
  /** How to handle duplicate patterns at same location */
  duplicateHandling: 'highest-confidence' | 'first' | 'merge';
  /** How to combine confidence scores */
  confidenceCombination: 'max' | 'average' | 'weighted';
  /** Weights for each strategy (for weighted confidence) */
  strategyWeights?: Partial<Record<DetectionStrategy, number>>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_MERGE_CONFIG: MergeConfig = {
  duplicateHandling: 'highest-confidence',
  confidenceCombination: 'max',
  strategyWeights: {
    structural: 1.0,
    ast: 1.0,
    regex: 0.8,
    semantic: 0.7,
    learning: 0.9,
  },
};

// ============================================================================
// Unified Detector Abstract Class
// ============================================================================

/**
 * Abstract base class for unified detectors
 *
 * Unified detectors combine multiple detection strategies (structural, AST,
 * regex, semantic, learning) into a single detector class. This reduces
 * code duplication and makes it easier to maintain detection logic.
 *
 * @example
 * ```typescript
 * class FileNamingDetector extends UnifiedDetector {
 *   readonly id = 'structural/file-naming';
 *   readonly category = 'structural';
 *   readonly subcategory = 'naming-conventions';
 *   readonly name = 'File Naming Convention Detector';
 *   readonly description = 'Detects file naming patterns';
 *   readonly supportedLanguages = ['typescript', 'javascript'];
 *   readonly strategies: DetectionStrategy[] = ['structural', 'learning', 'semantic'];
 *
 *   protected async detectWithStrategy(
 *     strategy: DetectionStrategy,
 *     context: DetectionContext
 *   ): Promise<StrategyResult> {
 *     switch (strategy) {
 *       case 'structural':
 *         return this.detectStructural(context);
 *       case 'learning':
 *         return this.detectLearning(context);
 *       case 'semantic':
 *         return this.detectSemantic(context);
 *       default:
 *         return this.createSkippedResult(strategy, 'Not implemented');
 *     }
 *   }
 * }
 * ```
 */
export abstract class UnifiedDetector extends BaseDetector {
  /**
   * Detection strategies this detector supports
   *
   * Override this to specify which strategies the detector implements.
   * The detect() method will run all supported strategies and merge results.
   */
  abstract readonly strategies: DetectionStrategy[];

  /**
   * Primary detection method (for BaseDetector compatibility)
   *
   * This is derived from the first strategy in the strategies array.
   */
  get detectionMethod(): 'ast' | 'regex' | 'semantic' | 'structural' | 'custom' {
    const primary = this.strategies[0];
    if (primary === 'learning') {return 'custom';}
    return primary || 'custom';
  }

  /**
   * Configuration for merging strategy results
   *
   * Override this to customize how results from different strategies
   * are combined.
   */
  protected mergeConfig: MergeConfig = DEFAULT_MERGE_CONFIG;

  // ============================================================================
  // Main Detection Method
  // ============================================================================

  /**
   * Detect patterns and violations using all supported strategies
   *
   * Runs each strategy in parallel, then merges the results according
   * to the merge configuration.
   *
   * @param context - Detection context
   * @param options - Optional strategy options
   * @returns Merged detection results
   */
  async detect(
    context: DetectionContext,
    options: StrategyOptions = {}
  ): Promise<DetectionResult> {
    const strategiesToRun = options.strategies ?? this.strategies;
    const minConfidence = options.minConfidence ?? 0;

    // Run all strategies in parallel
    const strategyResults = await Promise.all(
      strategiesToRun.map(async (strategy) => {
        try {
          return await this.detectWithStrategy(strategy, context);
        } catch (error) {
          console.warn(`Strategy ${strategy} failed for ${this.id}:`, error);
          return this.createSkippedResult(
            strategy,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      })
    );

    // Filter out skipped strategies and low-confidence results
    const validResults = strategyResults.filter(
      (r) => !r.skipped && r.confidence >= minConfidence
    );

    // Check for early exit
    if (options.stopOnFirstMatch && validResults.length > 0) {
      const first = validResults[0]!;
      if (first.patterns.length > 0 || first.violations.length > 0) {
        return this.createResult(
          first.patterns,
          first.violations,
          first.confidence,
          { custom: { strategy: first.strategy } }
        );
      }
    }

    // Merge results from all strategies
    return this.mergeResults(validResults);
  }

  // ============================================================================
  // Abstract Strategy Method
  // ============================================================================

  /**
   * Run detection with a specific strategy
   *
   * Subclasses must implement this method to provide strategy-specific
   * detection logic.
   *
   * @param strategy - The strategy to use
   * @param context - Detection context
   * @returns Strategy result
   */
  protected abstract detectWithStrategy(
    strategy: DetectionStrategy,
    context: DetectionContext
  ): Promise<StrategyResult>;

  // ============================================================================
  // Result Merging
  // ============================================================================

  /**
   * Merge results from multiple strategies
   *
   * Combines patterns and violations from all strategies, handling
   * duplicates according to the merge configuration.
   *
   * @param results - Array of strategy results
   * @returns Merged detection result
   */
  protected mergeResults(results: StrategyResult[]): DetectionResult {
    if (results.length === 0) {
      return this.createEmptyResult();
    }

    if (results.length === 1) {
      const r = results[0]!;
      return this.createResult(r.patterns, r.violations, r.confidence);
    }

    // Merge patterns
    const mergedPatterns = this.mergePatterns(
      results.flatMap((r) => r.patterns.map((p) => ({ ...p, _strategy: r.strategy })))
    );

    // Merge violations
    const mergedViolations = this.mergeViolations(
      results.flatMap((r) => r.violations.map((v) => ({ ...v, _strategy: r.strategy })))
    );

    // Calculate combined confidence
    const confidence = this.calculateCombinedConfidence(results);

    return this.createResult(mergedPatterns, mergedViolations, confidence, {
      custom: {
        strategies: results.map((r) => r.strategy),
        strategyConfidences: Object.fromEntries(
          results.map((r) => [r.strategy, r.confidence])
        ),
      },
    });
  }

  /**
   * Merge patterns from multiple strategies
   *
   * Handles duplicates based on location (file + line + column).
   */
  private mergePatterns(
    patterns: Array<PatternMatch & { _strategy?: DetectionStrategy }>
  ): PatternMatch[] {
    const byLocation = new Map<string, PatternMatch & { _strategy?: DetectionStrategy }>();

    for (const pattern of patterns) {
      const key = `${pattern.location.file}:${pattern.location.line}:${pattern.location.column}:${pattern.patternId}`;
      const existing = byLocation.get(key);

      if (!existing) {
        byLocation.set(key, pattern);
      } else {
        // Handle duplicate based on config
        switch (this.mergeConfig.duplicateHandling) {
          case 'highest-confidence':
            if (pattern.confidence > existing.confidence) {
              byLocation.set(key, pattern);
            }
            break;
          case 'first':
            // Keep existing (first)
            break;
          case 'merge':
            // Merge by taking highest confidence
            byLocation.set(key, {
              ...existing,
              confidence: Math.max(existing.confidence, pattern.confidence),
            });
            break;
        }
      }
    }

    // Remove internal _strategy field
    return Array.from(byLocation.values()).map(({ _strategy, ...p }) => p);
  }

  /**
   * Merge violations from multiple strategies
   *
   * Handles duplicates based on location and message.
   */
  private mergeViolations(
    violations: Array<Violation & { _strategy?: DetectionStrategy }>
  ): Violation[] {
    const byKey = new Map<string, Violation & { _strategy?: DetectionStrategy }>();

    for (const violation of violations) {
      const key = `${violation.file}:${violation.range.start.line}:${violation.range.start.character}:${violation.patternId}`;
      const existing = byKey.get(key);

      if (!existing) {
        byKey.set(key, violation);
      }
      // For violations, we typically keep the first one (most specific)
    }

    // Remove internal _strategy field
    return Array.from(byKey.values()).map(({ _strategy, ...v }) => v);
  }

  /**
   * Calculate combined confidence from multiple strategy results
   */
  private calculateCombinedConfidence(results: StrategyResult[]): number {
    if (results.length === 0) {return 0;}

    switch (this.mergeConfig.confidenceCombination) {
      case 'max':
        return Math.max(...results.map((r) => r.confidence));

      case 'average':
        return results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

      case 'weighted': {
        const weights = this.mergeConfig.strategyWeights ?? {};
        let totalWeight = 0;
        let weightedSum = 0;

        for (const result of results) {
          const weight = weights[result.strategy] ?? 1.0;
          weightedSum += result.confidence * weight;
          totalWeight += weight;
        }

        return totalWeight > 0 ? weightedSum / totalWeight : 0;
      }

      default:
        return Math.max(...results.map((r) => r.confidence));
    }
  }

  // ============================================================================
  // Helper Methods for Subclasses
  // ============================================================================

  /**
   * Create a strategy result with patterns
   */
  protected createStrategyResult(
    strategy: DetectionStrategy,
    patterns: PatternMatch[],
    violations: Violation[] = [],
    confidence: number = 1.0
  ): StrategyResult {
    return {
      strategy,
      patterns,
      violations,
      confidence,
    };
  }

  /**
   * Create an empty strategy result
   */
  protected createEmptyStrategyResult(
    strategy: DetectionStrategy,
    confidence: number = 1.0
  ): StrategyResult {
    return {
      strategy,
      patterns: [],
      violations: [],
      confidence,
    };
  }

  /**
   * Create a skipped strategy result
   */
  protected createSkippedResult(
    strategy: DetectionStrategy,
    reason: string
  ): StrategyResult {
    return {
      strategy,
      patterns: [],
      violations: [],
      confidence: 0,
      skipped: true,
      skipReason: reason,
    };
  }

  /**
   * Check if a strategy is supported by this detector
   */
  protected supportsStrategy(strategy: DetectionStrategy): boolean {
    return this.strategies.includes(strategy);
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a detector is a unified detector
 */
export function isUnifiedDetector(detector: BaseDetector): detector is UnifiedDetector {
  return 'strategies' in detector && Array.isArray((detector as UnifiedDetector).strategies);
}

// ============================================================================
// Exports
// ============================================================================

export type { DetectionContext, DetectionResult };
