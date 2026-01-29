/**
 * Spring Error Handling Patterns Detector - LEARNING VERSION
 *
 * Learns error handling patterns from the user's codebase:
 * - Exception handler organization (@ControllerAdvice vs inline @ExceptionHandler)
 * - Response format patterns (ResponseEntity, ProblemDetail, custom)
 * - HTTP status code usage patterns
 * - Exception hierarchy patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import { SPRING_KEYWORD_GROUPS } from './keywords.js';
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

export type ErrorHandlerStyle = 'controller-advice' | 'inline' | 'mixed';
export type ErrorResponseStyle = 'response-entity' | 'problem-detail' | 'custom' | 'direct';

export interface SpringErrorsConventions {
  [key: string]: unknown;
  /** How exception handlers are organized */
  handlerStyle: ErrorHandlerStyle;
  /** Response format for errors */
  responseStyle: ErrorResponseStyle;
  /** Whether RestControllerAdvice is preferred over ControllerAdvice */
  usesRestControllerAdvice: boolean;
  /** Whether custom exception classes are used */
  usesCustomExceptions: boolean;
}

interface ErrorPatternInfo {
  /** The error handling keyword found */
  keyword: string;
  /** Type of error pattern */
  patternType: 'handler' | 'advice' | 'response' | 'exception';
  /** Specific value for categorization */
  value: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractErrorPatterns(content: string, file: string): ErrorPatternInfo[] {
  const results: ErrorPatternInfo[] = [];
  const keywords = SPRING_KEYWORD_GROUPS.errors.keywords;

  for (const keyword of keywords) {
    // Match annotation usage (with @) or class references
    const pattern = new RegExp(`@${keyword}\\b|\\b${keyword}\\b`, 'g');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip imports
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.slice(lineStart, content.indexOf('\n', match.index));
      if (lineContent.trim().startsWith('import ')) {continue;}

      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      // Categorize the pattern
      let patternType: ErrorPatternInfo['patternType'] = 'exception';
      const value = keyword;

      if (keyword === 'ExceptionHandler') {
        patternType = 'handler';
      } else if (keyword === 'ControllerAdvice' || keyword === 'RestControllerAdvice' || 
                 keyword === 'ResponseEntityExceptionHandler') {
        patternType = 'advice';
      } else if (keyword === 'ResponseStatus' || keyword === 'HttpStatus' || 
                 keyword === 'ProblemDetail' || keyword === 'ErrorResponse') {
        patternType = 'response';
      }

      results.push({
        keyword,
        patternType,
        value,
        line,
        column,
        file,
      });
    }
  }

  // Check for custom exception classes
  const customExceptionPattern = /class\s+(\w+Exception)\s+extends\s+(?:Runtime)?Exception/g;
  let match;
  while ((match = customExceptionPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      keyword: match[1]!,
      patternType: 'exception',
      value: 'custom',
      line,
      column,
      file,
    });
  }

  return results;
}

function hasControllerAdvice(content: string): boolean {
  return /@ControllerAdvice\b|@RestControllerAdvice\b/.test(content);
}

// ============================================================================
// Learning Detector
// ============================================================================

export class SpringErrorsLearningDetector extends LearningDetector<SpringErrorsConventions> {
  readonly id = 'spring/errors-patterns-learning';
  readonly category = 'errors' as const;
  readonly subcategory = 'spring-errors';
  readonly name = 'Spring Error Handling Patterns Detector (Learning)';
  readonly description = 'Learns error handling patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringErrorsConventions> {
    return ['handlerStyle', 'responseStyle', 'usesRestControllerAdvice', 'usesCustomExceptions'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringErrorsConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractErrorPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const handlerStyleDist = distributions.get('handlerStyle')!;
    const responseStyleDist = distributions.get('responseStyle')!;
    const restAdviceDist = distributions.get('usesRestControllerAdvice')!;
    const customExceptionDist = distributions.get('usesCustomExceptions')!;

    const isAdviceFile = hasControllerAdvice(context.content);

    for (const pattern of patterns) {
      if (pattern.patternType === 'handler') {
        // Determine if handler is in advice class or inline
        if (isAdviceFile) {
          handlerStyleDist.add('controller-advice' as ErrorHandlerStyle, context.file);
        } else {
          handlerStyleDist.add('inline' as ErrorHandlerStyle, context.file);
        }
      } else if (pattern.patternType === 'advice') {
        if (pattern.keyword === 'RestControllerAdvice') {
          restAdviceDist.add(true, context.file);
        } else if (pattern.keyword === 'ControllerAdvice') {
          restAdviceDist.add(false, context.file);
        }
      } else if (pattern.patternType === 'response') {
        if (pattern.keyword === 'ProblemDetail') {
          responseStyleDist.add('problem-detail' as ErrorResponseStyle, context.file);
        } else if (pattern.keyword === 'ResponseStatus') {
          responseStyleDist.add('direct' as ErrorResponseStyle, context.file);
        }
      } else if (pattern.patternType === 'exception' && pattern.value === 'custom') {
        customExceptionDist.add(true, context.file);
      }
    }

    // Check for ResponseEntity usage in error handling
    if (/ResponseEntity\s*</.test(context.content) && patterns.some(p => p.patternType === 'handler')) {
      responseStyleDist.add('response-entity' as ErrorResponseStyle, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringErrorsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractErrorPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedHandlerStyle = conventions.conventions.handlerStyle?.value;
    const learnedUsesRestAdvice = conventions.conventions.usesRestControllerAdvice?.value;

    // Check for handler style consistency
    if (learnedHandlerStyle === 'controller-advice') {
      const isAdviceFile = hasControllerAdvice(context.content);
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'handler' && !isAdviceFile) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'exception handler location', 'inline', 'controller-advice',
            'Project uses @ControllerAdvice for exception handlers, but this handler is inline'
          ));
        }
      }
    }

    // Check for RestControllerAdvice vs ControllerAdvice consistency
    if (learnedUsesRestAdvice !== undefined) {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'advice') {
          const isRest = pattern.keyword === 'RestControllerAdvice';
          if (isRest !== learnedUsesRestAdvice) {
            const expected = learnedUsesRestAdvice ? 'RestControllerAdvice' : 'ControllerAdvice';
            violations.push(this.createConventionViolation(
              context.file, pattern.line, pattern.column,
              'advice annotation', pattern.keyword, expected,
              `Using @${pattern.keyword} but project prefers @${expected}`
            ));
          }
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/error-handling`,
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

export function createSpringErrorsLearningDetector(): SpringErrorsLearningDetector {
  return new SpringErrorsLearningDetector();
}
