/**
 * JSDoc Patterns Detector - LEARNING VERSION
 *
 * Learns JSDoc patterns from the user's codebase:
 * - JSDoc style preferences
 * - Required tags
 * - Documentation coverage
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

export type JSDocStyle = 'full' | 'minimal' | 'tsdoc';

export interface JSDocConventions {
  [key: string]: unknown;
  style: JSDocStyle;
  usesParamTags: boolean;
  usesReturnTags: boolean;
  usesExampleTags: boolean;
}

interface JSDocPatternInfo {
  style: JSDocStyle;
  hasParams: boolean;
  hasReturn: boolean;
  hasExample: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractJSDocPatterns(content: string, file: string): JSDocPatternInfo[] {
  const results: JSDocPatternInfo[] = [];

  // JSDoc comments
  const jsdocPattern = /\/\*\*[\s\S]*?\*\//g;
  let match;
  while ((match = jsdocPattern.exec(content)) !== null) {
    const comment = match[0];
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    const hasParams = /@param\b/.test(comment);
    const hasReturn = /@returns?\b/.test(comment);
    const hasExample = /@example\b/.test(comment);

    // Determine style
    let style: JSDocStyle = 'minimal';
    if (hasParams && hasReturn) {style = 'full';}
    if (/@remarks\b|@see\b|@link\b/.test(comment)) {style = 'tsdoc';}

    results.push({
      style,
      hasParams,
      hasReturn,
      hasExample,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning JSDoc Patterns Detector
// ============================================================================

export class JSDocPatternsLearningDetector extends LearningDetector<JSDocConventions> {
  readonly id = 'documentation/jsdoc-patterns';
  readonly category = 'documentation' as const;
  readonly subcategory = 'jsdoc-patterns';
  readonly name = 'JSDoc Patterns Detector (Learning)';
  readonly description = 'Learns JSDoc patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof JSDocConventions> {
    return ['style', 'usesParamTags', 'usesReturnTags', 'usesExampleTags'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof JSDocConventions, ValueDistribution>
  ): void {
    const patterns = extractJSDocPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('style')!;
    const paramsDist = distributions.get('usesParamTags')!;
    const returnDist = distributions.get('usesReturnTags')!;
    const exampleDist = distributions.get('usesExampleTags')!;

    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
      paramsDist.add(pattern.hasParams, context.file);
      returnDist.add(pattern.hasReturn, context.file);
      exampleDist.add(pattern.hasExample, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<JSDocConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const jsdocPatterns = extractJSDocPatterns(context.content, context.file);
    if (jsdocPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedUsesParams = conventions.conventions.usesParamTags?.value;
    const learnedUsesReturn = conventions.conventions.usesReturnTags?.value;

    // Check param tag consistency
    if (learnedUsesParams === true) {
      for (const pattern of jsdocPatterns) {
        // Only flag if the JSDoc is for a function (has some content)
        if (!pattern.hasParams && pattern.style !== 'minimal') {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'JSDoc params', 'missing @param', 'with @param tags',
            `JSDoc should include @param tags (project convention)`
          ));
        }
      }
    }

    // Check return tag consistency
    if (learnedUsesReturn === true) {
      for (const pattern of jsdocPatterns) {
        if (!pattern.hasReturn && pattern.style !== 'minimal') {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'JSDoc return', 'missing @returns', 'with @returns tag',
            `JSDoc should include @returns tag (project convention)`
          ));
        }
      }
    }

    if (jsdocPatterns.length > 0) {
      const first = jsdocPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/jsdoc`,
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

export function createJSDocPatternsLearningDetector(): JSDocPatternsLearningDetector {
  return new JSDocPatternsLearningDetector();
}
