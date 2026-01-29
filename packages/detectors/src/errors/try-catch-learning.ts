/**
 * Try-Catch Placement Detector - LEARNING VERSION
 *
 * Learns try-catch patterns from the user's codebase:
 * - Try-catch placement conventions
 * - Error handling granularity
 * - Catch block patterns
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
 * Catch block handling style
 */
export type CatchHandlingStyle = 'rethrow' | 'wrap-and-throw' | 'log-and-swallow' | 'log-and-rethrow' | 'handle';

/**
 * Conventions this detector learns
 */
export interface TryCatchConventions {
  [key: string]: unknown;
  /** Primary catch handling style */
  catchStyle: CatchHandlingStyle;
  /** Whether finally blocks are used */
  usesFinally: boolean;
  /** Whether typed catch is used (TypeScript) */
  usesTypedCatch: boolean;
  /** Error variable naming */
  errorVarName: string;
}

/**
 * Try-catch pattern info extracted from code
 */
interface TryCatchPatternInfo {
  catchStyle: CatchHandlingStyle;
  hasFinally: boolean;
  errorVarName: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect catch handling style from catch block content
 */
function detectCatchStyle(catchContent: string): CatchHandlingStyle {
  const hasThrow = /\bthrow\b/.test(catchContent);
  const hasLog = /\b(?:console|logger|log)\.\w+/.test(catchContent);
  const hasNewError = /new\s+\w*Error/.test(catchContent);

  if (hasThrow && hasNewError) {return 'wrap-and-throw';}
  if (hasThrow && hasLog) {return 'log-and-rethrow';}
  if (hasThrow) {return 'rethrow';}
  if (hasLog && !hasThrow) {return 'log-and-swallow';}
  return 'handle';
}

/**
 * Extract try-catch patterns from content
 */
function extractTryCatchPatterns(content: string, file: string): TryCatchPatternInfo[] {
  const results: TryCatchPatternInfo[] = [];

  // JavaScript/TypeScript try-catch
  const tryCatchPattern = /try\s*\{[^}]*\}\s*catch\s*\(\s*(\w+)\s*\)\s*\{([^}]*)\}(?:\s*finally\s*\{[^}]*\})?/gi;
  let match;
  while ((match = tryCatchPattern.exec(content)) !== null) {
    const errorVarName = match[1] || 'error';
    const catchContent = match[2] || '';
    const hasFinally = /finally\s*\{/.test(match[0]);

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      catchStyle: detectCatchStyle(catchContent),
      hasFinally,
      errorVarName,
      line,
      column,
      file,
    });
  }

  // Python try-except
  const pyTryPattern = /try\s*:\s*\n[^]*?except\s+(?:\w+\s+as\s+)?(\w+)\s*:/gi;
  while ((match = pyTryPattern.exec(content)) !== null) {
    const errorVarName = match[1] || 'e';

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    // Get content after except to determine style
    const afterExcept = content.slice(match.index + match[0].length, match.index + match[0].length + 200);
    const catchStyle = detectCatchStyle(afterExcept);

    results.push({
      catchStyle,
      hasFinally: /finally\s*:/.test(content.slice(match.index)),
      errorVarName,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Try-Catch Detector
// ============================================================================

export class TryCatchLearningDetector extends LearningDetector<TryCatchConventions> {
  readonly id = 'errors/try-catch-placement';
  readonly category = 'errors' as const;
  readonly subcategory = 'try-catch-placement';
  readonly name = 'Try-Catch Placement Detector (Learning)';
  readonly description = 'Learns try-catch patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof TryCatchConventions> {
    return ['catchStyle', 'usesFinally', 'usesTypedCatch', 'errorVarName'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TryCatchConventions, ValueDistribution>
  ): void {
    const patterns = extractTryCatchPatterns(context.content, context.file);

    if (patterns.length === 0) {return;}

    const catchStyleDist = distributions.get('catchStyle')!;
    const finallyDist = distributions.get('usesFinally')!;
    const errorVarDist = distributions.get('errorVarName')!;

    for (const pattern of patterns) {
      catchStyleDist.add(pattern.catchStyle, context.file);
      finallyDist.add(pattern.hasFinally, context.file);
      errorVarDist.add(pattern.errorVarName, context.file);
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TryCatchConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const tryCatchPatterns = extractTryCatchPatterns(context.content, context.file);

    if (tryCatchPatterns.length === 0) {
      return this.createEmptyResult();
    }

    // Get learned conventions
    const learnedCatchStyle = conventions.conventions.catchStyle?.value;
    const learnedErrorVarName = conventions.conventions.errorVarName?.value;

    // Check catch style consistency
    if (learnedCatchStyle) {
      for (const pattern of tryCatchPatterns) {
        if (pattern.catchStyle !== learnedCatchStyle) {
          // Only flag significant deviations
          if (pattern.catchStyle === 'log-and-swallow' && learnedCatchStyle !== 'log-and-swallow') {
            violations.push(this.createConventionViolation(
              pattern.file,
              pattern.line,
              pattern.column,
              'catch handling',
              pattern.catchStyle,
              learnedCatchStyle,
              `Catch block swallows error but project typically uses ${learnedCatchStyle}`
            ));
          }
        }
      }
    }

    // Check error variable naming
    if (learnedErrorVarName) {
      for (const pattern of tryCatchPatterns) {
        if (pattern.errorVarName !== learnedErrorVarName) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'error variable name',
            pattern.errorVarName,
            learnedErrorVarName,
            `Error variable '${pattern.errorVarName}' should be '${learnedErrorVarName}'`
          ));
        }
      }
    }

    // Create pattern matches
    if (tryCatchPatterns.length > 0) {
      const firstPattern = tryCatchPatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/try-catch`,
          location: {
            file: context.file,
            line: firstPattern.line,
            column: firstPattern.column,
          },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  // ============================================================================
  // Quick Fix
  // ============================================================================

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTryCatchLearningDetector(): TryCatchLearningDetector {
  return new TryCatchLearningDetector();
}
