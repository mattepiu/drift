/**
 * Async Errors Detector - LEARNING VERSION
 *
 * Learns async error handling patterns from the user's codebase:
 * - Try/catch vs .catch() patterns
 * - Error boundary usage
 * - Promise rejection handling
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

export type AsyncErrorStyle = 'try-catch' | 'catch-method' | 'error-boundary' | 'mixed';

export interface AsyncErrorsConventions {
  [key: string]: unknown;
  style: AsyncErrorStyle;
  usesErrorBoundaries: boolean;
  usesUnhandledRejection: boolean;
}

interface AsyncErrorPatternInfo {
  style: AsyncErrorStyle;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractAsyncErrorPatterns(content: string, file: string): AsyncErrorPatternInfo[] {
  const results: AsyncErrorPatternInfo[] = [];

  // try/catch with await
  const tryCatchPattern = /try\s*\{[\s\S]*?await[\s\S]*?\}\s*catch/g;
  let match;
  while ((match = tryCatchPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'try-catch',
      line,
      column,
      file,
    });
  }

  // .catch() method
  const catchMethodPattern = /\.catch\s*\(\s*(?:async\s*)?\(?(?:\w+)?\)?\s*=>/g;
  while ((match = catchMethodPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'catch-method',
      line,
      column,
      file,
    });
  }

  // Error boundaries
  const errorBoundaryPattern = /ErrorBoundary|componentDidCatch|getDerivedStateFromError/g;
  while ((match = errorBoundaryPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'error-boundary',
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Async Errors Detector
// ============================================================================

export class AsyncErrorsLearningDetector extends LearningDetector<AsyncErrorsConventions> {
  readonly id = 'errors/async-errors';
  readonly category = 'errors' as const;
  readonly subcategory = 'async-errors';
  readonly name = 'Async Errors Detector (Learning)';
  readonly description = 'Learns async error handling patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof AsyncErrorsConventions> {
    return ['style', 'usesErrorBoundaries', 'usesUnhandledRejection'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof AsyncErrorsConventions, ValueDistribution>
  ): void {
    const patterns = extractAsyncErrorPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('style')!;
    const boundaryDist = distributions.get('usesErrorBoundaries')!;

    let hasBoundary = false;

    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
      if (pattern.style === 'error-boundary') {hasBoundary = true;}
    }

    boundaryDist.add(hasBoundary, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<AsyncErrorsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const errorPatterns = extractAsyncErrorPatterns(context.content, context.file);
    if (errorPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.style?.value;

    if (learnedStyle && learnedStyle !== 'mixed' && learnedStyle !== 'error-boundary') {
      for (const pattern of errorPatterns) {
        if (pattern.style !== learnedStyle && pattern.style !== 'error-boundary') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'async error handling', pattern.style, learnedStyle,
            `Using ${pattern.style} but project uses ${learnedStyle}`
          ));
        }
      }
    }

    if (errorPatterns.length > 0) {
      const first = errorPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/async-error`,
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

export function createAsyncErrorsLearningDetector(): AsyncErrorsLearningDetector {
  return new AsyncErrorsLearningDetector();
}
