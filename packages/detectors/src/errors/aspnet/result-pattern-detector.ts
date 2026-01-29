/**
 * Result Pattern Detector for C#
 *
 * Detects Result/Either pattern usage:
 * - Result<T> / Result<T, TError> types
 * - OneOf<T1, T2> discriminated unions
 * - Error handling without exceptions
 * - Railway-oriented programming patterns
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface ResultPatternInfo {
  /** Type of result pattern */
  type: 'result-type' | 'oneof' | 'error-or' | 'maybe' | 'option' | 'either';
  /** Name of the type/method */
  name: string;
  /** Success type */
  successType: string | null;
  /** Error type */
  errorType: string | null;
  /** Line number */
  line: number;
  /** File path */
  file: string;
}

export interface ResultPatternAnalysis {
  /** All result patterns found */
  patterns: ResultPatternInfo[];
  /** Result types used */
  resultTypes: string[];
  /** Libraries detected */
  libraries: string[];
  /** Whether using functional error handling */
  usesFunctionalErrors: boolean;
  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Detector Implementation
// ============================================================================

export class ResultPatternDetector extends BaseDetector {
  readonly id = 'errors/result-pattern';
  readonly category = 'errors' as const;
  readonly subcategory = 'functional';
  readonly name = 'Result Pattern Detector';
  readonly description = 'Detects Result/Either pattern usage for functional error handling';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (!this.isRelevantFile(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeResultPattern(content, file);
    const patterns: PatternMatch[] = [];

    for (const pattern of analysis.patterns) {
      patterns.push({
        patternId: `${this.id}/${pattern.type}`,
        location: {
          file: pattern.file,
          line: pattern.line,
          column: 1,
        },
        confidence: analysis.confidence,
        isOutlier: false,
      });
    }

    return this.createResult(patterns, [], analysis.confidence, {
      custom: {
        resultPatternAnalysis: analysis,
      },
    });
  }

  private isRelevantFile(content: string): boolean {
    return (
      content.includes('Result<') ||
      content.includes('OneOf<') ||
      content.includes('ErrorOr<') ||
      content.includes('Either<') ||
      content.includes('Maybe<') ||
      content.includes('Option<') ||
      content.includes('FluentResults') ||
      content.includes('LanguageExt')
    );
  }

  analyzeResultPattern(content: string, file: string): ResultPatternAnalysis {
    const patterns: ResultPatternInfo[] = [];
    const resultTypes = new Set<string>();
    const libraries = new Set<string>();
    let usesFunctionalErrors = false;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // Detect Result<T> or Result<T, TError>
      const resultMatch = line.match(/Result<(\w+)(?:,\s*(\w+))?>/);
      if (resultMatch) {
        usesFunctionalErrors = true;
        resultTypes.add('Result');
        patterns.push({
          type: 'result-type',
          name: 'Result',
          successType: resultMatch[1] || null,
          errorType: resultMatch[2] || null,
          line: lineNum,
          file,
        });
      }

      // Detect OneOf<T1, T2, ...>
      const oneOfMatch = line.match(/OneOf<([^>]+)>/);
      if (oneOfMatch) {
        usesFunctionalErrors = true;
        resultTypes.add('OneOf');
        libraries.add('OneOf');
        patterns.push({
          type: 'oneof',
          name: 'OneOf',
          successType: oneOfMatch[1] || null,
          errorType: null,
          line: lineNum,
          file,
        });
      }

      // Detect ErrorOr<T>
      const errorOrMatch = line.match(/ErrorOr<(\w+)>/);
      if (errorOrMatch) {
        usesFunctionalErrors = true;
        resultTypes.add('ErrorOr');
        libraries.add('ErrorOr');
        patterns.push({
          type: 'error-or',
          name: 'ErrorOr',
          successType: errorOrMatch[1] || null,
          errorType: 'Error',
          line: lineNum,
          file,
        });
      }

      // Detect Either<TLeft, TRight>
      const eitherMatch = line.match(/Either<(\w+),\s*(\w+)>/);
      if (eitherMatch) {
        usesFunctionalErrors = true;
        resultTypes.add('Either');
        libraries.add('LanguageExt');
        patterns.push({
          type: 'either',
          name: 'Either',
          successType: eitherMatch[2] || null,
          errorType: eitherMatch[1] || null,
          line: lineNum,
          file,
        });
      }

      // Detect Maybe<T> / Option<T>
      const maybeMatch = line.match(/(Maybe|Option)<(\w+)>/);
      if (maybeMatch) {
        usesFunctionalErrors = true;
        resultTypes.add(maybeMatch[1] || 'Maybe');
        patterns.push({
          type: maybeMatch[1]?.toLowerCase() === 'option' ? 'option' : 'maybe',
          name: maybeMatch[1] || 'Maybe',
          successType: maybeMatch[2] || null,
          errorType: null,
          line: lineNum,
          file,
        });
      }

      // Detect library imports
      if (line.includes('using FluentResults')) {
        libraries.add('FluentResults');
      }
      if (line.includes('using LanguageExt')) {
        libraries.add('LanguageExt');
      }
      if (line.includes('using OneOf')) {
        libraries.add('OneOf');
      }
      if (line.includes('using ErrorOr')) {
        libraries.add('ErrorOr');
      }
    }

    return {
      patterns,
      resultTypes: Array.from(resultTypes),
      libraries: Array.from(libraries),
      usesFunctionalErrors,
      confidence: patterns.length > 0 ? 0.9 : 0,
    };
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createResultPatternDetector(): ResultPatternDetector {
  return new ResultPatternDetector();
}
