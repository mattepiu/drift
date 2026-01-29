/**
 * Learning Detector Base Class
 * 
 * Base class for detectors that learn patterns from the user's codebase
 * rather than enforcing hardcoded conventions.
 * 
 * @requirements DRIFT-CORE - Detectors learn from user's code, not enforce arbitrary rules
 */

import { BaseDetector, type DetectionContext, type DetectionResult } from './base-detector.js';

import type { DetectionMethod } from '../registry/types.js';
import type { Violation, QuickFix } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * A convention learned from analyzing the codebase
 */
export interface LearnedConvention<T = unknown> {
  /** The learned value/pattern */
  value: T;
  
  /** Number of occurrences found */
  occurrences: number;
  
  /** Files where this convention was found */
  files: string[];
  
  /** Confidence that this is the dominant convention (0-1) */
  confidence: number;
}

/**
 * Configuration for the learning process
 */
export interface PatternLearningConfig {
  /** Minimum occurrences to consider a pattern established */
  minOccurrences: number;
  
  /** Minimum percentage to consider a value "dominant" (0-1) */
  dominanceThreshold: number;
  
  /** Minimum files that must contain the pattern */
  minFiles: number;
}

/**
 * Default learning configuration
 */
export const DEFAULT_PATTERN_LEARNING_CONFIG: PatternLearningConfig = {
  minOccurrences: 3,
  dominanceThreshold: 0.6,
  minFiles: 2,
};

/**
 * Result of the learning phase
 */
export interface LearningResult<T extends Record<string, unknown> = Record<string, unknown>> {
  /** The learned conventions */
  conventions: Partial<{ [K in keyof T]: LearnedConvention<T[K]> }>;
  
  /** Whether enough data was found */
  hasEnoughData: boolean;
  
  /** Files analyzed */
  filesAnalyzed: number;
}

/**
 * Value distribution tracker
 */
export class ValueDistribution<T = unknown> {
  private counts = new Map<string, { value: T; count: number; files: Set<string> }>();
  private total = 0;

  /**
   * Add an occurrence of a value
   */
  add(value: T, file: string): void {
    const key = this.serializeValue(value);
    const existing = this.counts.get(key);
    
    if (existing) {
      existing.count++;
      existing.files.add(file);
    } else {
      this.counts.set(key, { value, count: 1, files: new Set([file]) });
    }
    this.total++;
  }

  /**
   * Get the dominant value
   */
  getDominant(config: PatternLearningConfig): LearnedConvention<T> | null {
    if (this.total < config.minOccurrences) {
      return null;
    }

    let dominant: { value: T; count: number; files: Set<string> } | null = null;
    
    for (const entry of this.counts.values()) {
      if (!dominant || entry.count > dominant.count) {
        dominant = entry;
      }
    }

    if (!dominant) {
      return null;
    }

    const percentage = dominant.count / this.total;
    if (percentage < config.dominanceThreshold) {
      return null;
    }

    if (dominant.files.size < config.minFiles) {
      return null;
    }

    return {
      value: dominant.value,
      occurrences: dominant.count,
      files: Array.from(dominant.files),
      confidence: percentage,
    };
  }

  /**
   * Get all values with their counts
   */
  getAll(): Array<{ value: T; count: number; files: string[] }> {
    return Array.from(this.counts.values()).map(e => ({
      value: e.value,
      count: e.count,
      files: Array.from(e.files),
    }));
  }

  /**
   * Get total occurrences
   */
  getTotal(): number {
    return this.total;
  }

  private serializeValue(value: T): string {
    if (typeof value === 'string') {return value;}
    if (typeof value === 'number') {return String(value);}
    if (typeof value === 'boolean') {return String(value);}
    return JSON.stringify(value);
  }
}

// ============================================================================
// Learning Detector Base Class
// ============================================================================

/**
 * Abstract base class for learning detectors
 * 
 * Learning detectors have two phases:
 * 1. Learn: Analyze the codebase to discover conventions
 * 2. Detect: Find violations of the learned conventions
 * 
 * Subclasses must implement:
 * - `learn()`: Extract conventions from a file
 * - `detectWithConventions()`: Detect violations using learned conventions
 */
export abstract class LearningDetector<
  TConventions extends Record<string, unknown> = Record<string, unknown>
