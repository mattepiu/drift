/**
 * SQL Injection Semantic Detector
 * 
 * Language-agnostic detector for SQL injection prevention patterns.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation } from 'driftdetect-core';

export class SQLInjectionSemanticDetector extends SemanticDetector {
  readonly id = 'security/sql-injection';
  readonly name = 'SQL Injection Detector';
  readonly description = 'Learns SQL injection prevention patterns from your codebase';
  readonly category = 'security' as const;
  readonly subcategory = 'sql-injection';

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
      'query',
      'sql',
      'execute',
      'prepare',
      'parameterize',
      'bind',
      'statement',
      'database',
      'db',
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
      message: `Inconsistent SQL pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for SQL operations in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createSQLInjectionSemanticDetector(): SQLInjectionSemanticDetector {
  return new SQLInjectionSemanticDetector();
}
