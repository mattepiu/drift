/**
 * Test Structure Detector - LEARNING VERSION
 *
 * Learns test structure patterns from the user's codebase:
 * - Test file organization (describe/it nesting)
 * - Test naming conventions
 * - Setup/teardown patterns
 *
 * Flags violations only when code deviates from the PROJECT'S established patterns.
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

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Test framework type
 */
export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'unknown';

/**
 * Conventions this detector learns
 */
export interface TestStructureConventions {
  [key: string]: unknown;
  /** Test framework used */
  framework: TestFramework;
  /** Whether tests use describe blocks */
  usesDescribe: boolean;
  /** Whether tests use beforeEach/afterEach */
  usesSetupTeardown: boolean;
  /** Test function naming (it vs test) */
  testFunction: 'it' | 'test' | 'mixed';
}

/**
 * Test structure pattern info
 */
interface TestStructurePatternInfo {
  framework: TestFramework;
  hasDescribe: boolean;
  hasSetup: boolean;
  testFunction: 'it' | 'test';
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect test framework from content
 */
function detectFramework(content: string): TestFramework {
  if (/from\s+['"]vitest['"]/.test(content)) {return 'vitest';}
  if (/from\s+['"]@jest\/globals['"]/.test(content)) {return 'jest';}
  if (/require\s*\(\s*['"]mocha['"]\s*\)/.test(content)) {return 'mocha';}
  if (/import\s+pytest/.test(content) || /def\s+test_/.test(content)) {return 'pytest';}
  if (/describe\s*\(|it\s*\(|test\s*\(/.test(content)) {return 'jest';} // Default to jest-like
  return 'unknown';
}

/**
 * Extract test structure patterns from content
 */
function extractTestStructurePatterns(content: string, file: string): TestStructurePatternInfo[] {
  const results: TestStructurePatternInfo[] = [];
  const framework = detectFramework(content);

  // Check for describe blocks
  const hasDescribe = /\bdescribe\s*\(/.test(content);

  // Check for setup/teardown
  const hasSetup = /\b(?:beforeEach|afterEach|beforeAll|afterAll|setUp|tearDown)\s*\(/.test(content);

  // Find test functions
  const testPattern = /\b(it|test)\s*\(\s*['"`]/g;
  let match;
  while ((match = testPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      framework,
      hasDescribe,
      hasSetup,
      testFunction: (match[1] as 'it' | 'test') || 'test',
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Test Structure Detector
// ============================================================================

export class TestStructureLearningDetector extends LearningDetector<TestStructureConventions> {
  readonly id = 'testing/test-structure';
  readonly category = 'testing' as const;
  readonly subcategory = 'test-structure';
  readonly name = 'Test Structure Detector (Learning)';
  readonly description = 'Learns test structure patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof TestStructureConventions> {
    return ['framework', 'usesDescribe', 'usesSetupTeardown', 'testFunction'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TestStructureConventions, ValueDistribution>
  ): void {
    // Only analyze test files
    if (!context.isTestFile) {return;}

    const patterns = extractTestStructurePatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const frameworkDist = distributions.get('framework')!;
    const describeDist = distributions.get('usesDescribe')!;
    const setupDist = distributions.get('usesSetupTeardown')!;
    const testFnDist = distributions.get('testFunction')!;

    for (const pattern of patterns) {
      frameworkDist.add(pattern.framework, context.file);
      describeDist.add(pattern.hasDescribe, context.file);
      setupDist.add(pattern.hasSetup, context.file);
      testFnDist.add(pattern.testFunction, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TestStructureConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (!context.isTestFile) {
      return this.createEmptyResult();
    }

    const testPatterns = extractTestStructurePatterns(context.content, context.file);
    if (testPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedTestFn = conventions.conventions.testFunction?.value;
    const learnedUsesDescribe = conventions.conventions.usesDescribe?.value;

    // Check test function consistency
    if (learnedTestFn && learnedTestFn !== 'mixed') {
      for (const pattern of testPatterns) {
        if (pattern.testFunction !== learnedTestFn) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'test function',
            pattern.testFunction,
            learnedTestFn,
            `Using '${pattern.testFunction}()' but project uses '${learnedTestFn}()'`
          ));
        }
      }
    }

    // Check describe usage consistency
    if (learnedUsesDescribe === true) {
      const hasDescribe = testPatterns.some(p => p.hasDescribe);
      if (!hasDescribe) {
        const firstPattern = testPatterns[0];
        if (firstPattern) {
          violations.push(this.createConventionViolation(
            firstPattern.file,
            firstPattern.line,
            firstPattern.column,
            'describe blocks',
            'no describe',
            'with describe',
            `Tests should be wrapped in describe() blocks`
          ));
        }
      }
    }

    if (testPatterns.length > 0) {
      const firstPattern = testPatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/test-structure`,
          location: { file: context.file, line: firstPattern.line, column: firstPattern.column },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createTestStructureLearningDetector(): TestStructureLearningDetector {
  return new TestStructureLearningDetector();
}
