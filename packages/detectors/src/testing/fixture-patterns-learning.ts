/**
 * Fixture Patterns Detector - LEARNING VERSION
 *
 * Learns test fixture patterns from the user's codebase:
 * - Fixture organization
 * - Factory function patterns
 * - Test data patterns
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

export type FixtureStyle = 'factory' | 'builder' | 'static' | 'faker';

export interface FixturePatternsConventions {
  [key: string]: unknown;
  style: FixtureStyle;
  usesFactoryFunctions: boolean;
  usesFaker: boolean;
}

interface FixturePatternInfo {
  style: FixtureStyle;
  name: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractFixturePatterns(content: string, file: string): FixturePatternInfo[] {
  const results: FixturePatternInfo[] = [];

  // Factory functions
  const factoryPattern = /(?:create|make|build)\w+(?:Factory|Mock|Stub)?\s*[=:]/g;
  let match;
  while ((match = factoryPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'factory',
      name: match[0].replace(/\s*[=:]/, ''),
      line,
      column,
      file,
    });
  }

  // Builder pattern
  const builderPattern = /\.with\w+\s*\(|\.build\s*\(/g;
  while ((match = builderPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'builder',
      name: 'builder',
      line,
      column,
      file,
    });
  }

  // Faker usage
  const fakerPattern = /faker\.\w+/g;
  while ((match = fakerPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'faker',
      name: match[0],
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Fixture Patterns Detector
// ============================================================================

export class FixturePatternsLearningDetector extends LearningDetector<FixturePatternsConventions> {
  readonly id = 'testing/fixture-patterns';
  readonly category = 'testing' as const;
  readonly subcategory = 'fixture-patterns';
  readonly name = 'Fixture Patterns Detector (Learning)';
  readonly description = 'Learns test fixture patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof FixturePatternsConventions> {
    return ['style', 'usesFactoryFunctions', 'usesFaker'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof FixturePatternsConventions, ValueDistribution>
  ): void {
    if (!context.isTestFile) {return;}

    const patterns = extractFixturePatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('style')!;
    const factoryDist = distributions.get('usesFactoryFunctions')!;
    const fakerDist = distributions.get('usesFaker')!;

    let hasFactory = false;
    let hasFaker = false;

    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
      if (pattern.style === 'factory') {hasFactory = true;}
      if (pattern.style === 'faker') {hasFaker = true;}
    }

    factoryDist.add(hasFactory, context.file);
    fakerDist.add(hasFaker, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<FixturePatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (!context.isTestFile) {
      return this.createEmptyResult();
    }

    const fixturePatterns = extractFixturePatterns(context.content, context.file);
    if (fixturePatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.style?.value;

    // Check style consistency
    if (learnedStyle) {
      for (const pattern of fixturePatterns) {
        if (pattern.style !== learnedStyle && pattern.style !== 'faker') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'fixture style', pattern.style, learnedStyle,
            `Using ${pattern.style} pattern but project uses ${learnedStyle}`
          ));
        }
      }
    }

    if (fixturePatterns.length > 0) {
      const first = fixturePatterns[0]!;
      patterns.push({
        patternId: `${this.id}/fixture`,
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

export function createFixturePatternsLearningDetector(): FixturePatternsLearningDetector {
  return new FixturePatternsLearningDetector();
}
