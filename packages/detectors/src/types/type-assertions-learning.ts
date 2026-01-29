/**
 * Type Assertions Detector - LEARNING VERSION
 *
 * Learns type assertion patterns from the user's codebase:
 * - Assertion syntax preference (as vs angle bracket)
 * - Non-null assertion usage
 * - Type guard patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type AssertionSyntax = 'as' | 'angle-bracket' | 'mixed';
export type NonNullUsage = 'allowed' | 'discouraged' | 'type-guards-preferred';

export interface TypeAssertionsConventions {
  [key: string]: unknown;
  assertionSyntax: AssertionSyntax;
  nonNullUsage: NonNullUsage;
  prefersTypeGuards: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const AS_ASSERTION_PATTERN = /\s+as\s+\w+/g;
const ANGLE_BRACKET_PATTERN = /<\w+>\s*\w+/g;
const TYPE_GUARD_PATTERN = /is\s+\w+|typeof\s+\w+\s*===|instanceof/g;

function detectAssertionSyntax(content: string): AssertionSyntax | null {
  const hasAs = AS_ASSERTION_PATTERN.test(content);
  const hasAngle = ANGLE_BRACKET_PATTERN.test(content);
  
  if (hasAs && hasAngle) {return 'mixed';}
  if (hasAs) {return 'as';}
  if (hasAngle) {return 'angle-bracket';}
  return null;
}

// ============================================================================
// Learning Type Assertions Detector
// ============================================================================

export class TypeAssertionsLearningDetector extends LearningDetector<TypeAssertionsConventions> {
  readonly id = 'types/type-assertions';
  readonly category = 'types' as const;
  readonly subcategory = 'type-assertions';
  readonly name = 'Type Assertions Detector (Learning)';
  readonly description = 'Learns type assertion patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript'];

  protected getConventionKeys(): Array<keyof TypeAssertionsConventions> {
    return ['assertionSyntax', 'nonNullUsage', 'prefersTypeGuards'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TypeAssertionsConventions, ValueDistribution>
  ): void {
    const syntax = detectAssertionSyntax(context.content);
    const syntaxDist = distributions.get('assertionSyntax')!;
    const guardDist = distributions.get('prefersTypeGuards')!;
    
    if (syntax) {syntaxDist.add(syntax, context.file);}
    
    const hasTypeGuards = TYPE_GUARD_PATTERN.test(context.content);
    guardDist.add(hasTypeGuards, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TypeAssertionsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentSyntax = detectAssertionSyntax(context.content);
    const learnedSyntax = conventions.conventions.assertionSyntax?.value;
    
    if (currentSyntax && learnedSyntax && learnedSyntax !== 'mixed' && currentSyntax !== learnedSyntax) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'type assertion syntax', currentSyntax, learnedSyntax,
        `Using '${currentSyntax}' assertions but your project uses '${learnedSyntax}'`
      ));
    }
    
    if (currentSyntax) {
      patterns.push({
        patternId: `${this.id}/${currentSyntax}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createTypeAssertionsLearningDetector(): TypeAssertionsLearningDetector {
  return new TypeAssertionsLearningDetector();
}
