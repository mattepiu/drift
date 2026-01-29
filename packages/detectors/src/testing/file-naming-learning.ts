/**
 * Test File Naming Detector - LEARNING VERSION
 *
 * Learns test file naming patterns from the user's codebase:
 * - Suffix convention (.test vs .spec)
 * - Directory placement
 * - Naming patterns
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

export type TestFileSuffix = 'test' | 'spec' | 'mixed';
export type TestFileLocation = 'colocated' | '__tests__' | 'tests-folder';

export interface TestFileNamingConventions {
  [key: string]: unknown;
  fileSuffix: TestFileSuffix;
  fileLocation: TestFileLocation;
  matchesSourceName: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectTestFileSuffix(filePath: string): TestFileSuffix | null {
  if (/\.test\.[tj]sx?$/.test(filePath)) {return 'test';}
  if (/\.spec\.[tj]sx?$/.test(filePath)) {return 'spec';}
  return null;
}

function detectTestFileLocation(filePath: string): TestFileLocation | null {
  if (/__tests__/.test(filePath)) {return '__tests__';}
  if (/\/tests?\//.test(filePath)) {return 'tests-folder';}
  if (/\.(?:test|spec)\.[tj]sx?$/.test(filePath)) {return 'colocated';}
  return null;
}

// ============================================================================
// Learning Test File Naming Detector
// ============================================================================

export class TestFileNamingLearningDetector extends LearningDetector<TestFileNamingConventions> {
  readonly id = 'testing/file-naming';
  readonly category = 'testing' as const;
  readonly subcategory = 'file-naming';
  readonly name = 'Test File Naming Detector (Learning)';
  readonly description = 'Learns test file naming patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof TestFileNamingConventions> {
    return ['fileSuffix', 'fileLocation', 'matchesSourceName'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TestFileNamingConventions, ValueDistribution>
  ): void {
    const suffix = detectTestFileSuffix(context.file);
    const location = detectTestFileLocation(context.file);
    
    const suffixDist = distributions.get('fileSuffix')!;
    const locationDist = distributions.get('fileLocation')!;
    
    if (suffix) {suffixDist.add(suffix, context.file);}
    if (location) {locationDist.add(location, context.file);}
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TestFileNamingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentSuffix = detectTestFileSuffix(context.file);
    const learnedSuffix = conventions.conventions.fileSuffix?.value;
    
    if (currentSuffix && learnedSuffix && learnedSuffix !== 'mixed' && currentSuffix !== learnedSuffix) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'test file suffix', currentSuffix, learnedSuffix,
        `Using '.${currentSuffix}' but your project uses '.${learnedSuffix}'`
      ));
    }
    
    if (currentSuffix) {
      patterns.push({
        patternId: `${this.id}/${currentSuffix}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createTestFileNamingLearningDetector(): TestFileNamingLearningDetector {
  return new TestFileNamingLearningDetector();
}
