/**
 * Mock Patterns Detector - Test mocking pattern detection
 *
 * Detects mocking patterns including:
 * - Jest mocks
 * - Vitest mocks
 * - Sinon stubs/spies
 * - Manual mocks
 *
 * @requirements 14.4 - Mock patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type MockPatternType =
  | 'jest-mock'
  | 'vitest-mock'
  | 'sinon-stub'
  | 'sinon-spy'
  | 'manual-mock'
  | 'mock-implementation';

export interface MockPatternInfo {
  type: MockPatternType;
  line: number;
  column: number;
  match: string;
  library?: string;
}

export interface MockAnalysis {
  patterns: MockPatternInfo[];
  dominantLibrary: string | null;
  mockCount: number;
  hasManualMocks: boolean;
}

// ============================================================================
// Patterns
// ============================================================================

export const JEST_MOCK_PATTERNS = [
  /jest\.mock\s*\(/gi,
  /jest\.fn\s*\(/gi,
  /jest\.spyOn\s*\(/gi,
  /\.mockReturnValue\s*\(/gi,
  /\.mockResolvedValue\s*\(/gi,
  /\.mockRejectedValue\s*\(/gi,
  /\.mockImplementation\s*\(/gi,
];

export const VITEST_MOCK_PATTERNS = [
  /vi\.mock\s*\(/gi,
  /vi\.fn\s*\(/gi,
  /vi\.spyOn\s*\(/gi,
  /vi\.stubGlobal\s*\(/gi,
];

export const SINON_STUB_PATTERNS = [
  /sinon\.stub\s*\(/gi,
  /\.stub\s*\(\s*\w+/gi,
  /\.returns\s*\(/gi,
  /\.resolves\s*\(/gi,
  /\.rejects\s*\(/gi,
];

export const SINON_SPY_PATTERNS = [
  /sinon\.spy\s*\(/gi,
  /\.spy\s*\(\s*\w+/gi,
  /\.calledWith\s*\(/gi,
  /\.calledOnce/gi,
];

export const MANUAL_MOCK_PATTERNS = [
  // JavaScript/TypeScript
  /__mocks__\//gi,
  /\.mock\.[jt]sx?$/gi,
  /createMock\s*\(/gi,
  /mockFactory\s*\(/gi,
  // Python
  /from\s+unittest\.mock\s+import/gi,
  /from\s+unittest\s+import\s+mock/gi,
  /@patch\s*\(/gi,
  /patch\s*\(/gi,
  /MagicMock\s*\(/gi,
  /Mock\s*\(/gi,
  /create_autospec\s*\(/gi,
];

export const MOCK_IMPLEMENTATION_PATTERNS = [
  /\.mockImplementation\s*\(/gi,
  /\.mockImplementationOnce\s*\(/gi,
  /\.callsFake\s*\(/gi,
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

export function detectJestMocks(content: string): MockPatternInfo[] {
  const results: MockPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of JEST_MOCK_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'jest-mock',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          library: 'jest',
        });
      }
    }
  }

  return results;
}

export function detectVitestMocks(content: string): MockPatternInfo[] {
  const results: MockPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of VITEST_MOCK_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'vitest-mock',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          library: 'vitest',
        });
      }
    }
  }

  return results;
}

export function detectSinonStubs(content: string): MockPatternInfo[] {
  const results: MockPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SINON_STUB_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'sinon-stub',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          library: 'sinon',
        });
      }
    }
  }

  return results;
}

export function detectSinonSpies(content: string): MockPatternInfo[] {
  const results: MockPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SINON_SPY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'sinon-spy',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          library: 'sinon',
        });
      }
    }
  }

  return results;
}

export function detectManualMocks(content: string, filePath: string): MockPatternInfo[] {
  const results: MockPatternInfo[] = [];

  // Check file path for manual mock patterns
  if (/__mocks__\//.test(filePath) || /\.mock\.[jt]sx?$/.test(filePath)) {
    results.push({
      type: 'manual-mock',
      line: 1,
      column: 1,
      match: filePath,
    });
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/createMock\s*\(|mockFactory\s*\(/.test(line)) {
      const match = line.match(/createMock\s*\(|mockFactory\s*\(/);
      if (match) {
        results.push({
          type: 'manual-mock',
          line: i + 1,
          column: (match.index || 0) + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function analyzeMockPatterns(content: string, filePath: string): MockAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      dominantLibrary: null,
      mockCount: 0,
      hasManualMocks: false,
    };
  }

  const patterns: MockPatternInfo[] = [
    ...detectJestMocks(content),
    ...detectVitestMocks(content),
    ...detectSinonStubs(content),
    ...detectSinonSpies(content),
    ...detectManualMocks(content, filePath),
  ];

  // Determine dominant library
  const libraryCounts = new Map<string, number>();
  for (const pattern of patterns) {
    if (pattern.library) {
      libraryCounts.set(pattern.library, (libraryCounts.get(pattern.library) || 0) + 1);
    }
  }

  let dominantLibrary: string | null = null;
  let maxCount = 0;
  for (const [lib, count] of libraryCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantLibrary = lib;
    }
  }

  const hasManualMocks = patterns.some((p) => p.type === 'manual-mock');

  return {
    patterns,
    dominantLibrary,
    mockCount: patterns.length,
    hasManualMocks,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class MockPatternsDetector extends RegexDetector {
  readonly id = 'testing/mock-patterns';
  readonly name = 'Mock Patterns Detector';
  readonly description = 'Detects test mocking patterns and libraries';
  readonly category: PatternCategory = 'testing';
  readonly subcategory = 'mock-patterns';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeMockPatterns(context.content, context.file);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = 0.9;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        dominantLibrary: analysis.dominantLibrary,
        mockCount: analysis.mockCount,
        hasManualMocks: analysis.hasManualMocks,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createMockPatternsDetector(): MockPatternsDetector {
  return new MockPatternsDetector();
}
