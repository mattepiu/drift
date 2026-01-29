/**
 * Spring Validation Patterns Detector - LEARNING VERSION
 *
 * Learns validation patterns from the user's codebase:
 * - Validation annotation preferences (@Valid, @Validated)
 * - Constraint annotation usage (@NotNull, @NotBlank, @Size, etc.)
 * - Custom validator patterns
 * - BindingResult handling patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import { SPRING_KEYWORD_GROUPS } from './keywords.js';
import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ValidationStyle = 'bean-validation' | 'spring-validation' | 'custom' | 'mixed';
export type NullCheckStyle = 'NotNull' | 'NotBlank' | 'NotEmpty' | 'mixed';

export interface SpringValidationConventions {
  [key: string]: unknown;
  /** Primary validation trigger annotation (@Valid vs @Validated) */
  validationTrigger: 'Valid' | 'Validated';
  /** Preferred null check annotation */
  nullCheckStyle: NullCheckStyle;
  /** Whether custom validators are used */
  usesCustomValidators: boolean;
  /** Whether BindingResult is used for error handling */
  usesBindingResult: boolean;
}

interface ValidationPatternInfo {
  /** The validation keyword found */
  keyword: string;
  /** Type of validation pattern */
  patternType: 'trigger' | 'constraint' | 'custom' | 'binding';
  /** Specific value for categorization */
  value: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractValidationPatterns(content: string, file: string): ValidationPatternInfo[] {
  const results: ValidationPatternInfo[] = [];
  const keywords = SPRING_KEYWORD_GROUPS.validation.keywords;

  for (const keyword of keywords) {
    // Match annotation usage (with @) or class references
    const pattern = new RegExp(`@${keyword}\\b|\\b${keyword}\\b`, 'g');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip imports
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.slice(lineStart, content.indexOf('\n', match.index));
      if (lineContent.trim().startsWith('import ')) {continue;}

      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      // Categorize the pattern
      let patternType: ValidationPatternInfo['patternType'] = 'constraint';
      const value = keyword;

      if (keyword === 'Valid' || keyword === 'Validated') {
        patternType = 'trigger';
      } else if (keyword === 'Constraint' || keyword === 'ConstraintValidator' || keyword === 'ConstraintValidatorContext') {
        patternType = 'custom';
      } else if (keyword === 'BindingResult' || keyword === 'Errors' || keyword === 'FieldError' || keyword === 'ObjectError') {
        patternType = 'binding';
      }

      results.push({
        keyword,
        patternType,
        value,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Detector
// ============================================================================

export class SpringValidationLearningDetector extends LearningDetector<SpringValidationConventions> {
  readonly id = 'spring/validation-patterns-learning';
  readonly category = 'security' as const;
  readonly subcategory = 'spring-validation';
  readonly name = 'Spring Validation Patterns Detector (Learning)';
  readonly description = 'Learns validation patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringValidationConventions> {
    return ['validationTrigger', 'nullCheckStyle', 'usesCustomValidators', 'usesBindingResult'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringValidationConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractValidationPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const triggerDist = distributions.get('validationTrigger')!;
    const nullCheckDist = distributions.get('nullCheckStyle')!;
    const customDist = distributions.get('usesCustomValidators')!;
    const bindingDist = distributions.get('usesBindingResult')!;

    for (const pattern of patterns) {
      if (pattern.patternType === 'trigger') {
        triggerDist.add(pattern.keyword as 'Valid' | 'Validated', context.file);
      } else if (pattern.patternType === 'constraint') {
        if (['NotNull', 'NotBlank', 'NotEmpty'].includes(pattern.keyword)) {
          nullCheckDist.add(pattern.keyword as NullCheckStyle, context.file);
        }
      } else if (pattern.patternType === 'custom') {
        customDist.add(true, context.file);
      } else if (pattern.patternType === 'binding') {
        bindingDist.add(true, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringValidationConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractValidationPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedTrigger = conventions.conventions.validationTrigger?.value;
    const learnedNullCheck = conventions.conventions.nullCheckStyle?.value;

    // Check for validation trigger consistency
    if (learnedTrigger) {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'trigger' && pattern.keyword !== learnedTrigger) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'validation trigger', pattern.keyword, learnedTrigger,
            `Using @${pattern.keyword} but project prefers @${learnedTrigger}`
          ));
        }
      }
    }

    // Check for null check style consistency
    if (learnedNullCheck && learnedNullCheck !== 'mixed') {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'constraint' && 
            ['NotNull', 'NotBlank', 'NotEmpty'].includes(pattern.keyword) &&
            pattern.keyword !== learnedNullCheck) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'null check annotation', pattern.keyword, learnedNullCheck,
            `Using @${pattern.keyword} but project prefers @${learnedNullCheck}`
          ));
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/validation`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createSpringValidationLearningDetector(): SpringValidationLearningDetector {
  return new SpringValidationLearningDetector();
}
