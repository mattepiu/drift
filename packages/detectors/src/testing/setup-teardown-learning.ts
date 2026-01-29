/**
 * Setup/Teardown Detector - LEARNING VERSION
 *
 * Learns test setup/teardown patterns from the user's codebase:
 * - beforeEach vs beforeAll preferences
 * - Cleanup patterns
 * - Test isolation patterns
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

export type SetupStyle = 'beforeEach' | 'beforeAll' | 'mixed';

export interface SetupTeardownConventions {
  [key: string]: unknown;
  setupStyle: SetupStyle;
  usesAfterEach: boolean;
  usesAfterAll: boolean;
}

interface SetupPatternInfo {
  type: 'beforeEach' | 'beforeAll' | 'afterEach' | 'afterAll';
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractSetupPatterns(content: string, file: string): SetupPatternInfo[] {
  const results: SetupPatternInfo[] = [];

  const patterns: Array<{ regex: RegExp; type: SetupPatternInfo['type'] }> = [
    { regex: /beforeEach\s*\(/g, type: 'beforeEach' },
    { regex: /beforeAll\s*\(/g, type: 'beforeAll' },
    { regex: /afterEach\s*\(/g, type: 'afterEach' },
    { regex: /afterAll\s*\(/g, type: 'afterAll' },
  ];

  for (const { regex, type } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Setup/Teardown Detector
// ============================================================================

export class SetupTeardownLearningDetector extends LearningDetector<SetupTeardownConventions> {
  readonly id = 'testing/setup-teardown';
  readonly category = 'testing' as const;
  readonly subcategory = 'setup-teardown';
  readonly name = 'Setup/Teardown Detector (Learning)';
  readonly description = 'Learns test setup/teardown patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof SetupTeardownConventions> {
    return ['setupStyle', 'usesAfterEach', 'usesAfterAll'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SetupTeardownConventions, ValueDistribution>
  ): void {
    if (!context.isTestFile) {return;}

    const patterns = extractSetupPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('setupStyle')!;
    const afterEachDist = distributions.get('usesAfterEach')!;
    const afterAllDist = distributions.get('usesAfterAll')!;

    let hasBeforeEach = false;
    let hasBeforeAll = false;
    let hasAfterEach = false;
    let hasAfterAll = false;

    for (const pattern of patterns) {
      if (pattern.type === 'beforeEach') {hasBeforeEach = true;}
      if (pattern.type === 'beforeAll') {hasBeforeAll = true;}
      if (pattern.type === 'afterEach') {hasAfterEach = true;}
      if (pattern.type === 'afterAll') {hasAfterAll = true;}
    }

    if (hasBeforeEach && hasBeforeAll) {
      styleDist.add('mixed', context.file);
    } else if (hasBeforeEach) {
      styleDist.add('beforeEach', context.file);
    } else if (hasBeforeAll) {
      styleDist.add('beforeAll', context.file);
    }

    afterEachDist.add(hasAfterEach, context.file);
    afterAllDist.add(hasAfterAll, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SetupTeardownConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (!context.isTestFile) {
      return this.createEmptyResult();
    }

    const setupPatterns = extractSetupPatterns(context.content, context.file);
    if (setupPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.setupStyle?.value;

    if (learnedStyle && learnedStyle !== 'mixed') {
      for (const pattern of setupPatterns) {
        if ((pattern.type === 'beforeEach' && learnedStyle === 'beforeAll') ||
            (pattern.type === 'beforeAll' && learnedStyle === 'beforeEach')) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'setup style', pattern.type, learnedStyle,
            `Using ${pattern.type} but project uses ${learnedStyle}`
          ));
        }
      }
    }

    if (setupPatterns.length > 0) {
      const first = setupPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/setup`,
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

export function createSetupTeardownLearningDetector(): SetupTeardownLearningDetector {
  return new SetupTeardownLearningDetector();
}
