/**
 * Result Pattern Detector for C# - SEMANTIC VERSION
 *
 * Truly semantic detector that learns Result/Either pattern usage from C# codebases:
 * - Result<T> / Result<T, TError> types
 * - OneOf<T1, T2> discriminated unions
 * - ErrorOr<T> pattern
 * - Either<TLeft, TRight> from LanguageExt
 * - Maybe<T> / Option<T> optional types
 * - Railway-oriented programming patterns
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (services/, domain/, etc.)
 * - Surrounding code context (functional error handling imports)
 * - Semantic disambiguation (Result type vs result variable)
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

/** File paths that indicate result pattern usage */
const RESULT_FILE_PATTERNS = [
  /service/i, /handler/i, /command/i, /query/i,
  /domain/i, /application/i, /usecase/i, /interactor/i,
  /result/i, /error/i, /common/i, /shared/i,
];

/** File paths that indicate NON-result pattern code */
const NON_RESULT_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /test\//i, /tests\//i,
  /mock/i, /fake/i, /stub/i,
  /migration/i, /\.designer\./i,
];

/** Keywords in surrounding context that indicate functional error handling */
const RESULT_CONTEXT_KEYWORDS = [
  'result', 'success', 'failure', 'error', 'value',
  'isSuccess', 'isFailure', 'isFailed', 'isError',
  'match', 'switch', 'map', 'bind', 'flatmap',
  'oneof', 'erroror', 'either', 'maybe', 'option',
  'fluentresults', 'languageext', 'railway',
  'thenreturn', 'onfailure', 'onsuccess',
];

/** Keywords that indicate NON-result pattern usage */
const NON_RESULT_CONTEXT_KEYWORDS = [
  'assert', 'expect', 'should', 'mock', 'fake', 'stub',
  'test', 'spec', 'describe', 'it(', 'fact', 'theory',
  'actionresult', 'iactionresult', 'viewresult', // MVC results, not functional
];

// ============================================================================
// Result Pattern Semantic Detector
// ============================================================================

export class ResultPatternSemanticDetector extends SemanticDetector {
  readonly id = 'errors/result-pattern-semantic';
  readonly name = 'Result Pattern Detector (Semantic)';
  readonly description = 'Learns Result/Either pattern usage for functional error handling in C#';
  readonly category = 'errors' as const;
  readonly subcategory = 'functional';

  // C# only - this is C# specific
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
   * Semantic keywords for result pattern detection in C#
   */
  protected getSemanticKeywords(): string[] {
    return [
      // Result types
      'Result', 'Result<', 'IResult',
      
      // OneOf discriminated unions
      'OneOf', 'OneOf<',
      
      // ErrorOr pattern
      'ErrorOr', 'ErrorOr<', 'Error',
      
      // Either/Maybe from LanguageExt
      'Either', 'Either<', 'Maybe', 'Maybe<', 'Option', 'Option<',
      'Some', 'None', 'Left', 'Right',
      
      // FluentResults library
      'FluentResults', 'Reasons', 'Errors', 'Successes',
      
      // Common result methods
      'IsSuccess', 'IsFailure', 'IsFailed', 'IsError',
      'Success', 'Failure', 'Fail', 'Ok',
      'Match', 'Switch', 'Map', 'Bind', 'FlatMap',
      'OnSuccess', 'OnFailure', 'ThenReturn',
      'ToResult', 'AsResult', 'FromResult',
      
      // Railway-oriented programming
      'Railway', 'Tee', 'TeeAsync',
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
    for (const pattern of NON_RESULT_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return false;
      }
    }

    // High-confidence keywords always match
    const highConfidenceKeywords = [
      'OneOf', 'ErrorOr', 'Either', 'FluentResults',
      'IsSuccess', 'IsFailure', 'IsFailed',
      'OnSuccess', 'OnFailure', 'ThenReturn',
      'Railway', 'LanguageExt',
    ];
    if (highConfidenceKeywords.some(k => keyword.includes(k))) {
      return true;
    }

    // Check for NON-result context indicators
    for (const nonResultKeyword of NON_RESULT_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonResultKeyword.toLowerCase())) {
        return false;
      }
    }

    // Skip MVC ActionResult (not functional Result pattern)
    if (/actionresult|iactionresult|viewresult|jsonresult|contentresult/i.test(lineContent)) {
      return false;
    }

    // Skip if 'Result' is just a variable name
    if (keyword === 'Result' || keyword === 'result') {
      // Check if it's a type usage (generic, return type, etc.)
      if (/Result<|:\s*Result\b|=>\s*Result\b|Task<Result/.test(lineContent)) {
        return true;
      }
      // Check if it's a variable assignment from a Result method
      if (/\.IsSuccess|\.IsFailure|\.Value|\.Error|\.Match\(/.test(lineContent)) {
        return true;
      }
      // Just a variable name, need more context
      const resultContextScore = RESULT_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
      return resultContextScore >= 2;
    }

    // For generic keywords like 'Success', 'Failure', check context
    if (['Success', 'Failure', 'Fail', 'Ok', 'Error'].includes(keyword)) {
      // Check if it's a static method call (Result.Success, Result.Failure)
      if (/Result\.(Success|Failure|Fail|Ok)|ErrorOr\.(From|Error)/.test(lineContent)) {
        return true;
      }
      // Check surrounding context
      const resultContextScore = RESULT_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
      return resultContextScore >= 2;
    }

    // Check file path for result patterns
    for (const pattern of RESULT_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const resultContextScore = RESULT_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
        return resultContextScore >= 1;
      }
    }

    // Default: check context balance
    const resultContextScore = RESULT_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
    const nonResultContextScore = NON_RESULT_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;

    return resultContextScore > nonResultContextScore;
  }

  /**
   * Create violation for inconsistent result pattern
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
      message: `Inconsistent Result pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for Result/Either patterns in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createResultPatternSemanticDetector(): ResultPatternSemanticDetector {
  return new ResultPatternSemanticDetector();
}
