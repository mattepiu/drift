/**
 * Mock Patterns Detector - LEARNING VERSION
 *
 * Learns mock patterns from the user's codebase:
 * - Mock library preferences
 * - Mock naming conventions
 * - Mock placement patterns
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

export type MockLibrary = 'jest' | 'vitest' | 'sinon' | 'manual';

export interface MockPatternsConventions {
  [key: string]: unknown;
  library: MockLibrary;
  usesMockPrefix: boolean;
  usesSpyOn: boolean;
}

interface MockPatternInfo {
  library: MockLibrary;
  hasMockPrefix: boolean;
  isSpyOn: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractMockPatterns(content: string, file: string): MockPatternInfo[] {
  const results: MockPatternInfo[] = [];

  // Jest/Vitest mocks
  const jestMockPattern = /(?:jest|vi)\.(?:mock|fn|spyOn)\s*\(/g;
  let match;
  while ((match = jestMockPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    const library: MockLibrary = match[0].startsWith('vi.') ? 'vitest' : 'jest';
    const isSpyOn = match[0].includes('spyOn');

    results.push({
      library,
      hasMockPrefix: false,
      isSpyOn,
      line,
      column,
      file,
    });
  }

  // Sinon stubs/spies
  const sinonPattern = /sinon\.(?:stub|spy|mock)\s*\(/g;
  while ((match = sinonPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      library: 'sinon',
      hasMockPrefix: false,
      isSpyOn: match[0].includes('spy'),
      line,
      column,
      file,
    });
  }

  // Mock variable naming
  const mockVarPattern = /(?:const|let)\s+(mock\w+)\s*=/gi;
  while ((match = mockVarPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      library: 'manual',
      hasMockPrefix: true,
      isSpyOn: false,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Mock Patterns Detector
// ============================================================================

export class MockPatternsLearningDetector extends LearningDetector<MockPatternsConventions> {
  readonly id = 'testing/mock-patterns';
  readonly category = 'testing' as const;
  readonly subcategory = 'mock-patterns';
  readonly name = 'Mock Patterns Detector (Learning)';
  readonly description = 'Learns mock patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof MockPatternsConventions> {
    return ['library', 'usesMockPrefix', 'usesSpyOn'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof MockPatternsConventions, ValueDistribution>
  ): void {
    if (!context.isTestFile) {return;}

    const patterns = extractMockPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const libraryDist = distributions.get('library')!;
    const prefixDist = distributions.get('usesMockPrefix')!;
    const spyOnDist = distributions.get('usesSpyOn')!;

    for (const pattern of patterns) {
      libraryDist.add(pattern.library, context.file);
      prefixDist.add(pattern.hasMockPrefix, context.file);
      spyOnDist.add(pattern.isSpyOn, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<MockPatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (!context.isTestFile) {
      return this.createEmptyResult();
    }

    const mockPatterns = extractMockPatterns(context.content, context.file);
    if (mockPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedLibrary = conventions.conventions.library?.value;

    // Check library consistency
    if (learnedLibrary && learnedLibrary !== 'manual') {
      for (const pattern of mockPatterns) {
        if (pattern.library !== learnedLibrary && pattern.library !== 'manual') {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'mock library', pattern.library, learnedLibrary,
            `Using ${pattern.library} but project uses ${learnedLibrary}`
          ));
        }
      }
    }

    if (mockPatterns.length > 0) {
      const first = mockPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/mock`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createMockPatternsLearningDetector(): MockPatternsLearningDetector {
  return new MockPatternsLearningDetector();
}
