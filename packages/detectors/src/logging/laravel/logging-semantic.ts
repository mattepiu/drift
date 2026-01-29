/**
 * Laravel Logging Patterns Detector - SEMANTIC VERSION
 *
 * Learns logging patterns from your Laravel codebase:
 * - Log facade usage (Log::info, Log::error, etc.)
 * - Logger injection patterns
 * - Context data patterns
 * - Channel configuration
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

const LOGGING_FILE_PATTERNS = [
  /services\//i, /controllers\//i, /handlers\//i,
  /jobs\//i, /listeners\//i, /middleware\//i,
  /logging\.php$/i,
];

const LOGGING_CONTEXT_KEYWORDS = [
  'illuminate\\support\\facades\\log',
  'psr\\log\\loggerinterface',
  'log::', 'logger->', '$this->logger',
  'emergency', 'alert', 'critical', 'error',
  'warning', 'notice', 'info', 'debug',
];

// ============================================================================
// Laravel Logging Semantic Detector
// ============================================================================

export class LaravelLoggingSemanticDetector extends SemanticDetector {
  readonly id = 'logging/laravel-logging-semantic';
  readonly name = 'Laravel Logging Patterns Detector';
  readonly description = 'Learns logging patterns from your Laravel codebase';
  readonly category = 'logging' as const;
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
      // Log facade
      'Log', 'log', 'logger',
      
      // Log levels
      'emergency', 'alert', 'critical', 'error',
      'warning', 'notice', 'info', 'debug',
      
      // Channels
      'channel', 'stack', 'single', 'daily', 'slack', 'syslog',
      
      // Context
      'context', 'withContext', 'shareContext',
      
      // Monolog
      'Monolog', 'Handler', 'Formatter', 'Processor',
    ];
  }

  protected getSemanticCategory(): string {
    return 'logging';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    // High-confidence keywords
    const highConfidenceKeywords = ['Log', 'logger', 'Monolog'];
    if (highConfidenceKeywords.includes(keyword)) {
      // Verify it's Laravel Log facade
      if (keyword === 'Log' && !lineContent.includes('Log::') && !lineContent.includes('use ')) {
        return false;
      }
      return true;
    }

    // Skip comments
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // For log level keywords, require logging context
    const logLevels = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'];
    if (logLevels.includes(keyword.toLowerCase())) {
      const hasContext = LOGGING_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inLoggingFile = LOGGING_FILE_PATTERNS.some(p => p.test(file));
        if (!inLoggingFile) {return false;}
      }
    }

    return true;
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
      message: `Inconsistent logging pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for logging in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelLoggingSemanticDetector(): LaravelLoggingSemanticDetector {
  return new LaravelLoggingSemanticDetector();
}
