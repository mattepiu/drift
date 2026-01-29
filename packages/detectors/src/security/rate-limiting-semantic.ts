/**
 * Rate Limiting Semantic Detector
 * 
 * Language-agnostic detector for rate limiting patterns.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation } from 'driftdetect-core';

export class RateLimitingSemanticDetector extends SemanticDetector {
  readonly id = 'security/rate-limiting';
  readonly name = 'Rate Limiting Detector';
  readonly description = 'Learns rate limiting patterns from your codebase';
  readonly category = 'security' as const;
  readonly subcategory = 'rate-limiting';

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
      'rate',
      'limit',
      'throttle',
      'quota',
      'bucket',
      'window',
      'cooldown',
      'retry',
    ];
  }

  protected getSemanticCategory(): string {
    return 'security';
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
      message: `Inconsistent rate limiting pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for rate limiting in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createRateLimitingSemanticDetector(): RateLimitingSemanticDetector {
  return new RateLimitingSemanticDetector();
}
