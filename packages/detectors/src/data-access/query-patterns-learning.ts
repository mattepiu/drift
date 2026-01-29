/**
 * Query Patterns Detector - LEARNING VERSION
 *
 * Learns database query patterns from the user's codebase:
 * - ORM preferences
 * - Query builder patterns
 * - Raw SQL usage
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type QueryLibrary = 'prisma' | 'drizzle' | 'typeorm' | 'knex' | 'sequelize' | 'raw';

export interface QueryPatternsConventions {
  [key: string]: unknown;
  library: QueryLibrary;
  usesQueryBuilder: boolean;
  usesRawQueries: boolean;
}

interface QueryPatternInfo {
  library: QueryLibrary;
  isRaw: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractQueryPatterns(content: string, file: string): QueryPatternInfo[] {
  const results: QueryPatternInfo[] = [];

  const patterns: Array<{ regex: RegExp; library: QueryLibrary; isRaw: boolean }> = [
    { regex: /prisma\.\w+\.(?:findMany|findUnique|create|update|delete)/g, library: 'prisma', isRaw: false },
    { regex: /prisma\.\$queryRaw/g, library: 'prisma', isRaw: true },
    { regex: /db\.(?:select|insert|update|delete)\s*\(/g, library: 'drizzle', isRaw: false },
    { regex: /getRepository|createQueryBuilder/g, library: 'typeorm', isRaw: false },
    { regex: /knex\s*\(|\.select\s*\(|\.where\s*\(/g, library: 'knex', isRaw: false },
    { regex: /Model\.(?:findAll|findOne|create|update|destroy)/g, library: 'sequelize', isRaw: false },
    { regex: /\.query\s*\(\s*['"`](?:SELECT|INSERT|UPDATE|DELETE)/gi, library: 'raw', isRaw: true },
  ];

  for (const { regex, library, isRaw } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        library,
        isRaw,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Query Patterns Detector
// ============================================================================

export class QueryPatternsLearningDetector extends LearningDetector<QueryPatternsConventions> {
  readonly id = 'data-access/query-patterns';
  readonly category = 'data-access' as const;
  readonly subcategory = 'query-patterns';
  readonly name = 'Query Patterns Detector (Learning)';
  readonly description = 'Learns database query patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof QueryPatternsConventions> {
    return ['library', 'usesQueryBuilder', 'usesRawQueries'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof QueryPatternsConventions, ValueDistribution>
  ): void {
    const patterns = extractQueryPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const libraryDist = distributions.get('library')!;
    const rawDist = distributions.get('usesRawQueries')!;

    for (const pattern of patterns) {
      if (pattern.library !== 'raw') {
        libraryDist.add(pattern.library, context.file);
      }
      rawDist.add(pattern.isRaw, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<QueryPatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const queryPatterns = extractQueryPatterns(context.content, context.file);
    if (queryPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedLibrary = conventions.conventions.library?.value;
    const learnedUsesRaw = conventions.conventions.usesRawQueries?.value;

    // Check library consistency
    if (learnedLibrary) {
      for (const pattern of queryPatterns) {
        if (pattern.library !== learnedLibrary && pattern.library !== 'raw') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'query library', pattern.library, learnedLibrary,
            `Using ${pattern.library} but project uses ${learnedLibrary}`
          ));
        }
      }
    }

    // Check raw query usage
    if (learnedUsesRaw === false) {
      for (const pattern of queryPatterns) {
        if (pattern.isRaw) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'query style', 'raw SQL', 'query builder',
            `Raw SQL query detected - project prefers query builder`
          ));
        }
      }
    }

    if (queryPatterns.length > 0) {
      const first = queryPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/query`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createQueryPatternsLearningDetector(): QueryPatternsLearningDetector {
  return new QueryPatternsLearningDetector();
}
