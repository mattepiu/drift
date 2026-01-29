/**
 * Co-location Detector - LEARNING VERSION
 *
 * Learns file co-location patterns from the user's codebase:
 * - Test file placement
 * - Style file placement
 * - Type file placement
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

export type CoLocationStyle = 'colocated' | 'separate-folder' | 'mixed';

export interface CoLocationConventions {
  [key: string]: unknown;
  testLocation: CoLocationStyle;
  styleLocation: CoLocationStyle;
  typeLocation: CoLocationStyle;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectCoLocationStyle(filePath: string, fileType: 'test' | 'style' | 'type'): CoLocationStyle | null {
  const patterns = {
    test: { colocated: /\.test\.|\.spec\./, separate: /\/__tests__\/|\/tests?\// },
    style: { colocated: /\.module\.|\.styles\./, separate: /\/styles\/|\/css\// },
    type: { colocated: /\.types\.|\.d\.ts/, separate: /\/types\/|\/interfaces\// },
  };
  
  const p = patterns[fileType];
  if (p.colocated.test(filePath)) {return 'colocated';}
  if (p.separate.test(filePath)) {return 'separate-folder';}
  return null;
}

// ============================================================================
// Learning Co-location Detector
// ============================================================================

export class CoLocationLearningDetector extends LearningDetector<CoLocationConventions> {
  readonly id = 'structural/co-location';
  readonly category = 'structural' as const;
  readonly subcategory = 'co-location';
  readonly name = 'Co-location Detector (Learning)';
  readonly description = 'Learns file co-location patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof CoLocationConventions> {
    return ['testLocation', 'styleLocation', 'typeLocation'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof CoLocationConventions, ValueDistribution>
  ): void {
    const testDist = distributions.get('testLocation')!;
    const styleDist = distributions.get('styleLocation')!;
    const typeDist = distributions.get('typeLocation')!;
    
    const testStyle = detectCoLocationStyle(context.file, 'test');
    const styleStyle = detectCoLocationStyle(context.file, 'style');
    const typeStyle = detectCoLocationStyle(context.file, 'type');
    
    if (testStyle) {testDist.add(testStyle, context.file);}
    if (styleStyle) {styleDist.add(styleStyle, context.file);}
    if (typeStyle) {typeDist.add(typeStyle, context.file);}
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<CoLocationConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const testStyle = detectCoLocationStyle(context.file, 'test');
    const learnedTest = conventions.conventions.testLocation?.value;
    
    if (testStyle && learnedTest && learnedTest !== 'mixed' && testStyle !== learnedTest) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'test file location', testStyle, learnedTest,
        `Test file uses '${testStyle}' but your project uses '${learnedTest}'`
      ));
    }
    
    if (testStyle) {
      patterns.push({
        patternId: `${this.id}/test-${testStyle}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createCoLocationLearningDetector(): CoLocationLearningDetector {
  return new CoLocationLearningDetector();
}
