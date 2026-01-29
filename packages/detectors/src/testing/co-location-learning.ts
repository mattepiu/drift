/**
 * Test Co-location Detector - LEARNING VERSION
 *
 * Learns test co-location patterns from the user's codebase:
 * - Test file placement relative to source
 * - Directory structure
 * - Naming conventions
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

export type TestCoLocationStyle = 'same-directory' | 'adjacent-folder' | 'root-tests';

export interface TestCoLocationConventions {
  [key: string]: unknown;
  coLocationStyle: TestCoLocationStyle;
  usesTestsFolder: boolean;
  testFolderName: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectTestCoLocation(filePath: string): TestCoLocationStyle | null {
  if (/\/__tests__\//.test(filePath)) {return 'adjacent-folder';}
  if (/\/tests?\//.test(filePath) && !/src\//.test(filePath)) {return 'root-tests';}
  if (/\.(?:test|spec)\.[tj]sx?$/.test(filePath)) {return 'same-directory';}
  return null;
}

// ============================================================================
// Learning Test Co-location Detector
// ============================================================================

export class TestCoLocationLearningDetector extends LearningDetector<TestCoLocationConventions> {
  readonly id = 'testing/co-location';
  readonly category = 'testing' as const;
  readonly subcategory = 'co-location';
  readonly name = 'Test Co-location Detector (Learning)';
  readonly description = 'Learns test co-location patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof TestCoLocationConventions> {
    return ['coLocationStyle', 'usesTestsFolder', 'testFolderName'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TestCoLocationConventions, ValueDistribution>
  ): void {
    const style = detectTestCoLocation(context.file);
    const styleDist = distributions.get('coLocationStyle')!;
    const folderDist = distributions.get('usesTestsFolder')!;
    
    if (style) {
      styleDist.add(style, context.file);
      folderDist.add(style !== 'same-directory', context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TestCoLocationConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentStyle = detectTestCoLocation(context.file);
    const learnedStyle = conventions.conventions.coLocationStyle?.value;
    
    if (currentStyle && learnedStyle && currentStyle !== learnedStyle) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'test co-location', currentStyle, learnedStyle,
        `Test file uses '${currentStyle}' but your project uses '${learnedStyle}'`
      ));
    }
    
    if (currentStyle) {
      patterns.push({
        patternId: `${this.id}/${currentStyle}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createTestCoLocationLearningDetector(): TestCoLocationLearningDetector {
  return new TestCoLocationLearningDetector();
}
