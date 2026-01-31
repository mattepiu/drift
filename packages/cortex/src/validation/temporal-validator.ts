/**
 * Temporal Validator
 * 
 * Validates memories based on time-based staleness.
 * Different memory types have different half-lives.
 */

import type { Memory, MemoryType } from '../types/index.js';
import type { ValidationIssue } from './engine.js';

/**
 * Half-lives in days for different memory types
 */
const HALF_LIVES: Record<MemoryType, number> = {
  core: Infinity,
  tribal: 365,
  procedural: 180,
  semantic: 90,
  episodic: 7,
  pattern_rationale: 180,
  constraint_override: 90,
  decision_context: 180,
  code_smell: 90,
};

/**
 * Validation thresholds in days
 */
const VALIDATION_THRESHOLDS: Record<MemoryType, number> = {
  core: 365,
  tribal: 90,
  procedural: 60,
  semantic: 30,
  episodic: 7,
  pattern_rationale: 60,
  constraint_override: 30,
  decision_context: 90,
  code_smell: 30,
};

/**
 * Temporal validator
 */
export class TemporalValidator {
  /**
   * Validate a memory's temporal freshness
   */
  validate(memory: Memory): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const daysSinceValidation = this.daysSince(memory.lastValidated || memory.createdAt);
    const daysSinceAccess = this.daysSince(memory.lastAccessed || memory.createdAt);

    const validationThreshold = VALIDATION_THRESHOLDS[memory.type] || 30;
    const halfLife = HALF_LIVES[memory.type] || 90;

    // Check validation staleness
    if (daysSinceValidation > validationThreshold) {
      issues.push({
        dimension: 'temporal',
        severity: daysSinceValidation > validationThreshold * 2 ? 'moderate' : 'minor',
        description: `Memory not validated in ${daysSinceValidation} days`,
        suggestion: 'Re-validate against current codebase',
      });
    }

    // Check dormancy
    if (daysSinceAccess > halfLife && halfLife !== Infinity) {
      issues.push({
        dimension: 'temporal',
        severity: 'minor',
        description: `Memory not accessed in ${daysSinceAccess} days`,
        suggestion: 'Consider archiving if no longer relevant',
      });
    }

    return issues;
  }

  /**
   * Calculate days since a date
   */
  private daysSince(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  }
}
