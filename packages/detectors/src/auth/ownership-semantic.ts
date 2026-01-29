/**
 * Resource Ownership Detector - SEMANTIC VERSION
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

export class OwnershipSemanticDetector extends SemanticDetector {
  readonly id = 'auth/ownership';
  readonly name = 'Resource Ownership Detector';
  readonly description = 'Learns resource ownership patterns from your codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'ownership';

  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'css', 'scss', 'json', 'yaml', 'markdown'
  ];

  constructor() {
    super({ minOccurrences: 2, dominanceThreshold: 0.3, minFiles: 1 });
  }

  protected getSemanticKeywords(): string[] {
    return [
      'owner', 'owned', 'ownership', 'belongs', 'belongsTo', 'belongs_to',
      'createdBy', 'created_by', 'userId', 'user_id', 'authorId', 'author_id',
      'tenant', 'tenantId', 'tenant_id', 'organization', 'org', 'workspace',
    ];
  }

  protected getSemanticCategory(): string {
    return 'auth';
  }

  protected createPatternViolation(match: SemanticMatch, dominantPattern: UsagePattern): Violation {
    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity: 'warning',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent ownership pattern: using '${match.contextType}' but project uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for ownership in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createOwnershipSemanticDetector(): OwnershipSemanticDetector {
  return new OwnershipSemanticDetector();
}
