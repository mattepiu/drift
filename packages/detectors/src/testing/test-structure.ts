/**
 * Test Structure Detector - Test structure pattern detection
 *
 * Detects test structure patterns including:
 * - AAA pattern (Arrange-Act-Assert)
 * - Given-When-Then pattern
 * - Test organization patterns
 *
 * @requirements 14.3 - Test structure patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type TestStructurePatternType =
  | 'aaa-pattern'
  | 'given-when-then'
  | 'it-should'
  | 'test-function'
  | 'describe-block';

export interface TestStructurePatternInfo {
  type: TestStructurePatternType;
  line: number;
  column: number;
  match: string;
}

export interface TestStructureAnalysis {
  patterns: TestStructurePatternInfo[];
  hasAAAPattern: boolean;
  hasGivenWhenThen: boolean;
  testCount: number;
  describeCount: number;
}

// ============================================================================
// Patterns
// ============================================================================

export const AAA_COMMENT_PATTERNS = [
  /\/\/\s*(?:Arrange|Act|Assert)/gi,
  /\/\*\s*(?:Arrange|Act|Assert)\s*\*\//gi,
];

export const GIVEN_WHEN_THEN_PATTERNS = [
  /\/\/\s*(?:Given|When|Then)/gi,
  /(?:given|when|then)\s*\(/gi,
];

export const IT_SHOULD_PATTERNS = [
  /it\s*\(\s*['"`]should\s+/gi,
  /it\s*\(\s*['"`](?:returns?|throws?|creates?|updates?|deletes?)\s+/gi,
];

export const TEST_FUNCTION_PATTERNS = [
  // JavaScript/TypeScript
  /test\s*\(\s*['"`]/gi,
  /it\s*\(\s*['"`]/gi,
  /it\.(?:only|skip|todo)\s*\(\s*['"`]/gi,
  /test\.(?:only|skip|todo)\s*\(\s*['"`]/gi,
  // Python pytest
  /def\s+test_\w+\s*\(/gi,
  /@pytest\.mark\.\w+/gi,
];

export const DESCRIBE_BLOCK_PATTERNS = [
  // JavaScript/TypeScript
  /describe\s*\(\s*['"`]/gi,
  /describe\.(?:only|skip)\s*\(\s*['"`]/gi,
  /context\s*\(\s*['"`]/gi,
  // Python pytest classes
  /class\s+Test\w+\s*:/gi,
  /class\s+\w+Test\s*:/gi,
];

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  // JavaScript/TypeScript test files
  if (/\.(test|spec)\.[jt]sx?$/.test(filePath) || /__tests__\//.test(filePath)) {
    return false;
  }
  // Python test files
  if (/test_\w+\.py$/.test(filePath) || /\w+_test\.py$/.test(filePath)) {
    return false;
  }
  return true;
}

export function detectAAAPattern(content: string): TestStructurePatternInfo[] {
  const results: TestStructurePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of AAA_COMMENT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'aaa-pattern',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectGivenWhenThen(content: string): TestStructurePatternInfo[] {
  const results: TestStructurePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of GIVEN_WHEN_THEN_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'given-when-then',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectItShould(content: string): TestStructurePatternInfo[] {
  const results: TestStructurePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of IT_SHOULD_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'it-should',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectTestFunctions(content: string): TestStructurePatternInfo[] {
  const results: TestStructurePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TEST_FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'test-function',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectDescribeBlocks(content: string): TestStructurePatternInfo[] {
  const results: TestStructurePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DESCRIBE_BLOCK_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'describe-block',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function analyzeTestStructure(content: string, filePath: string): TestStructureAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      hasAAAPattern: false,
      hasGivenWhenThen: false,
      testCount: 0,
      describeCount: 0,
    };
  }

  const patterns: TestStructurePatternInfo[] = [
    ...detectAAAPattern(content),
    ...detectGivenWhenThen(content),
    ...detectItShould(content),
    ...detectTestFunctions(content),
    ...detectDescribeBlocks(content),
  ];

  const hasAAAPattern = patterns.some((p) => p.type === 'aaa-pattern');
  const hasGivenWhenThen = patterns.some((p) => p.type === 'given-when-then');
  const testCount = patterns.filter((p) => p.type === 'test-function').length;
  const describeCount = patterns.filter((p) => p.type === 'describe-block').length;

  return {
    patterns,
    hasAAAPattern,
    hasGivenWhenThen,
    testCount,
    describeCount,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class TestStructureDetector extends RegexDetector {
  readonly id = 'testing/test-structure';
  readonly name = 'Test Structure Detector';
  readonly description = 'Detects test structure patterns like AAA and Given-When-Then';
  readonly category: PatternCategory = 'testing';
  readonly subcategory = 'test-structure';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeTestStructure(context.content, context.file);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = 0.9;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        hasAAAPattern: analysis.hasAAAPattern,
        hasGivenWhenThen: analysis.hasGivenWhenThen,
        testCount: analysis.testCount,
        describeCount: analysis.describeCount,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createTestStructureDetector(): TestStructureDetector {
  return new TestStructureDetector();
}