> extends BaseDetector {
  
  /** Learning configuration */
  protected learningConfig: PatternLearningConfig = DEFAULT_PATTERN_LEARNING_CONFIG;
  
  /** Cached learned conventions */
  protected learnedConventions: LearningResult<TConventions> | null = null;
  
  /** Detection method - learning detectors use custom method */
  readonly detectionMethod: DetectionMethod = 'custom';

  // ============================================================================
  // Abstract Methods for Subclasses
  // ============================================================================

  /**
   * Extract conventions from a single file
   * 
   * Called during the learning phase for each relevant file.
   * Subclasses should analyze the file and record conventions found.
   * 
   * @param context - Detection context for the file
   * @param distributions - Value distributions to populate
   */
  protected abstract extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TConventions, ValueDistribution>
  ): void;

  /**
   * Detect violations using learned conventions
   * 
   * Called during the detection phase after conventions are learned.
   * 
   * @param context - Detection context for the file
   * @param conventions - The learned conventions
   * @returns Detection result with patterns and violations
   */
  protected abstract detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TConventions>
  ): Promise<DetectionResult>;

  /**
   * Get the convention keys this detector learns
   * 
   * @returns Array of convention keys
   */
  protected abstract getConventionKeys(): Array<keyof TConventions>;

  // ============================================================================
  // Learning Methods
  // ============================================================================

  /**
   * Learn conventions from the project
   * 
   * Analyzes all relevant files in the project to discover conventions.
   * 
   * @param contexts - Detection contexts for all project files
   * @returns Learning result with discovered conventions
   */
  async learnFromProject(contexts: DetectionContext[]): Promise<LearningResult<TConventions>> {
    const distributions = new Map<keyof TConventions, ValueDistribution>();
    
    // Initialize distributions for each convention key
    for (const key of this.getConventionKeys()) {
      distributions.set(key, new ValueDistribution());
    }

    // Filter to relevant files
    const relevantContexts = contexts.filter(ctx => 
      this.supportsLanguage(ctx.language) && 
      !ctx.isTestFile &&
      !ctx.isTypeDefinition
    );

    // Extract conventions from each file
    for (const context of relevantContexts) {
      try {
        this.extractConventions(context, distributions);
      } catch (error) {
        // Log but continue - one bad file shouldn't stop learning
        console.warn(`Error extracting conventions from ${context.file}:`, error);
      }
    }

    // Build learned conventions
    const conventions: Partial<{ [K in keyof TConventions]: LearnedConvention<TConventions[K]> }> = {};
    let hasAnyConvention = false;

    for (const [key, distribution] of distributions) {
      const dominant = distribution.getDominant(this.learningConfig);
      if (dominant) {
        conventions[key] = dominant as LearnedConvention<TConventions[keyof TConventions]>;
        hasAnyConvention = true;
      }
    }

    this.learnedConventions = {
      conventions,
      hasEnoughData: hasAnyConvention,
      filesAnalyzed: relevantContexts.length,
    };

    return this.learnedConventions;
  }

  /**
   * Set pre-learned conventions (loaded from storage)
   */
  setLearnedConventions(conventions: LearningResult<TConventions>): void {
    this.learnedConventions = conventions;
  }

  /**
   * Get the current learned conventions
   */
  getLearnedConventions(): LearningResult<TConventions> | null {
    return this.learnedConventions;
  }

  /**
   * Check if conventions have been learned
   */
  hasLearnedConventions(): boolean {
    return this.learnedConventions !== null && this.learnedConventions.hasEnoughData;
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  /**
   * Main detection method
   * 
   * If conventions haven't been learned yet, returns empty result.
   * Otherwise, delegates to detectWithConventions.
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    // If no conventions learned, we can't detect violations
    if (!this.hasLearnedConventions()) {
      return this.createEmptyResult();
    }

    return this.detectWithConventions(context, this.learnedConventions!);
  }

  /**
   * Generate quick fix - default implementation returns null
   * Subclasses can override to provide fixes
   */
  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Check if a value matches the learned convention
   */
  protected matchesConvention<K extends keyof TConventions>(
    key: K,
    value: TConventions[K]
  ): boolean {
    const convention = this.learnedConventions?.conventions[key];
    if (!convention) {
      return true; // No convention learned, so no violation
    }
    return convention.value === value;
  }

  /**
   * Get the learned value for a convention
   */
  protected getLearnedValue<K extends keyof TConventions>(
    key: K
  ): TConventions[K] | null {
    const convention = this.learnedConventions?.conventions[key];
    return convention?.value ?? null;
  }

  /**
   * Create a violation for a convention mismatch
   */
  protected createConventionViolation(
    file: string,
    line: number,
    column: number,
    conventionKey: string,
    actual: unknown,
    expected: unknown,
    message?: string
  ): Violation {
    return {
      id: `${this.id}-${file}-${line}-${column}`,
      patternId: this.id,
      severity: 'warning',
      file,
      range: {
        start: { line: line - 1, character: column - 1 },
        end: { line: line - 1, character: column + String(actual).length - 1 },
      },
      message: message || `Inconsistent ${conventionKey}: found '${actual}', project uses '${expected}'`,
      expected: String(expected),
      actual: String(actual),
      explanation: `This project has established '${expected}' as the convention for ${conventionKey}. ` +
        `This was learned from analyzing ${this.learnedConventions?.filesAnalyzed || 0} files.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { DetectionContext, DetectionResult };
