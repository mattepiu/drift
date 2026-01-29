/**
 * Query Access Semantic Detector
 * 
 * Language-agnostic detector that finds data access points in code,
 * including ORM queries and raw SQL statements.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

const KEYWORDS = [
  // ORM queries
  'Where', 'Select', 'Include', 'Find', 'filter', 'get', 'all',
  'objects', 'query', 'execute', 'fetch', 'findMany', 'findFirst',
  // Raw SQL indicators
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'JOIN',
  'execute', 'raw', 'sql', 'cursor', 'rawQuery',
  // Table references
  'table', 'Table', 'from', 'into',
];

export class QueryAccessSemanticDetector extends SemanticDetector {
  readonly id = 'data-access/boundaries/query-access';
  readonly name = 'Query Access Detector';
  readonly description = 'Detects data access points in code (ORM queries, raw SQL)';
  readonly category = 'data-access' as const;
  readonly subcategory = 'query-access';

  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'csharp', 'php', 'json', 'yaml'
  ];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: true, // Include strings to catch raw SQL
    });
  }

  protected getSemanticKeywords(): string[] {
    return KEYWORDS;
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
    // Skip generic 'get', 'all', 'from' in non-data contexts
    const genericKeywords = ['get', 'all', 'from', 'into', 'filter'];
    if (genericKeywords.includes(match.keyword.toLowerCase())) {
      // Only keep if it looks like a data access context
      const dataContextIndicators = /\.(objects|query|db|repository|model|entity|table)/i;
      if (!dataContextIndicators.test(match.lineContent)) {
        return false;
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
      message: `Inconsistent query access pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for data queries in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createQueryAccessSemanticDetector(): QueryAccessSemanticDetector {
  return new QueryAccessSemanticDetector();
}
