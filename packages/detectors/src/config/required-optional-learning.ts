/**
 * Required/Optional Config Detector - LEARNING VERSION
 *
 * Learns required vs optional config patterns from the user's codebase:
 * - Required field marking
 * - Optional field handling
 * - Validation approach
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

export type RequiredMarking = 'assertion' | 'validation' | 'type-annotation' | 'runtime-check';

export interface RequiredOptionalConventions {
  [key: string]: unknown;
  requiredMarking: RequiredMarking;
  throwsOnMissing: boolean;
  usesDefaultForOptional: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const REQUIRED_PATTERNS = {
  assertion: /!\s*;|as\s+\w+/g,
  validation: /\.required\(\)|isRequired|mustBe/gi,
  typeAnnotation: /:\s*\w+(?!\s*\?)/g,
  runtimeCheck: /if\s*\(\s*!\w+\s*\)|throw.*required|throw.*missing/gi,
};

function detectRequiredMarking(content: string): RequiredMarking | null {
  if (REQUIRED_PATTERNS.validation.test(content)) {return 'validation';}
  if (REQUIRED_PATTERNS.runtimeCheck.test(content)) {return 'runtime-check';}
  if (REQUIRED_PATTERNS.assertion.test(content)) {return 'assertion';}
  return null;
}

// ============================================================================
// Learning Required/Optional Detector
// ============================================================================

export class RequiredOptionalLearningDetector extends LearningDetector<RequiredOptionalConventions> {
  readonly id = 'config/required-optional';
  readonly category = 'config' as const;
  readonly subcategory = 'required-optional';
  readonly name = 'Required/Optional Detector (Learning)';
  readonly description = 'Learns required/optional config patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof RequiredOptionalConventions> {
    return ['requiredMarking', 'throwsOnMissing', 'usesDefaultForOptional'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof RequiredOptionalConventions, ValueDistribution>
  ): void {
    const marking = detectRequiredMarking(context.content);
    const markingDist = distributions.get('requiredMarking')!;
    const throwsDist = distributions.get('throwsOnMissing')!;
    const defaultDist = distributions.get('usesDefaultForOptional')!;
    
    if (marking) {markingDist.add(marking, context.file);}
    
    const throwsOnMissing = /throw.*required|throw.*missing|throw.*undefined/i.test(context.content);
    const usesDefault = /\?\?|default:|defaultValue|fallback/i.test(context.content);
    
    throwsDist.add(throwsOnMissing, context.file);
    defaultDist.add(usesDefault, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<RequiredOptionalConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentMarking = detectRequiredMarking(context.content);
    const learnedMarking = conventions.conventions.requiredMarking?.value;
    
    if (currentMarking && learnedMarking && currentMarking !== learnedMarking) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'required marking style', currentMarking, learnedMarking,
        `Using '${currentMarking}' but your project uses '${learnedMarking}'`
      ));
    }
    
    if (currentMarking) {
      patterns.push({
        patternId: `${this.id}/${currentMarking}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createRequiredOptionalLearningDetector(): RequiredOptionalLearningDetector {
  return new RequiredOptionalLearningDetector();
}
