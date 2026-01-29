/**
 * Laravel Error Handling Patterns Detector - SEMANTIC VERSION
 *
 * Learns error handling patterns from your Laravel codebase:
 * - Exception class definitions and hierarchy
 * - Exception handler patterns (reportable, renderable)
 * - Try-catch patterns and error propagation
 * - Abort helpers and HTTP exceptions
 * - Error response formatting
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (Exceptions/, Handlers/, etc.)
 * - Surrounding code context (Laravel exception imports)
 * - Semantic disambiguation (exceptions vs generic errors)
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

/** File paths that indicate Laravel error handling code */
const ERROR_FILE_PATTERNS = [
  /exceptions\//i, /handlers\//i, /errors\//i,
  /handler\.php$/i, /exception\.php$/i,
  /controllers\//i, /services\//i, /jobs\//i,
];

/** File paths that indicate NON-error code */
const NON_ERROR_FILE_PATTERNS = [
  /migrations\//i, /seeders\//i, /factories\//i,
  /\.blade\.php$/i, /views\//i, /resources\//i,
];

/** Keywords in surrounding context that indicate Laravel error handling */
const ERROR_CONTEXT_KEYWORDS = [
  'illuminate\\foundation\\exceptions',
  'illuminate\\contracts\\debug',
  'symfony\\component\\httpkernel\\exception',
  'extends exception', 'extends httpexception',
  'reportable', 'renderable', 'dontreport', 'dontflash',
  'abort(', 'abort_if(', 'abort_unless(',
  'throw new', 'try {', 'catch (',
  'report(', 'render(',
];

/** Keywords that indicate NON-error usage */
const NON_ERROR_CONTEXT_KEYWORDS = [
  'test', 'mock', 'fake', 'stub',
  'migration', 'seeder', 'factory',
];

// ============================================================================
// Laravel Errors Semantic Detector
// ============================================================================

export class LaravelErrorsSemanticDetector extends SemanticDetector {
  readonly id = 'errors/laravel-errors-semantic';
  readonly name = 'Laravel Error Handling Patterns Detector';
  readonly description = 'Learns error handling patterns from your Laravel codebase';
  readonly category = 'errors' as const;
  readonly subcategory = 'laravel';

  override readonly supportedLanguages: Language[] = ['php'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: false,
    });
  }

  protected getSemanticKeywords(): string[] {
    return [
      // Exception classes
      'Exception', 'HttpException', 'ValidationException', 'ModelNotFoundException',
      'AuthenticationException', 'AuthorizationException', 'NotFoundHttpException',
      'AccessDeniedHttpException', 'BadRequestHttpException', 'ConflictHttpException',
      'UnprocessableEntityHttpException', 'TooManyRequestsHttpException',
      
      // Exception handler
      'Handler', 'ExceptionHandler', 'reportable', 'renderable',
      'dontReport', 'dontFlash', 'register', 'report', 'render',
      'shouldReport', 'context', 'level',
      
      // Throwing and catching
      'throw', 'try', 'catch', 'finally', 'rethrow',
      
      // Abort helpers
      'abort', 'abort_if', 'abort_unless', 'rescue',
      
      // Error responses
      'response', 'json', 'status', 'withException',
      
      // Logging errors
      'Log', 'error', 'critical', 'emergency', 'alert',
    ];
  }

  protected getSemanticCategory(): string {
    return 'errors';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();
    const lineLower = lineContent.toLowerCase();

    // High-confidence keywords - Laravel exception-specific
    const highConfidenceKeywords = [
      'Exception', 'HttpException', 'Handler', 'ExceptionHandler',
      'reportable', 'renderable', 'dontReport', 'dontFlash',
      'abort', 'abort_if', 'abort_unless',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      // Verify it's Laravel exception context
      if (keyword === 'Exception' && !lineLower.includes('exception') && !lineLower.includes('extends')) {
        return false;
      }
      return true;
    }

    // Skip non-error files
    for (const pattern of NON_ERROR_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const hasContext = ERROR_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (!hasContext) {return false;}
      }
    }

    // Skip comments
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent) || /^\s*#/.test(lineContent)) {
      return false;
    }

    // Skip non-error context
    for (const nonErrorKeyword of NON_ERROR_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonErrorKeyword)) {
        return false;
      }
    }

    // For ambiguous keywords like 'throw', 'try', 'catch', require error context
    const ambiguousKeywords = ['throw', 'try', 'catch', 'finally', 'error', 'response', 'json'];
    if (ambiguousKeywords.includes(keyword.toLowerCase())) {
      const hasContext = ERROR_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inErrorFile = ERROR_FILE_PATTERNS.some(p => p.test(file));
        if (!inErrorFile) {return false;}
      }
    }

    // Check file path for error patterns
    for (const pattern of ERROR_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context
    const errorContextScore = ERROR_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
    const nonErrorContextScore = NON_ERROR_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;

    return errorContextScore > nonErrorContextScore;
  }

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
      message: `Inconsistent error handling pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for error handling in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files).`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelErrorsSemanticDetector(): LaravelErrorsSemanticDetector {
  return new LaravelErrorsSemanticDetector();
}
