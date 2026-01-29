/**
 * Any Usage Detector - LEARNING VERSION
 *
 * Learns 'any' type usage patterns from the user's codebase:
 * - Acceptable any usage contexts
 * - Alternative type patterns
 * - Strictness level
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

export type AnyAlternative = 'unknown' | 'generic' | 'specific' | 'any-allowed';

export interface AnyUsageConventions {
  [key: string]: unknown;
  preferredAlternative: AnyAlternative;
  allowsExplicitAny: boolean;
  allowsInCatchBlocks: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const ANY_PATTERN = /:\s*any\b|<any>|as\s+any/g;
const UNKNOWN_PATTERN = /:\s*unknown\b|<unknown>/g;
const CATCH_ANY_PATTERN = /catch\s*\([^)]*:\s*any\)/g;

function detectAnyUsage(content: string): { hasAny: boolean; hasUnknown: boolean; inCatch: boolean } {
  return {
    hasAny: ANY_PATTERN.test(content),
    hasUnknown: UNKNOWN_PATTERN.test(content),
    inCatch: CATCH_ANY_PATTERN.test(content),
  };
}

// ============================================================================
// Learning Any Usage Detector
// ============================================================================

export class AnyUsageLearningDetector extends LearningDetector<AnyUsageConventions> {
  readonly id = 'types/any-usage';
  readonly category = 'types' as const;
  readonly subcategory = 'any-usage';
  readonly name = 'Any Usage Detector (Learning)';
  readonly description = 'Learns any type usage patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript'];

  protected getConventionKeys(): Array<keyof AnyUsageConventions> {
    return ['preferredAlternative', 'allowsExplicitAny', 'allowsInCatchBlocks'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof AnyUsageConventions, ValueDistribution>
  ): void {
    const usage = detectAnyUsage(context.content);
    const altDist = distributions.get('preferredAlternative')!;
    const explicitDist = distributions.get('allowsExplicitAny')!;
    const catchDist = distributions.get('allowsInCatchBlocks')!;
    
    if (usage.hasUnknown) {altDist.add('unknown', context.file);}
    else if (usage.hasAny) {altDist.add('any-allowed', context.file);}
    
    explicitDist.add(usage.hasAny, context.file);
    catchDist.add(usage.inCatch, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<AnyUsageConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const usage = detectAnyUsage(context.content);
    const learnedAlt = conventions.conventions.preferredAlternative?.value;
    
    if (usage.hasAny && learnedAlt === 'unknown') {
      const match = ANY_PATTERN.exec(context.content);
      if (match) {
        const beforeMatch = context.content.slice(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;
        
        violations.push(this.createConventionViolation(
          context.file, lineNumber, 1,
          'type annotation', 'any', 'unknown',
          `Using 'any' but your project prefers 'unknown'`
        ));
      }
    }
    
    if (usage.hasAny || usage.hasUnknown) {
      patterns.push({
        patternId: `${this.id}/${usage.hasUnknown ? 'unknown' : 'any'}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createAnyUsageLearningDetector(): AnyUsageLearningDetector {
  return new AnyUsageLearningDetector();
}
