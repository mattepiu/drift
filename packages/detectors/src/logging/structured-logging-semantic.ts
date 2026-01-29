/**
 * Structured Logging Semantic Detector
 * 
 * Language-agnostic detector that finds structured logging patterns
 * by looking for semantic concepts.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

export class StructuredLoggingSemanticDetector extends SemanticDetector {
  readonly id = 'logging/structured-logging';
  readonly name = 'Structured Logging Detector';
  readonly description = 'Learns structured logging patterns from your codebase';
  readonly category = 'logging' as const;
  readonly subcategory = 'structured-logging';

  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'css', 'scss', 'json', 'yaml', 'markdown'
  ];

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
      'log',
      'logger',
      'logging',
      'winston',
      'pino',
      'bunyan',
      'console',
      'print',
      'debug',
      'info',
      'warn',
      'error',
    ];
  }

  protected getSemanticCategory(): string {
    return 'logging';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    // Skip if it's just in a URL or path
    if (/https?:\/\/|\/api\/|\/v\d+\//.test(match.lineContent)) {
      return false;
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
      explanation: `Your project uses '${dominantPattern.contextType}' for logging in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  override generateQuickFix(_violation: Violation): null {
    return null;
  }
}

export function createStructuredLoggingSemanticDetector(): StructuredLoggingSemanticDetector {
  return new StructuredLoggingSemanticDetector();
}
