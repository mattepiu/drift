/**
 * Setup/Teardown Detector - Test setup and teardown pattern detection
 *
 * Detects setup/teardown patterns including:
 * - beforeEach/afterEach
 * - beforeAll/afterAll
 * - Setup functions
 * - Cleanup patterns
 *
 * @requirements 14.7 - Setup/teardown patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type SetupTeardownPatternType =
  | 'before-each'
  | 'after-each'
  | 'before-all'
  | 'after-all'
  | 'setup-function'
  | 'cleanup-function';

export interface SetupTeardownPatternInfo {
  type: SetupTeardownPatternType;
  line: number;
  column: number;
  match: string;
}

export interface SetupTeardownAnalysis {
  patterns: SetupTeardownPatternInfo[];
  hasBeforeEach: boolean;
  hasAfterEach: boolean;
  hasBeforeAll: boolean;
  hasAfterAll: boolean;
  isBalanced: boolean;
}

// ============================================================================
// Patterns
// ============================================================================

export const BEFORE_EACH_PATTERNS = [
  /beforeEach\s*\(/gi,
  /before\s*\(\s*(?:async\s*)?\(/gi,
];

export const AFTER_EACH_PATTERNS = [
  /afterEach\s*\(/gi,
  /after\s*\(\s*(?:async\s*)?\(/gi,
];

export const BEFORE_ALL_PATTERNS = [
  /beforeAll\s*\(/gi,
  /before\s*\(\s*['"`]all['"`]/gi,
];

export const AFTER_ALL_PATTERNS = [
  /afterAll\s*\(/gi,
  /after\s*\(\s*['"`]all['"`]/gi,
];

export const SETUP_FUNCTION_PATTERNS = [
  // JavaScript/TypeScript
  /(?:const|function)\s+setup\w*\s*[=:]/gi,
  /(?:const|function)\s+init\w*\s*[=:]/gi,
  /(?:const|function)\s+prepare\w*\s*[=:]/gi,
  // Python pytest
  /def\s+setup\s*\(/gi,
  /def\s+setup_method\s*\(/gi,
  /def\s+setup_class\s*\(/gi,
  /def\s+setup_module\s*\(/gi,
  /@pytest\.fixture.*\s+def\s+\w+/gi,
];

export const CLEANUP_FUNCTION_PATTERNS = [
  // JavaScript/TypeScript
  /(?:const|function)\s+cleanup\w*\s*[=:]/gi,
  /(?:const|function)\s+teardown\w*\s*[=:]/gi,
  /(?:const|function)\s+reset\w*\s*[=:]/gi,
  // Python pytest
  /def\s+teardown\s*\(/gi,
  /def\s+teardown_method\s*\(/gi,
  /def\s+teardown_class\s*\(/gi,
  /def\s+teardown_module\s*\(/gi,
  /yield\s+\w+/gi, // pytest fixture cleanup after yield
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
  if (/test_\w+\.py$/.test(filePath) || /\w+_test\.py$/.test(filePath) || /conftest\.py$/.test(filePath)) {
    return false;
  }
  return true;
}

export function detectBeforeEach(content: string): SetupTeardownPatternInfo[] {
  const results: SetupTeardownPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of BEFORE_EACH_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'before-each',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectAfterEach(content: string): SetupTeardownPatternInfo[] {
  const results: SetupTeardownPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of AFTER_EACH_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'after-each',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectBeforeAll(content: string): SetupTeardownPatternInfo[] {
  const results: SetupTeardownPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of BEFORE_ALL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'before-all',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectAfterAll(content: string): SetupTeardownPatternInfo[] {
  const results: SetupTeardownPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of AFTER_ALL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'after-all',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectSetupFunctions(content: string): SetupTeardownPatternInfo[] {
  const results: SetupTeardownPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SETUP_FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'setup-function',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectCleanupFunctions(content: string): SetupTeardownPatternInfo[] {
  const results: SetupTeardownPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CLEANUP_FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'cleanup-function',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function analyzeSetupTeardown(content: string, filePath: string): SetupTeardownAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      hasBeforeEach: false,
      hasAfterEach: false,
      hasBeforeAll: false,
      hasAfterAll: false,
      isBalanced: true,
    };
  }

  const patterns: SetupTeardownPatternInfo[] = [
    ...detectBeforeEach(content),
    ...detectAfterEach(content),
    ...detectBeforeAll(content),
    ...detectAfterAll(content),
    ...detectSetupFunctions(content),
    ...detectCleanupFunctions(content),
  ];

  const hasBeforeEach = patterns.some((p) => p.type === 'before-each');
  const hasAfterEach = patterns.some((p) => p.type === 'after-each');
  const hasBeforeAll = patterns.some((p) => p.type === 'before-all');
  const hasAfterAll = patterns.some((p) => p.type === 'after-all');

  // Check if setup/teardown is balanced
  const isBalanced =
    (hasBeforeAll === hasAfterAll) &&
    (!hasBeforeEach || hasAfterEach || !hasBeforeAll);

  return {
    patterns,
    hasBeforeEach,
    hasAfterEach,
    hasBeforeAll,
    hasAfterAll,
    isBalanced,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class SetupTeardownDetector extends RegexDetector {
  readonly id = 'testing/setup-teardown';
  readonly name = 'Setup/Teardown Detector';
  readonly description = 'Detects test setup and teardown patterns';
  readonly category: PatternCategory = 'testing';
  readonly subcategory = 'setup-teardown';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeSetupTeardown(context.content, context.file);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = analysis.isBalanced ? 0.95 : 0.8;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        hasBeforeEach: analysis.hasBeforeEach,
        hasAfterEach: analysis.hasAfterEach,
        hasBeforeAll: analysis.hasBeforeAll,
        hasAfterAll: analysis.hasAfterAll,
        isBalanced: analysis.isBalanced,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createSetupTeardownDetector(): SetupTeardownDetector {
  return new SetupTeardownDetector();
}
