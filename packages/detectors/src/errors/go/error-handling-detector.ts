/**
 * Go Error Handling Detector
 *
 * Detects Go error handling patterns:
 * - Standard error checks (if err != nil)
 * - Error wrapping (fmt.Errorf with %w)
 * - Custom error types
 * - Sentinel errors
 * - Error propagation patterns
 *
 * @requirements Go Language Support - Phase 8
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface GoErrorCheckInfo {
  errorVariable: string;
  hasReturn: boolean;
  hasWrap: boolean;
  hasLog: boolean;
  pattern: 'propagated' | 'wrapped' | 'logged' | 'handled' | 'ignored';
  line: number;
  column: number;
}

export interface GoCustomErrorInfo {
  name: string;
  type: 'struct' | 'sentinel';
  line: number;
  column: number;
}


// ============================================================================
// Go Error Handling Detector Class
// ============================================================================

export class GoErrorHandlingDetector extends RegexDetector {
  readonly id = 'errors/go/error-handling';
  readonly category = 'errors' as const;
  readonly subcategory = 'error-handling';
  readonly name = 'Go Error Handling Detector';
  readonly description = 'Detects Go error handling patterns and potential issues';
  readonly supportedLanguages: Language[] = ['go'];

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (!context.file.endsWith('.go')) {
      return this.createResult(patterns, violations, 1.0);
    }

    const errorChecks = this.detectErrorChecks(context.content);
    for (const check of errorChecks) {
      patterns.push({
        patternId: `${this.id}/${check.pattern}`,
        location: { file: context.file, line: check.line, column: check.column },
        confidence: 0.9,
        isOutlier: check.pattern === 'ignored',
      });

      if (check.pattern === 'ignored') {
        violations.push(this.createIgnoredErrorViolation(context.file, check));
      }
    }

    const wrappingPatterns = this.detectErrorWrapping(context.content, context.file);
    patterns.push(...wrappingPatterns);

    const customErrors = this.detectCustomErrors(context.content);
    for (const err of customErrors) {
      patterns.push({
        patternId: `${this.id}/custom-${err.type}`,
        location: { file: context.file, line: err.line, column: err.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    const sentinelErrors = this.detectSentinelErrors(context.content, context.file);
    patterns.push(...sentinelErrors);

    return this.createResult(patterns, violations, this.calculateConfidence(patterns));
  }


  private detectErrorChecks(content: string): GoErrorCheckInfo[] {
    const checks: GoErrorCheckInfo[] = [];

    const errorCheckPattern = /if\s+(\w+)\s*!=\s*nil\s*\{/g;
    const matches = this.matchLines(content, errorCheckPattern);

    for (const match of matches) {
      const errVar = match.captures[1] ?? 'err';
      const afterCheck = content.slice(match.index, match.index + 300);

      const hasReturn = /return.*\berr\b/.test(afterCheck.slice(0, 200));
      const hasWrap = /fmt\.Errorf|errors\.Wrap|errors\.WithStack|errors\.WithMessage/.test(afterCheck.slice(0, 200));
      const hasLog = /log\.|logger\.|slog\./.test(afterCheck.slice(0, 200));
      const hasIgnore = /^\s*\}\s*$/m.test(afterCheck.slice(0, 50));

      let pattern: GoErrorCheckInfo['pattern'];
      if (hasIgnore && !hasReturn && !hasLog) {
        pattern = 'ignored';
      } else if (hasWrap) {
        pattern = 'wrapped';
      } else if (hasReturn) {
        pattern = 'propagated';
      } else if (hasLog) {
        pattern = 'logged';
      } else {
        pattern = 'handled';
      }

      checks.push({
        errorVariable: errVar,
        hasReturn,
        hasWrap,
        hasLog,
        pattern,
        line: match.line,
        column: match.column,
      });
    }

    return checks;
  }

  private detectErrorWrapping(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    const errorfPattern = /fmt\.Errorf\s*\([^)]*%w/g;
    const errorfMatches = this.matchLines(content, errorfPattern);
    for (const match of errorfMatches) {
      patterns.push({
        patternId: `${this.id}/wrap-errorf`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    const wrapPattern = /errors\.Wrap\s*\(/g;
    const wrapMatches = this.matchLines(content, wrapPattern);
    for (const match of wrapMatches) {
      patterns.push({
        patternId: `${this.id}/wrap-pkg`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    const withStackPattern = /errors\.WithStack\s*\(/g;
    const withStackMatches = this.matchLines(content, withStackPattern);
    for (const match of withStackMatches) {
      patterns.push({
        patternId: `${this.id}/wrap-stack`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    return patterns;
  }


  private detectCustomErrors(content: string): GoCustomErrorInfo[] {
    const errors: GoCustomErrorInfo[] = [];

    const customErrorPattern = /type\s+(\w+Error)\s+struct/g;
    const matches = this.matchLines(content, customErrorPattern);
    for (const match of matches) {
      errors.push({
        name: match.captures[1] ?? '',
        type: 'struct',
        line: match.line,
        column: match.column,
      });
    }

    return errors;
  }

  private detectSentinelErrors(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    const sentinelPattern = /var\s+(Err\w+)\s*=\s*errors\.New\s*\(\s*"([^"]+)"/g;
    const matches = this.matchLines(content, sentinelPattern);
    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/sentinel`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    const sentinelFmtPattern = /var\s+(Err\w+)\s*=\s*fmt\.Errorf\s*\(\s*"([^"]+)"/g;
    const fmtMatches = this.matchLines(content, sentinelFmtPattern);
    for (const match of fmtMatches) {
      patterns.push({
        patternId: `${this.id}/sentinel`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    return patterns;
  }

  private createIgnoredErrorViolation(file: string, check: GoErrorCheckInfo): Violation {
    return {
      id: `${this.id}-${file}-${check.line}`,
      patternId: this.id,
      severity: 'warning',
      file,
      range: {
        start: { line: check.line - 1, character: check.column - 1 },
        end: { line: check.line - 1, character: check.column + 20 },
      },
      message: `Error '${check.errorVariable}' is checked but not handled`,
      explanation: 'Go errors should be explicitly handled, logged, or propagated. Silently ignoring errors can hide bugs.',
      expected: 'Handle, log, or return the error',
      actual: 'Error is checked but not used',
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  private calculateConfidence(patterns: PatternMatch[]): number {
    if (patterns.length === 0) {return 1.0;}
    return patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
  }
}

export function createGoErrorHandlingDetector(): GoErrorHandlingDetector {
  return new GoErrorHandlingDetector();
}
