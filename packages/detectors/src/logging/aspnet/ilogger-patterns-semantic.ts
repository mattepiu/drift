/**
 * ILogger Patterns Detector for ASP.NET Core - SEMANTIC VERSION
 *
 * Truly semantic detector that learns ILogger<T> usage patterns from C# codebases:
 * - ILogger<T> injection
 * - Log level usage (Debug, Info, Warning, Error, Critical)
 * - Structured logging with templates
 * - Log scopes
 * - High-performance logging patterns (LoggerMessage)
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (services/, controllers/, etc.)
 * - Surrounding code context (logging imports, DI patterns)
 * - Semantic disambiguation (logger field vs Logger class)
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

/** File paths that indicate logging-related code */
const LOGGING_FILE_PATTERNS = [
  /service/i, /controller/i, /handler/i, /middleware/i,
  /repository/i, /manager/i, /provider/i, /worker/i,
  /job/i, /background/i, /hosted/i, /startup/i,
  /program/i, /logging/i, /infrastructure/i,
];

/** File paths that indicate NON-logging code (false positive sources) */
const NON_LOGGING_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /test\//i, /tests\//i,
  /mock/i, /fake/i, /stub/i,
  /\.designer\./i, /migration/i,
];

/** Keywords in surrounding context that indicate logging usage */
const LOGGING_CONTEXT_KEYWORDS = [
  'ilogger', 'logger', 'logging', 'log',
  'logdebug', 'loginformation', 'logwarning', 'logerror', 'logcritical', 'logtrace',
  'beginscope', 'loggermessage', 'loggerfactory',
  'microsoft.extensions.logging', 'serilog', 'nlog',
  'structured', 'template', 'eventid',
];

/** Keywords that indicate NON-logging usage */
const NON_LOGGING_CONTEXT_KEYWORDS = [
  'assert', 'expect', 'should', 'mock', 'fake', 'stub',
  'test', 'spec', 'describe', 'it(', 'fact', 'theory',
  'changelog', 'dialog', 'catalog', // Words containing 'log' but not logging
];

// ============================================================================
// ILogger Patterns Semantic Detector
// ============================================================================

export class ILoggerPatternsSemanticDetector extends SemanticDetector {
  readonly id = 'logging/aspnet-ilogger-patterns-semantic';
  readonly name = 'ASP.NET ILogger Patterns Detector (Semantic)';
  readonly description = 'Learns ILogger<T> usage patterns from ASP.NET Core codebases';
  readonly category = 'logging' as const;
  readonly subcategory = 'structured-logging';

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
   * Semantic keywords for ILogger pattern detection in C#
   */
  protected getSemanticKeywords(): string[] {
    return [
      // ILogger types
      'ILogger', 'ILogger<', 'ILoggerFactory', 'ILoggerProvider',
      'Logger', 'LoggerFactory',
      
      // Log level methods
      'LogDebug', 'LogInformation', 'LogWarning', 'LogError', 'LogCritical', 'LogTrace',
      'Log', // Generic Log method
      
      // Log scopes
      'BeginScope', 'IDisposable', // scope pattern
      
      // High-performance logging
      'LoggerMessage', 'LoggerMessageAttribute', '[LoggerMessage',
      'Define', 'DefineScope',
      
      // Structured logging
      'EventId', 'LogLevel',
      
      // Common field names
      '_logger', 'logger', '_log',
      
      // Extensions and configuration
      'AddLogging', 'ConfigureLogging', 'UseLogging',
      'LoggingBuilder', 'ILoggingBuilder',
      
      // Third-party integrations
      'Serilog', 'NLog', 'Log4Net',
      'UseSerilog', 'AddSerilog', 'AddNLog',
    ];
  }

  protected getSemanticCategory(): string {
    return 'logging';
  }

  /**
   * Context-aware filtering to eliminate false positives
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();
    const lineLower = lineContent.toLowerCase();

    // Skip test files
    for (const pattern of NON_LOGGING_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return false;
      }
    }

    // High-confidence keywords always match
    const highConfidenceKeywords = [
      'ILogger', 'ILoggerFactory', 'ILoggerProvider',
      'LogDebug', 'LogInformation', 'LogWarning', 'LogError', 'LogCritical', 'LogTrace',
      'LoggerMessage', 'LoggerMessageAttribute',
      'BeginScope', 'AddLogging', 'ConfigureLogging',
      'Serilog', 'NLog', 'UseSerilog',
    ];
    if (highConfidenceKeywords.some(k => keyword.includes(k))) {
      return true;
    }

    // Check for NON-logging context indicators
    for (const nonLoggingKeyword of NON_LOGGING_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonLoggingKeyword.toLowerCase())) {
        // Check if it's actually a logging keyword that contains these
        if (!highConfidenceKeywords.some(k => lineLower.includes(k.toLowerCase()))) {
          return false;
        }
      }
    }

    // Skip words that contain 'log' but aren't logging
    if (/changelog|dialog|catalog|backlog|analog|prologue|epilogue/i.test(lineContent)) {
      return false;
    }

    // For generic keywords like 'Logger', '_logger', check context
    if (['Logger', 'logger', '_logger', '_log', 'Log'].includes(keyword)) {
      // Check if it's ILogger injection
      if (/ILogger<|ILogger\s+\w+|readonly.*[Ll]ogger/.test(lineContent)) {
        return true;
      }
      // Check if it's a log method call
      if (/\.(Log|LogDebug|LogInformation|LogWarning|LogError|LogCritical)\s*\(/.test(lineContent)) {
        return true;
      }
      // Check surrounding context
      const loggingContextScore = LOGGING_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
      return loggingContextScore >= 2;
    }

    // For 'EventId', 'LogLevel', check if it's in logging context
    if (['EventId', 'LogLevel'].includes(keyword)) {
      const loggingContextScore = LOGGING_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
      return loggingContextScore >= 1;
    }

    // Check file path for logging patterns
    for (const pattern of LOGGING_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const loggingContextScore = LOGGING_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
        return loggingContextScore >= 1;
      }
    }

    // Default: check context balance
    const loggingContextScore = LOGGING_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
    const nonLoggingContextScore = NON_LOGGING_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;

    return loggingContextScore > nonLoggingContextScore;
  }

  /**
   * Create violation for inconsistent ILogger pattern
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
      message: `Inconsistent ILogger pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for ILogger patterns in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createILoggerPatternsSemanticDetector(): ILoggerPatternsSemanticDetector {
  return new ILoggerPatternsSemanticDetector();
}
