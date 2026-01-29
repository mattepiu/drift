/**
 * Audit Logging Detector - SEMANTIC VERSION
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

export class AuditSemanticDetector extends SemanticDetector {
  readonly id = 'auth/audit';
  readonly name = 'Audit Logging Detector';
  readonly description = 'Learns audit logging patterns from your codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'audit';

  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'css', 'scss', 'json', 'yaml', 'markdown'
  ];

  constructor() {
    super({ minOccurrences: 2, dominanceThreshold: 0.3, minFiles: 1 });
  }

  protected getSemanticKeywords(): string[] {
    return [
      'audit', 'auditLog', 'audit_log', 'track', 'tracking', 'activity',
      'activityLog', 'activity_log', 'history', 'changelog', 'event',
      'logAction', 'log_action', 'recordAction', 'record_action',
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
      message: `Inconsistent audit pattern: using '${match.contextType}' but project uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for audit logging in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createAuditSemanticDetector(): AuditSemanticDetector {
  return new AuditSemanticDetector();
}
