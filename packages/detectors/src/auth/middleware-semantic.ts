/**
 * Auth Middleware Detector - SEMANTIC VERSION
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

export class AuthMiddlewareSemanticDetector extends SemanticDetector {
  readonly id = 'auth/middleware';
  readonly name = 'Auth Middleware Detector';
  readonly description = 'Learns auth middleware patterns from your codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'middleware';

  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'css', 'scss', 'json', 'yaml', 'markdown'
  ];

  constructor() {
    super({ minOccurrences: 2, dominanceThreshold: 0.3, minFiles: 1 });
  }

  protected getSemanticKeywords(): string[] {
    return [
      'middleware', 'guard', 'interceptor', 'filter', 'authenticate',
      'authentication', 'protect', 'secure', 'requireAuth', 'require_auth',
      'isAuthenticated', 'is_authenticated', 'authRequired', 'auth_required',
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
      message: `Inconsistent auth middleware: using '${match.contextType}' but project uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for auth middleware in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createAuthMiddlewareSemanticDetector(): AuthMiddlewareSemanticDetector {
  return new AuthMiddlewareSemanticDetector();
}
