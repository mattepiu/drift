/**
 * SQL Injection Detector - SQL injection vulnerability detection
 *
 * Detects SQL injection prevention patterns including:
 * - Parameterized queries (prepared statements)
 * - ORM usage (Prisma, TypeORM, Sequelize)
 * - Query builder patterns
 * - String concatenation violations
 * - Template literal SQL violations
 *
 * @requirements 16.2 - SQL injection prevention patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type SQLInjectionPatternType =
  | 'parameterized-query'
  | 'prepared-statement'
  | 'orm-query'
  | 'query-builder'
  | 'escape-function'
  | 'tagged-template';

export type SQLInjectionViolationType =
  | 'string-concatenation'
  | 'template-literal-injection'
  | 'dynamic-query'
  | 'raw-sql-with-input';

export interface SQLInjectionPatternInfo {
  type: SQLInjectionPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  queryType?: string | undefined;
  context?: string | undefined;
}

export interface SQLInjectionViolationInfo {
  type: SQLInjectionViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface SQLInjectionAnalysis {
  patterns: SQLInjectionPatternInfo[];
  violations: SQLInjectionViolationInfo[];
  hasParameterizedQueries: boolean;
  usesORM: boolean;
  hasViolations: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const PARAMETERIZED_QUERY_PATTERNS = [
  // TypeScript/JavaScript patterns
  /\$\d+/g,
  /\?\s*(?:,\s*\?)*\s*\)/g,
  /:\w+/g,
  /\@\w+/g,
  /\.query\s*\(\s*['"`][^'"`]*\$\d+/gi,
  /\.query\s*\(\s*['"`][^'"`]*\?/gi,
  // Python patterns - SQLAlchemy, psycopg2, sqlite3
  /%s/g,
  /%\(\w+\)s/g,
  /:\w+/g,
  /\.execute\s*\(\s*['"`][^'"`]*%s/gi,
  /\.execute\s*\(\s*['"`][^'"`]*:\w+/gi,
  /text\s*\(\s*['"`][^'"`]*:\w+/gi,
] as const;

export const PREPARED_STATEMENT_PATTERNS = [
  /\.prepare\s*\(/gi,
  /prepareStatement\s*\(/gi,
  /\.execute\s*\(\s*\[/gi,
  /\.run\s*\(\s*\[/gi,
  /createQueryBuilder\s*\(/gi,
  /\.setParameter\s*\(/gi,
] as const;

export const ORM_QUERY_PATTERNS = [
  // TypeScript/JavaScript patterns
  /prisma\.\w+\.(findMany|findFirst|findUnique|create|update|delete|upsert)\s*\(/gi,
  /\.createQueryBuilder\s*\(/gi,
  /getRepository\s*\(\s*\w+\s*\)\.(find|save|delete)/gi,
  /sequelize\.query\s*\([^,]+,\s*\{[^}]*replacements/gi,
  /Model\.(findAll|findOne|create|update|destroy)\s*\(/gi,
  /knex\s*\(\s*['"`]\w+['"`]\s*\)/gi,
  // Python patterns - SQLAlchemy, Django ORM, Supabase
  /session\.query\s*\(/gi,
  /\.filter\s*\(/gi,
  /\.filter_by\s*\(/gi,
  /objects\.filter\s*\(/gi,
  /objects\.get\s*\(/gi,
  /objects\.create\s*\(/gi,
  /objects\.all\s*\(/gi,
  /\.select\s*\(\s*\)\s*\.eq\s*\(/gi,
  /supabase\.\w+\.(select|insert|update|delete)\s*\(/gi,
] as const;

export const QUERY_BUILDER_PATTERNS = [
  /\.where\s*\(\s*\{/gi,
  /\.andWhere\s*\(/gi,
  /\.orWhere\s*\(/gi,
  /\.whereIn\s*\(/gi,
  /\.select\s*\(\s*\[/gi,
] as const;

export const ESCAPE_FUNCTION_PATTERNS = [
  /mysql\.escape\s*\(/gi,
  /pg\.escapeLiteral\s*\(/gi,
  /escapeSql\s*\(/gi,
] as const;

export const TAGGED_TEMPLATE_PATTERNS = [
  /sql`/gi,
  /Prisma\.sql`/gi,
  /\$queryRaw`/gi,
] as const;

export const STRING_CONCAT_VIOLATION_PATTERNS = [
  // TypeScript/JavaScript patterns
  /['"`]\s*\+\s*\w+\s*\+\s*['"`].*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)/gi,
  /(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*['"`]\s*\+\s*\w+/gi,
  // Python patterns - f-strings, format, % formatting in SQL
  /f['"`].*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*\{/gi,
  /['"`].*(?:SELECT|INSERT|UPDATE|DELETE).*['"`]\s*%\s*\(/gi,
  /['"`].*(?:SELECT|INSERT|UPDATE|DELETE).*['"`]\.format\s*\(/gi,
] as const;

export const TEMPLATE_LITERAL_VIOLATION_PATTERNS = [
  /`[^`]*\$\{[^}]*(?:req|request|body|query|params)\.[^}]*\}[^`]*(?:SELECT|INSERT|UPDATE|DELETE)/gi,
] as const;

export const RAW_SQL_WITH_INPUT_PATTERNS = [
  /\.raw\s*\(\s*['"`][^'"`]*\$\{/gi,
  /sequelize\.query\s*\(\s*`[^`]*\$\{/gi,
] as const;

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
    /migrations?\//,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectParameterizedQueries(
  content: string,
  filePath: string
): SQLInjectionPatternInfo[] {
  const results: SQLInjectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of PARAMETERIZED_QUERY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'parameterized-query',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectPreparedStatements(
  content: string,
  filePath: string
): SQLInjectionPatternInfo[] {
  const results: SQLInjectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of PREPARED_STATEMENT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'prepared-statement',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectORMQueries(
  content: string,
  filePath: string
): SQLInjectionPatternInfo[] {
  const results: SQLInjectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ORM_QUERY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'orm-query',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectQueryBuilders(
  content: string,
  filePath: string
): SQLInjectionPatternInfo[] {
  const results: SQLInjectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of QUERY_BUILDER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'query-builder',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectEscapeFunctions(
  content: string,
  filePath: string
): SQLInjectionPatternInfo[] {
  const results: SQLInjectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ESCAPE_FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'escape-function',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTaggedTemplates(
  content: string,
  filePath: string
): SQLInjectionPatternInfo[] {
  const results: SQLInjectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TAGGED_TEMPLATE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'tagged-template',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectStringConcatViolations(
  content: string,
  filePath: string
): SQLInjectionViolationInfo[] {
  const results: SQLInjectionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of STRING_CONCAT_VIOLATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'string-concatenation',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'String concatenation in SQL query - potential SQL injection vulnerability',
          suggestedFix: 'Use parameterized queries or prepared statements instead',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectTemplateLiteralViolations(
  content: string,
  filePath: string
): SQLInjectionViolationInfo[] {
  const results: SQLInjectionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TEMPLATE_LITERAL_VIOLATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'template-literal-injection',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Template literal with user input in SQL query - potential SQL injection',
          suggestedFix: 'Use tagged template literals (sql``) or parameterized queries',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectRawSQLViolations(
  content: string,
  filePath: string
): SQLInjectionViolationInfo[] {
  const results: SQLInjectionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of RAW_SQL_WITH_INPUT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'raw-sql-with-input',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Raw SQL query with interpolated values - potential SQL injection',
          suggestedFix: 'Use Prisma.sql tagged template or parameterized queries',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function analyzeSQLInjection(
  content: string,
  filePath: string
): SQLInjectionAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasParameterizedQueries: false,
      usesORM: false,
      hasViolations: false,
      confidence: 1.0,
    };
  }

  const patterns: SQLInjectionPatternInfo[] = [
    ...detectParameterizedQueries(content, filePath),
    ...detectPreparedStatements(content, filePath),
    ...detectORMQueries(content, filePath),
    ...detectQueryBuilders(content, filePath),
    ...detectEscapeFunctions(content, filePath),
    ...detectTaggedTemplates(content, filePath),
  ];

  const violations: SQLInjectionViolationInfo[] = [
    ...detectStringConcatViolations(content, filePath),
    ...detectTemplateLiteralViolations(content, filePath),
    ...detectRawSQLViolations(content, filePath),
  ];

  const hasParameterizedQueries = patterns.some(
    (p) => p.type === 'parameterized-query' || p.type === 'prepared-statement'
  );
  const usesORM = patterns.some(
    (p) => p.type === 'orm-query' || p.type === 'query-builder'
  );
  const hasViolations = violations.length > 0;

  const confidence = hasViolations ? 0.7 : hasParameterizedQueries || usesORM ? 0.95 : 0.8;

  return {
    patterns,
    violations,
    hasParameterizedQueries,
    usesORM,
    hasViolations,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class SQLInjectionDetector extends RegexDetector {
  readonly id = 'security/sql-injection';
  readonly name = 'SQL Injection Detector';
  readonly description =
    'Detects SQL injection prevention patterns and identifies potential vulnerabilities';
  readonly category: PatternCategory = 'security';
  readonly subcategory = 'sql-injection';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeSQLInjection(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    // Map severity: high -> error, medium -> warning, low -> info
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      ...v,
      severity: v.severity === 'high' ? 'error' : v.severity === 'medium' ? 'warning' : 'info',
      value: v.matchedText,
    }));

    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasParameterizedQueries: analysis.hasParameterizedQueries,
        usesORM: analysis.usesORM,
        hasViolations: analysis.hasViolations,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createSQLInjectionDetector(): SQLInjectionDetector {
  return new SQLInjectionDetector();
}
