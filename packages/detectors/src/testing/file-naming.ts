/**
 * Test File Naming Detector - Test file naming convention detection
 *
 * Detects test file naming patterns including:
 * - .test.ts/.spec.ts conventions
 * - __tests__ directory usage
 * - Test file location patterns
 *
 * @requirements 14.1 - Test file naming patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type TestFileNamingPatternType =
  | 'test-suffix'
  | 'spec-suffix'
  | 'tests-directory'
  | 'test-directory'
  | 'co-located';

export interface TestFileNamingPatternInfo {
  type: TestFileNamingPatternType;
  filePath: string;
  convention: string;
}

export interface TestFileNamingAnalysis {
  patterns: TestFileNamingPatternInfo[];
  dominantConvention: string | null;
  isConsistent: boolean;
}

// ============================================================================
// Patterns
// ============================================================================

export const TEST_SUFFIX_PATTERN = /\.test\.[jt]sx?$/;
export const SPEC_SUFFIX_PATTERN = /\.spec\.[jt]sx?$/;
export const TESTS_DIRECTORY_PATTERN = /__tests__\//;
export const TEST_DIRECTORY_PATTERN = /\/tests?\//;
// Python patterns
export const PYTHON_TEST_PREFIX_PATTERN = /test_\w+\.py$/;
export const PYTHON_TEST_SUFFIX_PATTERN = /\w+_test\.py$/;

// ============================================================================
// Analysis Functions
// ============================================================================

export function detectTestFileNaming(filePath: string): TestFileNamingPatternInfo | null {
  if (TEST_SUFFIX_PATTERN.test(filePath)) {
    return {
      type: 'test-suffix',
      filePath,
      convention: '.test.ts',
    };
  }

  if (SPEC_SUFFIX_PATTERN.test(filePath)) {
    return {
      type: 'spec-suffix',
      filePath,
      convention: '.spec.ts',
    };
  }

  if (TESTS_DIRECTORY_PATTERN.test(filePath)) {
    return {
      type: 'tests-directory',
      filePath,
      convention: '__tests__/',
    };
  }

  if (TEST_DIRECTORY_PATTERN.test(filePath)) {
    return {
      type: 'test-directory',
      filePath,
      convention: 'tests/',
    };
  }

  // Python test file patterns
  if (PYTHON_TEST_PREFIX_PATTERN.test(filePath)) {
    return {
      type: 'test-suffix',
      filePath,
      convention: 'test_*.py',
    };
  }

  if (PYTHON_TEST_SUFFIX_PATTERN.test(filePath)) {
    return {
      type: 'test-suffix',
      filePath,
      convention: '*_test.py',
    };
  }

  return null;
}

export function analyzeTestFileNaming(
  filePath: string,
  projectFiles: string[]
): TestFileNamingAnalysis {
  const patterns: TestFileNamingPatternInfo[] = [];

  // Analyze current file
  const currentPattern = detectTestFileNaming(filePath);
  if (currentPattern) {
    patterns.push(currentPattern);
  }

  // Analyze project files for consistency
  const conventionCounts = new Map<string, number>();
  for (const file of projectFiles) {
    const pattern = detectTestFileNaming(file);
    if (pattern) {
      conventionCounts.set(
        pattern.convention,
        (conventionCounts.get(pattern.convention) || 0) + 1
      );
    }
  }

  let dominantConvention: string | null = null;
  let maxCount = 0;
  for (const [convention, count] of conventionCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantConvention = convention;
    }
  }

  const isConsistent = conventionCounts.size <= 1;

  return { patterns, dominantConvention, isConsistent };
}

// ============================================================================
// Detector Class
// ============================================================================

export class TestFileNamingDetector extends RegexDetector {
  readonly id = 'testing/file-naming';
  readonly name = 'Test File Naming Detector';
  readonly description = 'Detects test file naming conventions and consistency';
  readonly category: PatternCategory = 'testing';
  readonly subcategory = 'file-naming';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeTestFileNaming(
      context.file,
      context.projectContext.files
    );

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = analysis.isConsistent ? 0.95 : 0.8;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        dominantConvention: analysis.dominantConvention,
        isConsistent: analysis.isConsistent,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createTestFileNamingDetector(): TestFileNamingDetector {
  return new TestFileNamingDetector();
}
