/**
 * ORM Model Semantic Detector
 * 
 * Language-agnostic detector that finds ORM model/entity definitions
 * to extract table mappings across different ORMs and frameworks.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

const KEYWORDS = [
  // EF Core
  'DbSet', 'DbContext', 'Entity', 'Table', 'Column',
  // Django
  'models.Model', 'CharField', 'ForeignKey', 'ManyToMany',
  // SQLAlchemy
  'Base', 'Column', 'relationship',
  // Prisma
  'model', '@relation', '@id', '@unique',
  // TypeORM
  'Entity', 'Column', 'PrimaryColumn', 'ManyToOne',
  // Sequelize
  'Model', 'DataTypes', 'belongsTo', 'hasMany',
];

export class ORMModelSemanticDetector extends SemanticDetector {
  readonly id = 'data-access/boundaries/orm-model';
  readonly name = 'ORM Model Detector';
  readonly description = 'Detects ORM model/entity definitions to extract table mappings';
  readonly category = 'data-access' as const;
  readonly subcategory = 'orm-model';

  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'csharp', 'php', 'json', 'yaml'
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
    // Skip import-only lines for generic keywords
    if (match.contextType === 'import' && ['Base', 'Column', 'Model'].includes(match.keyword)) {
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
      message: `Inconsistent ORM model pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for ORM models in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createORMModelSemanticDetector(): ORMModelSemanticDetector {
  return new ORMModelSemanticDetector();
}
