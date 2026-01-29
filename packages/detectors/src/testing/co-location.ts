/**
 * Test Co-location Detector - Test file co-location pattern detection
 *
 * Detects test co-location patterns including:
 * - Tests next to source files
 * - Tests in separate directory
 * - Mixed co-location patterns
 *
 * @requirements 14.2 - Test co-location patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type CoLocationPatternType =
  | 'co-located'
  | 'separate-directory'
  | 'tests-folder'
  | 'spec-folder';

export interface CoLocationPatternInfo {
  type: CoLocationPatternType;
  testFile: string;
  sourceFile?: string | undefined;
}

export interface CoLocationAnalysis {
  patterns: CoLocationPatternInfo[];
  dominantPattern: CoLocationPatternType | null;
  isConsistent: boolean;
  coLocatedCount: number;
  separateCount: number;
}

// ============================================================================
// Analysis Functions
// ============================================================================

export function isTestFile(filePath: string): boolean {
  // JavaScript/TypeScript
  if (/\.(test|spec)\.[jt]sx?$/.test(filePath) || /__tests__\//.test(filePath)) {
    return true;
  }
  // Python
  if (/test_\w+\.py$/.test(filePath) || /\w+_test\.py$/.test(filePath) || /\/tests?\//.test(filePath)) {
    return true;
  }
  return false;
}

export function getSourceFileForTest(testFile: string): string | null {
  // Convert test file to potential source file
  const sourceFile = testFile
    .replace(/\.(test|spec)\.([jt]sx?)$/, '.$2')
    .replace(/__tests__\//, '');

  return sourceFile !== testFile ? sourceFile : null;
}

export function detectCoLocationPattern(
  testFile: string,
  projectFiles: string[]
): CoLocationPatternInfo | null {
  if (!isTestFile(testFile)) {
    return null;
  }

  const sourceFile = getSourceFileForTest(testFile);

  // Check if test is in __tests__ directory
  if (/__tests__\//.test(testFile)) {
    return {
      type: 'tests-folder',
      testFile,
      sourceFile: sourceFile || undefined,
    };
  }

  // Check if test is in separate tests/ directory
  if (/\/tests?\//.test(testFile)) {
    return {
      type: 'separate-directory',
      testFile,
      sourceFile: sourceFile || undefined,
    };
  }

  // Check if source file exists in same directory (co-located)
  if (sourceFile && projectFiles.includes(sourceFile)) {
    return {
      type: 'co-located',
      testFile,
      sourceFile,
    };
  }

  return {
    type: 'co-located',
    testFile,
  };
}

export function analyzeCoLocation(
  _filePath: string,
  projectFiles: string[]
): CoLocationAnalysis {
  const patterns: CoLocationPatternInfo[] = [];
  const patternCounts = new Map<CoLocationPatternType, number>();

  // Analyze all test files in project
  for (const file of projectFiles) {
    const pattern = detectCoLocationPattern(file, projectFiles);
    if (pattern) {
      patterns.push(pattern);
      patternCounts.set(pattern.type, (patternCounts.get(pattern.type) || 0) + 1);
    }
  }

  let dominantPattern: CoLocationPatternType | null = null;
  let maxCount = 0;
  for (const [type, count] of patternCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantPattern = type;
    }
  }

  const coLocatedCount = patternCounts.get('co-located') || 0;
  const separateCount =
    (patternCounts.get('separate-directory') || 0) +
    (patternCounts.get('tests-folder') || 0);

  const isConsistent = patternCounts.size <= 1;

  return {
    patterns,
    dominantPattern,
    isConsistent,
    coLocatedCount,
    separateCount,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class TestCoLocationDetector extends RegexDetector {
  readonly id = 'testing/co-location';
  readonly name = 'Test Co-location Detector';
  readonly description = 'Detects test file co-location patterns and consistency';
  readonly category: PatternCategory = 'testing';
  readonly subcategory = 'co-location';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeCoLocation(context.file, context.projectContext.files);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = analysis.isConsistent ? 0.95 : 0.75;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        dominantPattern: analysis.dominantPattern,
        isConsistent: analysis.isConsistent,
        coLocatedCount: analysis.coLocatedCount,
        separateCount: analysis.separateCount,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createTestCoLocationDetector(): TestCoLocationDetector {
  return new TestCoLocationDetector();
}
