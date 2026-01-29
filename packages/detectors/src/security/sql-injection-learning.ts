/**
 * SQL Injection Prevention Detector - LEARNING VERSION
 *
 * Learns SQL injection prevention patterns from the user's codebase:
 * - Query building approach (ORM, parameterized, tagged templates)
 * - Escape function usage
 * - Input validation patterns
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

import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type QueryMethod = 'orm' | 'parameterized' | 'tagged-template' | 'escaped' | 'raw';
export type ORMType = 'prisma' | 'drizzle' | 'typeorm' | 'sequelize' | 'knex' | 'none';

export interface SQLInjectionConventions {
  [key: string]: unknown;
  queryMethod: QueryMethod;
  ormType: ORMType;
  usesEscaping: boolean;
  usesValidation: boolean;
}

interface QueryInfo {
  method: QueryMethod;
  orm: ORMType;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const ORM_PATTERNS: Array<{ pattern: RegExp; orm: ORMType }> = [
  { pattern: /import.*from\s+['"]@prisma\/client['"]/i, orm: 'prisma' },
  { pattern: /import.*from\s+['"]drizzle-orm['"]/i, orm: 'drizzle' },
  { pattern: /import.*from\s+['"]typeorm['"]/i, orm: 'typeorm' },
  { pattern: /import.*from\s+['"]sequelize['"]/i, orm: 'sequelize' },
  { pattern: /import.*from\s+['"]knex['"]/i, orm: 'knex' },
];

const QUERY_PATTERNS = {
  parameterized: /\?\s*,|\$\d+|:\w+/g,
  taggedTemplate: /sql`|Prisma\.sql`|db\.query`/g,
  escaped: /escape\(|sanitize\(|quote\(/gi,
  raw: /query\s*\(\s*['"`](?:SELECT|INSERT|UPDATE|DELETE)/gi,
};

function extractQueryPatterns(content: string, file: string): QueryInfo[] {
  const queries: QueryInfo[] = [];
  
  // Detect ORM
  let detectedOrm: ORMType = 'none';
  for (const { pattern, orm } of ORM_PATTERNS) {
    if (pattern.test(content)) {
      detectedOrm = orm;
      break;
    }
  }
  
  // Detect query methods
  for (const [method, regex] of Object.entries(QUERY_PATTERNS)) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      queries.push({
        method: method as QueryMethod,
        orm: detectedOrm,
        line: lineNumber,
        column,
        file,
      });
    }
  }
  
  // If ORM detected but no specific query patterns, mark as ORM
  if (detectedOrm !== 'none' && queries.length === 0) {
    queries.push({
      method: 'orm',
      orm: detectedOrm,
      line: 1,
      column: 1,
      file,
    });
  }
  
  return queries;
}

// ============================================================================
// Learning SQL Injection Detector
// ============================================================================

export class SQLInjectionLearningDetector extends LearningDetector<SQLInjectionConventions> {
  readonly id = 'security/sql-injection';
  readonly category = 'security' as const;
  readonly subcategory = 'sql-injection';
  readonly name = 'SQL Injection Prevention Detector (Learning)';
  readonly description = 'Learns SQL injection prevention patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof SQLInjectionConventions> {
    return ['queryMethod', 'ormType', 'usesEscaping', 'usesValidation'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SQLInjectionConventions, ValueDistribution>
  ): void {
    const queries = extractQueryPatterns(context.content, context.file);
    
    const methodDist = distributions.get('queryMethod')!;
    const ormDist = distributions.get('ormType')!;
    const escapeDist = distributions.get('usesEscaping')!;
    const validationDist = distributions.get('usesValidation')!;
    
    for (const query of queries) {
      methodDist.add(query.method, context.file);
      if (query.orm !== 'none') {
        ormDist.add(query.orm, context.file);
      }
    }
    
    const usesEscaping = /escape\(|sanitize\(|quote\(/i.test(context.content);
    const usesValidation = /validate|schema\.parse|zod|yup|joi/i.test(context.content);
    
    if (queries.length > 0) {
      escapeDist.add(usesEscaping, context.file);
      validationDist.add(usesValidation, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SQLInjectionConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const queries = extractQueryPatterns(context.content, context.file);
    const learnedMethod = conventions.conventions.queryMethod?.value;
    const learnedOrm = conventions.conventions.ormType?.value;
    
    for (const query of queries) {
      // Flag raw queries when project uses safer methods
      if (learnedMethod && learnedMethod !== 'raw' && query.method === 'raw') {
        violations.push(this.createConventionViolation(
          query.file,
          query.line,
          query.column,
          'SQL query method',
          'raw',
          learnedMethod,
          `Using raw SQL but your project uses '${learnedMethod}' for queries`
        ));
      }
      
      // Flag ORM inconsistency
      if (learnedOrm && learnedOrm !== 'none' && query.orm !== 'none' && query.orm !== learnedOrm) {
        violations.push(this.createConventionViolation(
          query.file,
          query.line,
          query.column,
          'ORM',
          query.orm,
          learnedOrm,
          `Using '${query.orm}' but your project uses '${learnedOrm}'`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${query.method}`,
        location: { file: context.file, line: query.line, column: query.column },
        confidence: 1.0,
        isOutlier: query.method === 'raw',
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createSQLInjectionLearningDetector(): SQLInjectionLearningDetector {
  return new SQLInjectionLearningDetector();
}
