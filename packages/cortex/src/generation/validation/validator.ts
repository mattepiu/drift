/**
 * Generated Code Validator
 * 
 * Orchestrates validation of generated code against
 * the generation context. Coordinates pattern, tribal,
 * and anti-pattern checkers.
 * 
 * @module generation/validation/validator
 */

import type { PatternComplianceChecker, PatternViolation } from './pattern-checker.js';
import type { TribalComplianceChecker, TribalViolation } from './tribal-checker.js';
import type { AntiPatternChecker, AntiPatternMatch } from './antipattern-checker.js';
import type { GenerationContext } from '../types.js';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the code is valid */
  valid: boolean;
  /** Overall score (0.0 - 1.0) */
  score: number;
  /** Pattern violations */
  patternViolations: PatternViolation[];
  /** Tribal violations */
  tribalViolations: TribalViolation[];
  /** Anti-pattern matches */
  antiPatternMatches: AntiPatternMatch[];
  /** Summary of issues */
  summary: string;
  /** Suggestions for improvement */
  suggestions: string[];
}

/**
 * Configuration for validator
 */
export interface ValidatorConfig {
  /** Minimum score to be considered valid */
  minValidScore: number;
  /** Weight for pattern violations */
  patternWeight: number;
  /** Weight for tribal violations */
  tribalWeight: number;
  /** Weight for anti-pattern matches */
  antiPatternWeight: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ValidatorConfig = {
  minValidScore: 0.7,
  patternWeight: 0.4,
  tribalWeight: 0.3,
  antiPatternWeight: 0.3,
};

/**
 * Generated Code Validator
 * 
 * Orchestrates validation of generated code.
 */
export class GeneratedCodeValidator {
  private config: ValidatorConfig;
  private patternChecker: PatternComplianceChecker;
  private tribalChecker: TribalComplianceChecker;
  private antiPatternChecker: AntiPatternChecker;

  constructor(
    patternChecker: PatternComplianceChecker,
    tribalChecker: TribalComplianceChecker,
    antiPatternChecker: AntiPatternChecker,
    config?: Partial<ValidatorConfig>
  ) {
    this.patternChecker = patternChecker;
    this.tribalChecker = tribalChecker;
    this.antiPatternChecker = antiPatternChecker;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate generated code against context
   */
  async validate(code: string, context: GenerationContext): Promise<ValidationResult> {
    // Run all checks
    const patternViolations = this.patternChecker.check(code, context.patterns);
    const tribalViolations = this.tribalChecker.check(code, context.tribal);
    const antiPatternMatches = this.antiPatternChecker.check(code, context.antiPatterns);

    // Calculate scores
    const patternScore = this.calculatePatternScore(patternViolations, context.patterns.length);
    const tribalScore = this.calculateTribalScore(tribalViolations, context.tribal.length);
    const antiPatternScore = this.calculateAntiPatternScore(antiPatternMatches, context.antiPatterns.length);

    // Calculate overall score
    const score = this.calculateOverallScore(patternScore, tribalScore, antiPatternScore);

    // Determine validity
    const valid = score >= this.config.minValidScore;

    // Build summary
    const summary = this.buildSummary(patternViolations, tribalViolations, antiPatternMatches, score);

    // Build suggestions
    const suggestions = this.buildSuggestions(patternViolations, tribalViolations, antiPatternMatches);

    return {
      valid,
      score,
      patternViolations,
      tribalViolations,
      antiPatternMatches,
      summary,
      suggestions,
    };
  }

  /**
   * Calculate pattern compliance score
   */
  private calculatePatternScore(violations: PatternViolation[], totalPatterns: number): number {
    if (totalPatterns === 0) return 1.0;

    // Weight violations by severity
    let penaltySum = 0;
    for (const violation of violations) {
      switch (violation.severity) {
        case 'error':
          penaltySum += 0.3;
          break;
        case 'warning':
          penaltySum += 0.15;
          break;
        case 'info':
          penaltySum += 0.05;
          break;
      }
    }

    // Score is 1 minus penalty, capped at 0
    return Math.max(0, 1 - penaltySum);
  }

  /**
   * Calculate tribal compliance score
   */
  private calculateTribalScore(violations: TribalViolation[], totalTribal: number): number {
    if (totalTribal === 0) return 1.0;

    // Weight violations by severity
    let penaltySum = 0;
    for (const violation of violations) {
      switch (violation.severity) {
        case 'error':
          penaltySum += 0.35;
          break;
        case 'warning':
          penaltySum += 0.2;
          break;
        case 'info':
          penaltySum += 0.05;
          break;
      }
    }

    return Math.max(0, 1 - penaltySum);
  }

  /**
   * Calculate anti-pattern avoidance score
   */
  private calculateAntiPatternScore(matches: AntiPatternMatch[], totalAntiPatterns: number): number {
    if (totalAntiPatterns === 0) return 1.0;

    // Each match is a penalty
    let penaltySum = 0;
    for (const match of matches) {
      switch (match.severity) {
        case 'error':
          penaltySum += 0.4;
          break;
        case 'warning':
          penaltySum += 0.2;
          break;
        case 'info':
          penaltySum += 0.05;
          break;
      }
    }

    return Math.max(0, 1 - penaltySum);
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(patternScore: number, tribalScore: number, antiPatternScore: number): number {
    return (
      patternScore * this.config.patternWeight +
      tribalScore * this.config.tribalWeight +
      antiPatternScore * this.config.antiPatternWeight
    );
  }

  /**
   * Build summary message
   */
  private buildSummary(
    patternViolations: PatternViolation[],
    tribalViolations: TribalViolation[],
    antiPatternMatches: AntiPatternMatch[],
    score: number
  ): string {
    const totalIssues = patternViolations.length + tribalViolations.length + antiPatternMatches.length;
    const scorePercent = Math.round(score * 100);

    if (totalIssues === 0) {
      return `Code validation passed with ${scorePercent}% compliance. No issues found.`;
    }

    const parts: string[] = [];

    if (patternViolations.length > 0) {
      parts.push(`${patternViolations.length} pattern violation${patternViolations.length > 1 ? 's' : ''}`);
    }

    if (tribalViolations.length > 0) {
      parts.push(`${tribalViolations.length} tribal knowledge violation${tribalViolations.length > 1 ? 's' : ''}`);
    }

    if (antiPatternMatches.length > 0) {
      parts.push(`${antiPatternMatches.length} anti-pattern match${antiPatternMatches.length > 1 ? 'es' : ''}`);
    }

    return `Code validation: ${scorePercent}% compliance. Found ${parts.join(', ')}.`;
  }

  /**
   * Build suggestions for improvement
   */
  private buildSuggestions(
    patternViolations: PatternViolation[],
    tribalViolations: TribalViolation[],
    antiPatternMatches: AntiPatternMatch[]
  ): string[] {
    const suggestions: string[] = [];

    // Add pattern suggestions
    for (const violation of patternViolations.slice(0, 3)) {
      if (violation.suggestion) {
        suggestions.push(violation.suggestion);
      }
    }

    // Add tribal suggestions
    for (const violation of tribalViolations.slice(0, 2)) {
      suggestions.push(`Review tribal knowledge: ${violation.knowledge}`);
    }

    // Add anti-pattern suggestions
    for (const match of antiPatternMatches.slice(0, 2)) {
      suggestions.push(`Instead of ${match.name}: ${match.alternative}`);
    }

    return suggestions;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
