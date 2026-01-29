/**
 * Query Patterns Detector - Query builder vs raw SQL detection
 *
 * Detects database query patterns including:
 * - Query builder usage (Prisma, Drizzle, Knex, TypeORM)
 * - Raw SQL queries
 * - Parameterized queries
 * - String concatenation in queries (anti-pattern)
 *
 * @requirements 13.1 - Query builder vs raw SQL patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type QueryPatternType =
  | 'prisma-query'
  | 'drizzle-query'
  | 'knex-query'
  | 'typeorm-query'
  | 'sequelize-query'
  | 'raw-sql'
  | 'parameterized-query';

export type QueryViolationType =
  | 'string-concatenation'
  | 'unparameterized-query'
  | 'mixed-query-styles';

export interface QueryPatternInfo {
  type: QueryPatternType;
  line: number;
  column: number;
  match: string;
  queryBuilder?: string;
}

export interface QueryViolationInfo {
  type: QueryViolationType;
  line: number;
  column: number;
  match: string;
  message: string;
}

export interface QueryAnalysis {
  patterns: QueryPatternInfo[];
  violations: QueryViolationInfo[];
  dominantStyle: QueryPatternType | null;
  usesMultipleStyles: boolean;
}

// ============================================================================
// Patterns
// ============================================================================

export const PRISMA_PATTERNS = [
  /prisma\.\w+\.(findMany|findFirst|findUnique|create|update|delete|upsert|count|aggregate)\s*\(/gi,
  /\$queryRaw\s*`/gi,
  /\$executeRaw\s*`/gi,
];

export const DRIZZLE_PATTERNS = [
  /db\.(select|insert|update|delete)\s*\(/gi,
  /\.from\s*\(\s*\w+\s*\)/gi,
  /drizzle\s*\(/gi,
];

export const KNEX_PATTERNS = [
  /knex\s*\(\s*['"`]\w+['"`]\s*\)/gi,
  /\.select\s*\([^)]*\)\s*\.from\s*\(/gi,
  /\.where\s*\(\s*\{/gi,
];

export const TYPEORM_PATTERNS = [
  // JavaScript/TypeScript
  /getRepository\s*\(\s*\w+\s*\)/gi,
  /\.createQueryBuilder\s*\(/gi,
  /\.find\s*\(\s*\{/gi,
  /\.findOne\s*\(\s*\{/gi,
  // Python SQLAlchemy (similar patterns)
  /session\.query\s*\(/gi,
  /Session\.query\s*\(/gi,
  /\.filter\s*\(/gi,
  /\.filter_by\s*\(/gi,
  /\.all\s*\(\s*\)/gi,
  /\.first\s*\(\s*\)/gi,
  /\.one\s*\(\s*\)/gi,
  /\.scalar\s*\(\s*\)/gi,
];

export const SEQUELIZE_PATTERNS = [
  // JavaScript/TypeScript
  /\w+\.findAll\s*\(\s*\{/gi,
  /\w+\.findOne\s*\(\s*\{/gi,
  /sequelize\.query\s*\(/gi,
  // Python Django ORM
  /\.objects\.all\s*\(/gi,
  /\.objects\.filter\s*\(/gi,
  /\.objects\.get\s*\(/gi,
  /\.objects\.create\s*\(/gi,
  /\.objects\.update\s*\(/gi,
  /\.objects\.delete\s*\(/gi,
  /\.objects\.exclude\s*\(/gi,
  /\.objects\.annotate\s*\(/gi,
  // Python Supabase
  /supabase\.table\s*\(/gi,
  /\.select\s*\(\s*['"][*'"]\s*\)/gi,
  /\.insert\s*\(\s*\{/gi,
  /\.update\s*\(\s*\{/gi,
  /\.delete\s*\(\s*\)/gi,
  /\.eq\s*\(/gi,
];

export const RAW_SQL_PATTERNS = [
  // JavaScript/TypeScript and Python (SQL is universal)
  /\bSELECT\s+.+\s+FROM\s+/gi,
  /\bINSERT\s+INTO\s+/gi,
  /\bUPDATE\s+\w+\s+SET\s+/gi,
  /\bDELETE\s+FROM\s+/gi,
  // Python raw SQL execution
  /cursor\.execute\s*\(/gi,
  /connection\.execute\s*\(/gi,
  /\.execute\s*\(\s*['"](?:SELECT|INSERT|UPDATE|DELETE)/gi,
  /\.executemany\s*\(/gi,
  /text\s*\(\s*['"](?:SELECT|INSERT|UPDATE|DELETE)/gi, // SQLAlchemy text()
];

export const PARAMETERIZED_PATTERNS = [
  /\$\d+/g, // PostgreSQL style $1, $2
  /\?\s*,?\s*\[/g, // MySQL style ? with array
  /:\w+/g, // Named parameters :name
];

export const STRING_CONCAT_PATTERNS = [
  // JavaScript/TypeScript
  /['"`]\s*\+\s*\w+\s*\+\s*['"`].*(?:SELECT|INSERT|UPDATE|DELETE)/gi,
  /(?:SELECT|INSERT|UPDATE|DELETE).*['"`]\s*\+\s*\w+/gi,
  /`\$\{[^}]+\}`.*(?:SELECT|INSERT|UPDATE|DELETE)/gi,
  // Python f-strings and format strings in SQL (dangerous!)
  /f['"].*(?:SELECT|INSERT|UPDATE|DELETE).*\{[^}]+\}/gi,
  /['"].*(?:SELECT|INSERT|UPDATE|DELETE).*['"]\.format\s*\(/gi,
  /['"].*(?:SELECT|INSERT|UPDATE|DELETE).*['"].*%\s*\(/gi,
];

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /\.d\.ts$/,
    /node_modules\//,
    /\.min\.[jt]s$/,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectPrismaQueries(content: string): QueryPatternInfo[] {
  const results: QueryPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of PRISMA_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'prisma-query',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          queryBuilder: 'prisma',
        });
      }
    }
  }

  return results;
}

export function detectDrizzleQueries(content: string): QueryPatternInfo[] {
  const results: QueryPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DRIZZLE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'drizzle-query',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          queryBuilder: 'drizzle',
        });
      }
    }
  }

  return results;
}

export function detectKnexQueries(content: string): QueryPatternInfo[] {
  const results: QueryPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of KNEX_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'knex-query',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          queryBuilder: 'knex',
        });
      }
    }
  }

  return results;
}

export function detectTypeORMQueries(content: string): QueryPatternInfo[] {
  const results: QueryPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPEORM_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'typeorm-query',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          queryBuilder: 'typeorm',
        });
      }
    }
  }

  return results;
}

export function detectRawSQLQueries(content: string): QueryPatternInfo[] {
  const results: QueryPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of RAW_SQL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'raw-sql',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectStringConcatViolations(content: string): QueryViolationInfo[] {
  const results: QueryViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of STRING_CONCAT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'string-concatenation',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          message: 'String concatenation in SQL query detected - use parameterized queries',
        });
      }
    }
  }

  return results;
}

export function analyzeQueryPatterns(content: string, filePath: string): QueryAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      dominantStyle: null,
      usesMultipleStyles: false,
    };
  }

  const patterns: QueryPatternInfo[] = [
    ...detectPrismaQueries(content),
    ...detectDrizzleQueries(content),
    ...detectKnexQueries(content),
    ...detectTypeORMQueries(content),
    ...detectRawSQLQueries(content),
  ];

  const violations = detectStringConcatViolations(content);

  // Determine dominant style
  const styleCounts = new Map<QueryPatternType, number>();
  for (const pattern of patterns) {
    styleCounts.set(pattern.type, (styleCounts.get(pattern.type) || 0) + 1);
  }

  let dominantStyle: QueryPatternType | null = null;
  let maxCount = 0;
  for (const [style, count] of styleCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantStyle = style;
    }
  }

  const uniqueStyles = new Set(patterns.map((p) => p.queryBuilder || p.type));
  const usesMultipleStyles = uniqueStyles.size > 1;

  if (usesMultipleStyles) {
    violations.push({
      type: 'mixed-query-styles',
      line: 1,
      column: 1,
      match: '',
      message: `Multiple query styles detected: ${[...uniqueStyles].join(', ')}`,
    });
  }

  return { patterns, violations, dominantStyle, usesMultipleStyles };
}

// ============================================================================
// Detector Class
// ============================================================================

export class QueryPatternsDetector extends RegexDetector {
  readonly id = 'data-access/query-patterns';
  readonly name = 'Query Patterns Detector';
  readonly description = 'Detects query builder vs raw SQL patterns and identifies unsafe query construction';
  readonly category: PatternCategory = 'data-access';
  readonly subcategory = 'query-patterns';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeQueryPatterns(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      file: context.file,
      line: v.line,
      column: v.column,
      type: v.type,
      value: v.match,
      issue: v.message,
      severity: v.type === 'string-concatenation' ? 'error' : 'warning',
    }));

    const confidence = analysis.violations.length > 0 ? 0.9 : 0.85;
    return this.createResult([], violations, confidence, {
      custom: {
        patterns: analysis.patterns,
        dominantStyle: analysis.dominantStyle,
        usesMultipleStyles: analysis.usesMultipleStyles,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createQueryPatternsDetector(): QueryPatternsDetector {
  return new QueryPatternsDetector();
}
