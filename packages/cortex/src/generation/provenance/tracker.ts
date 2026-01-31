/**
 * Provenance Tracker
 * 
 * Tracks what influenced generated code for transparency
 * and debugging. Records patterns followed, tribal knowledge
 * applied, constraints enforced, and anti-patterns avoided.
 * 
 * @module generation/provenance/tracker
 */

import { randomUUID } from 'crypto';
import type {
  CodeProvenance,
  Influence,
  InfluenceType,
  GenerationContext,
} from '../types.js';

/**
 * Provenance Tracker
 * 
 * Tracks provenance during code generation.
 */
export class ProvenanceTracker {
  private requestId: string;
  private influences: Influence[] = [];
  private warnings: string[] = [];
  private appliedConstraints: string[] = [];
  private avoidedAntiPatterns: string[] = [];
  private confidenceSum = 0;
  private confidenceCount = 0;

  constructor(requestId?: string) {
    this.requestId = requestId ?? randomUUID();
  }

  /**
   * Initialize tracker from generation context
   */
  initFromContext(context: GenerationContext): void {
    // Record pattern influences
    for (const pattern of context.patterns) {
      this.recordInfluence(
        pattern.patternId,
        'pattern_rationale',
        'pattern_followed',
        `Following pattern: ${pattern.patternName}`,
        pattern.relevanceScore
      );
    }

    // Record tribal influences
    for (const tribal of context.tribal) {
      this.recordInfluence(
        tribal.memoryId,
        'tribal',
        'tribal_applied',
        `Applied tribal knowledge: ${tribal.topic}`,
        tribal.relevanceScore
      );

      // Add warnings from tribal knowledge
      if (tribal.warnings) {
        for (const warning of tribal.warnings) {
          this.recordWarning(warning);
        }
      }
    }

    // Record constraint influences
    for (const constraint of context.constraints) {
      this.recordConstraint(constraint.constraintId);
      this.recordInfluence(
        constraint.constraintId,
        'constraint_override',
        'constraint_enforced',
        `Enforced constraint: ${constraint.constraintName}`,
        constraint.relevanceScore
      );
    }

    // Record anti-pattern avoidances
    for (const antiPattern of context.antiPatterns) {
      this.recordAntiPattern(antiPattern.memoryId);
      this.recordInfluence(
        antiPattern.memoryId,
        'code_smell',
        'antipattern_avoided',
        `Avoided anti-pattern: ${antiPattern.name}`,
        antiPattern.relevanceScore
      );
    }
  }

  /**
   * Record an influence on the generated code
   */
  recordInfluence(
    memoryId: string,
    memoryType: string,
    influenceType: InfluenceType,
    description: string,
    strength: number = 0.5
  ): void {
    this.influences.push({
      memoryId,
      memoryType,
      influenceType,
      description,
      strength,
    });

    this.confidenceSum += strength;
    this.confidenceCount++;
  }

  /**
   * Record a warning that was considered
   */
  recordWarning(warning: string): void {
    if (!this.warnings.includes(warning)) {
      this.warnings.push(warning);
    }
  }

  /**
   * Record a constraint that was applied
   */
  recordConstraint(constraintId: string): void {
    if (!this.appliedConstraints.includes(constraintId)) {
      this.appliedConstraints.push(constraintId);
    }
  }

  /**
   * Record an anti-pattern that was avoided
   */
  recordAntiPattern(patternId: string): void {
    if (!this.avoidedAntiPatterns.includes(patternId)) {
      this.avoidedAntiPatterns.push(patternId);
    }
  }

  /**
   * Record that an example was used
   */
  recordExampleUsed(memoryId: string, description: string): void {
    this.recordInfluence(
      memoryId,
      'pattern_rationale',
      'example_used',
      description,
      0.7
    );
  }

  /**
   * Record that a style was matched
   */
  recordStyleMatched(memoryId: string, description: string): void {
    this.recordInfluence(
      memoryId,
      'pattern_rationale',
      'style_matched',
      description,
      0.5
    );
  }

  /**
   * Build the final provenance record
   */
  build(): CodeProvenance {
    const confidence = this.confidenceCount > 0
      ? this.confidenceSum / this.confidenceCount
      : 0.5;

    return {
      requestId: this.requestId,
      influences: this.influences,
      warnings: this.warnings,
      appliedConstraints: this.appliedConstraints,
      avoidedAntiPatterns: this.avoidedAntiPatterns,
      confidence: Math.min(confidence, 1.0),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get the request ID
   */
  getRequestId(): string {
    return this.requestId;
  }

  /**
   * Get current influence count
   */
  getInfluenceCount(): number {
    return this.influences.length;
  }

  /**
   * Get current warning count
   */
  getWarningCount(): number {
    return this.warnings.length;
  }

  /**
   * Reset the tracker for reuse
   */
  reset(requestId?: string): void {
    this.requestId = requestId ?? randomUUID();
    this.influences = [];
    this.warnings = [];
    this.appliedConstraints = [];
    this.avoidedAntiPatterns = [];
    this.confidenceSum = 0;
    this.confidenceCount = 0;
  }
}
