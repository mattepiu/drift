/**
 * Pattern Alignment Validator
 * 
 * Validates that memories are still aligned with their linked patterns.
 * Checks if patterns still exist and are still relevant.
 */

import type { Memory } from '../types/index.js';
import type { ValidationIssue } from './engine.js';

/**
 * Pattern alignment validator
 */
export class PatternAlignmentValidator {
  /**
   * Validate pattern alignment for a memory
   */
  async validate(memory: Memory): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Check if memory has linked patterns
    if (!memory.linkedPatterns?.length) {
      return issues;
    }

    // For pattern_rationale memories, check if the pattern still exists
    if (memory.type === 'pattern_rationale') {
      // This would integrate with Drift's pattern system
      // For now, we just check if the pattern ID is valid
      const patternId = memory.patternId;
      if (!patternId) {
        issues.push({
          dimension: 'pattern',
          severity: 'moderate',
          description: 'Pattern rationale has no linked pattern ID',
          suggestion: 'Link this rationale to a pattern',
        });
      }
    }

    // For constraint_override memories, check if the constraint still exists
    if (memory.type === 'constraint_override') {
      const constraintId = memory.constraintId;
      if (!constraintId) {
        issues.push({
          dimension: 'pattern',
          severity: 'moderate',
          description: 'Constraint override has no linked constraint ID',
          suggestion: 'Link this override to a constraint',
        });
      }

      // Check if override has expired
      if (memory.expiresAt && new Date(memory.expiresAt) < new Date()) {
        issues.push({
          dimension: 'pattern',
          severity: 'minor',
          description: 'Constraint override has expired',
          suggestion: 'Review and renew or archive this override',
        });
      }
    }

    return issues;
  }
}
