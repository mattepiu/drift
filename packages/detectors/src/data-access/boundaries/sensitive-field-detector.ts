/**
 * Sensitive Field Semantic Detector
 * 
 * Language-agnostic detector that auto-detects potentially sensitive
 * fields/columns in data models and schemas.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

const SENSITIVE_KEYWORDS = [
  // PII
  'ssn', 'social_security', 'date_of_birth', 'dob', 'address', 'phone',
  // Credentials
  'password', 'secret', 'token', 'api_key', 'private_key', 'hash', 'salt',
  // Financial
  'credit_card', 'card_number', 'cvv', 'bank_account', 'salary', 'income',
  // Health
  'diagnosis', 'prescription', 'medical', 'health',
];

export class SensitiveFieldSemanticDetector extends SemanticDetector {
  readonly id = 'data-access/boundaries/sensitive-field';
  readonly name = 'Sensitive Field Detector';
  readonly description = 'Auto-detects potentially sensitive fields/columns in data models';
  readonly category = 'data-access' as const;
  readonly subcategory = 'sensitive-field';

  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'csharp', 'php', 'json', 'yaml'
  ];

  constructor() {
    super({
      minOccurrences: 1, // Even one sensitive field is important
      dominanceThreshold: 0.2,
      minFiles: 1,
      includeComments: false,
      includeStrings: true, // Include strings to catch field names in configs
    });
  }

  protected getSemanticKeywords(): string[] {
    return SENSITIVE_KEYWORDS;
  }

  protected getSemanticCategory(): string {
    return 'data-access';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    // Skip URLs and API paths
    if (/https?:\/\/|\/api\/|\/v\d+\//.test(match.lineContent)) {
      return false;
    }
    // Skip comments
    if (/^\s*(\/\/|#|\/\*|\*)/.test(match.lineContent)) {
      return false;
    }
    // Skip import statements
    if (match.contextType === 'import') {
      return false;
    }
    // Skip if it's part of a longer unrelated word (e.g., 'telephone' contains 'phone')
    // but we want to keep compound words like 'phone_number'
    const wordBoundaryPattern = new RegExp(`(^|[_\\-\\s.])${match.keyword}([_\\-\\s.]|$)`, 'i');
    if (!wordBoundaryPattern.test(match.lineContent) && 
        !match.lineContent.toLowerCase().includes(match.keyword.toLowerCase())) {
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
      severity: 'info', // Info level since this is detection, not necessarily a problem
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Sensitive field detected: '${match.keyword}' - ensure proper data protection measures`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Detected potentially sensitive field '${match.keyword}' which may contain PII, credentials, or other protected data. ` +
        `Your project handles sensitive fields using '${dominantPattern.contextType}' in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files).\n\n` +
        `Consider:\n` +
        `  • Encryption at rest and in transit\n` +
        `  • Access control and audit logging\n` +
        `  • Data masking in logs and error messages\n\n` +
        `Examples of sensitive field handling:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: false,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  override generateQuickFix(_violation: Violation): null {
    return null;
  }
}

export function createSensitiveFieldSemanticDetector(): SensitiveFieldSemanticDetector {
  return new SensitiveFieldSemanticDetector();
}
