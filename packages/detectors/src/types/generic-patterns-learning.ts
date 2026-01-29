/**
 * Generic Patterns Detector - LEARNING VERSION
 *
 * Learns TypeScript generic patterns from the user's codebase:
 * - Generic naming conventions
 * - Constraint patterns
 * - Default type patterns
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

export type GenericNamingStyle = 'single-letter' | 'descriptive' | 'prefixed-T';

export interface GenericPatternsConventions {
  [key: string]: unknown;
  namingStyle: GenericNamingStyle;
  usesConstraints: boolean;
  usesDefaults: boolean;
}

interface GenericPatternInfo {
  name: string;
  style: GenericNamingStyle;
  hasConstraint: boolean;
  hasDefault: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectNamingStyle(name: string): GenericNamingStyle {
  if (name.length === 1) {return 'single-letter';}
  if (name.startsWith('T') && name.length > 1 && /^T[A-Z]/.test(name)) {return 'prefixed-T';}
  return 'descriptive';
}

function extractGenericPatterns(content: string, file: string): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];

  // Generic type parameters
  const genericPattern = /<([A-Z]\w*)(?:\s+extends\s+[^,>]+)?(?:\s*=\s*[^,>]+)?[,>]/g;
  let match;
  while ((match = genericPattern.exec(content)) !== null) {
    const name = match[1] || '';
    const fullMatch = match[0];
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      name,
      style: detectNamingStyle(name),
      hasConstraint: /extends\s+/.test(fullMatch),
      hasDefault: /=\s+/.test(fullMatch),
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Generic Patterns Detector
// ============================================================================

export class GenericPatternsLearningDetector extends LearningDetector<GenericPatternsConventions> {
  readonly id = 'types/generic-patterns';
  readonly category = 'types' as const;
  readonly subcategory = 'generic-patterns';
  readonly name = 'Generic Patterns Detector (Learning)';
  readonly description = 'Learns TypeScript generic patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript'];

  protected getConventionKeys(): Array<keyof GenericPatternsConventions> {
    return ['namingStyle', 'usesConstraints', 'usesDefaults'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof GenericPatternsConventions, ValueDistribution>
  ): void {
    const patterns = extractGenericPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const namingDist = distributions.get('namingStyle')!;
    const constraintDist = distributions.get('usesConstraints')!;
    const defaultDist = distributions.get('usesDefaults')!;

    for (const pattern of patterns) {
      namingDist.add(pattern.style, context.file);
      constraintDist.add(pattern.hasConstraint, context.file);
      defaultDist.add(pattern.hasDefault, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<GenericPatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const genericPatterns = extractGenericPatterns(context.content, context.file);
    if (genericPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedNaming = conventions.conventions.namingStyle?.value;

    // Check naming style consistency
    if (learnedNaming) {
      for (const pattern of genericPatterns) {
        if (pattern.style !== learnedNaming) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'generic naming', pattern.style, learnedNaming,
            `Generic '${pattern.name}' uses ${pattern.style} but project uses ${learnedNaming}`
          ));
        }
      }
    }

    if (genericPatterns.length > 0) {
      const first = genericPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/generic`,
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

export function createGenericPatternsLearningDetector(): GenericPatternsLearningDetector {
  return new GenericPatternsLearningDetector();
}
