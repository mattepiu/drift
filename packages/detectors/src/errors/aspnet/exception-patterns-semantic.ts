/**
 * ASP.NET Core Exception Patterns Detector - SEMANTIC VERSION
 *
 * Truly semantic detector that learns exception handling patterns from C# codebases:
 * - Custom exception classes
 * - Global exception handling (IExceptionHandler, middleware)
 * - ProblemDetails responses
 * - Exception filters
 * - Try-catch patterns
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (exceptions/, middleware/, etc.)
 * - Surrounding code context (exception handling imports)
 * - Semantic disambiguation (Exception class vs exception variable)
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

// ============================================================================
// Context Validation Patterns
// ============================================================================

/** File paths that indicate exception-related code */
const EXCEPTION_FILE_PATTERNS = [
  /exception/i, /error/i, /middleware/i, /handler/i, /filter/i,
  /problem/i, /fault/i, /failure/i, /infrastructure/i,
];

/** File paths that indicate NON-exception code (false positive sources) */
const NON_EXCEPTION_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /test\//i, /tests\//i,
  /mock/i, /fake/i, /stub/i,
];

/** Keywords in surrounding context that indicate exception handling */
const EXCEPTION_CONTEXT_KEYWORDS = [
  'throw', 'catch', 'try', 'finally', 'rethrow',
  'iexceptionhandler', 'exceptionfilter', 'problemdetails',
  'useexceptionhandler', 'exceptionhandlermiddleware',
  'httpstatuscode', 'statuscode', 'badrequest', 'notfound',
  'internalservererror', 'unhandled', 'global',
];

/** Keywords that indicate NON-exception usage */
const NON_EXCEPTION_CONTEXT_KEYWORDS = [
  'assert', 'expect', 'should', 'mock', 'fake', 'stub',
  'test', 'spec', 'describe', 'it(', 'fact', 'theory',
];

// ============================================================================
// Exception Patterns Semantic Detector
// ============================================================================

export class ExceptionPatternsSemanticDetector extends SemanticDetector {
  readonly id = 'errors/aspnet-exception-patterns-semantic';
  readonly name = 'ASP.NET Exception Patterns Detector (Semantic)';
  readonly description = 'Learns exception handling patterns from ASP.NET Core codebases';
  readonly category = 'errors' as const;
  readonly subcategory = 'exception-handling';

  // C# only - this is ASP.NET specific
  override readonly supportedLanguages: Language[] = ['csharp'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: false,
    });
  }

  /**
   * Semantic keywords for exception pattern detection in C#
   */
  protected getSemanticKeywords(): string[] {
    return [
      // High-confidence exception keywords
      'Exception', 'ApplicationException', 'SystemException',
      'ArgumentException', 'ArgumentNullException', 'InvalidOperationException',
      'NotImplementedException', 'NotSupportedException', 'NullReferenceException',
      
      // Custom exception patterns
      'DomainException', 'BusinessException', 'ValidationException',
      'NotFoundException', 'UnauthorizedException', 'ForbiddenException',
      'ConflictException', 'BadRequestException',
      
      // Exception handling infrastructure
      'IExceptionHandler', 'ExceptionHandler', 'ExceptionFilter',
      'IExceptionFilter', 'ExceptionFilterAttribute',
      'UseExceptionHandler', 'ExceptionHandlerMiddleware',
      
      // ProblemDetails (RFC 7807)
      'ProblemDetails', 'ValidationProblemDetails', 'ProblemDetailsFactory',
      
      // Try-catch keywords
      'try', 'catch', 'finally', 'throw', 'rethrow',
      'when', // C# exception filter
    ];
  }

  protected getSemanticCategory(): string {
    return 'errors';
  }

  /**
   * Context-aware filtering to eliminate false positives
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();
    const lineLower = lineContent.toLowerCase();

    // Skip test files
    for (const pattern of NON_EXCEPTION_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return false;
      }
    }

    // High-confidence keywords always match
    const highConfidenceKeywords = [
      'IExceptionHandler', 'ExceptionHandler', 'ExceptionFilter',
      'IExceptionFilter', 'ExceptionFilterAttribute',
      'UseExceptionHandler', 'ExceptionHandlerMiddleware',
      'ProblemDetails', 'ValidationProblemDetails', 'ProblemDetailsFactory',
      'DomainException', 'BusinessException', 'ValidationException',
      'NotFoundException', 'UnauthorizedException', 'ForbiddenException',
    ];
    if (highConfidenceKeywords.some(k => keyword.includes(k))) {
      return true;
    }

    // Check for NON-exception context indicators (test code)
    for (const nonExceptionKeyword of NON_EXCEPTION_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonExceptionKeyword)) {
        return false;
      }
    }

    // Skip if it's just a variable name or parameter
    if (/\bex\b|\bexception\b/.test(lineLower) && !/class\s|:\s*\w*Exception/.test(lineContent)) {
      // Check if it's a catch block variable
      if (/catch\s*\(/.test(lineContent)) {
        return true; // This is a catch block, relevant
      }
      // Check if it's just a variable reference
      if (!/throw|new\s+\w*Exception|:\s*\w*Exception/.test(lineContent)) {
        return false;
      }
    }

    // Check file path for exception patterns (strong positive signal)
    for (const pattern of EXCEPTION_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context for exception keywords
    const exceptionContextScore = EXCEPTION_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
    const nonExceptionContextScore = NON_EXCEPTION_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;

    // For generic keywords like 'Exception', require positive context
    if (keyword === 'Exception' || keyword === 'try' || keyword === 'catch') {
      // Check for class definition (custom exception)
      if (/class\s+\w+\s*:\s*\w*Exception/.test(lineContent)) {
        return true;
      }
      // Check for throw statement
      if (/throw\s+new\s+\w*Exception/.test(lineContent)) {
        return true;
      }
      // Require positive context
      return exceptionContextScore > nonExceptionContextScore;
    }

    return exceptionContextScore >= nonExceptionContextScore;
  }

  /**
   * Create violation for inconsistent exception pattern
   */
  protected createPatternViolation(
    match: SemanticMatch,
    dominantPattern: UsagePattern
  ): Violation {
    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity: 'warning',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent exception pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for exception handling in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createExceptionPatternsSemanticDetector(): ExceptionPatternsSemanticDetector {
  return new ExceptionPatternsSemanticDetector();
}
