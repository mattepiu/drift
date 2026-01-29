/**
 * Entity Framework Core Patterns Detector
 *
 * Detects EF Core usage patterns:
 * - DbContext inheritance and configuration
 * - DbSet<T> properties
 * - LINQ query patterns (Include, ThenInclude, AsNoTracking)
 * - Raw SQL patterns (FromSqlRaw, FromSqlInterpolated)
 * - SaveChanges patterns
 * - Transaction patterns
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface EfCorePatternInfo {
  /** Type of EF Core pattern */
  type: 'dbcontext' | 'dbset' | 'query' | 'include' | 'raw-sql' | 'save-changes' | 'transaction' | 'no-tracking';
  /** Entity type if applicable */
  entityType: string | null;
  /** Specific method or pattern */
  detail: string;
  /** Line number */
  line: number;
  /** File path */
  file: string;
}

export interface EfCoreAnalysis {
  /** All EF Core patterns found */
  patterns: EfCorePatternInfo[];
  /** DbContext classes found */
  dbContexts: string[];
  /** Entity types (DbSet<T>) */
  entityTypes: string[];
  /** Query methods used */
  queryMethods: string[];
  /** Whether using raw SQL */
  usesRawSql: boolean;
  /** Whether using AsNoTracking */
  usesNoTracking: boolean;
  /** Security concerns */
  securityConcerns: string[];
  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Patterns
// ============================================================================

const QUERY_METHODS = [
  'Where', 'Select', 'OrderBy', 'OrderByDescending', 'ThenBy', 'ThenByDescending',
  'Skip', 'Take', 'First', 'FirstOrDefault', 'Single', 'SingleOrDefault',
  'Any', 'All', 'Count', 'Sum', 'Average', 'Min', 'Max',
  'GroupBy', 'Join', 'Include', 'ThenInclude', 'AsNoTracking', 'AsTracking',
  'ToList', 'ToListAsync', 'ToArray', 'ToArrayAsync',
];

// ============================================================================
// Detector Implementation
// ============================================================================

export class EfCorePatternsDetector extends BaseDetector {
  readonly id = 'data-access/efcore-patterns';
  readonly category = 'data-access' as const;
  readonly subcategory = 'orm';
  readonly name = 'Entity Framework Core Patterns Detector';
  readonly description = 'Detects Entity Framework Core usage patterns and potential issues';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (!this.isRelevantFile(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeEfCore(content, file);
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    for (const pattern of analysis.patterns) {
      patterns.push({
        patternId: `${this.id}/${pattern.type}`,
        location: {
          file: pattern.file,
          line: pattern.line,
          column: 1,
        },
        confidence: analysis.confidence,
        isOutlier: false,
      });
    }

    violations.push(...this.detectViolations(analysis, file));

    return this.createResult(patterns, violations, analysis.confidence, {
      custom: {
        efCoreAnalysis: analysis,
      },
    });
  }

  private isRelevantFile(content: string): boolean {
    return (
      content.includes('DbContext') ||
      content.includes('DbSet<') ||
      content.includes('EntityFrameworkCore') ||
      content.includes('.Include(') ||
      content.includes('FromSqlRaw') ||
      content.includes('FromSqlInterpolated')
    );
  }

  analyzeEfCore(content: string, file: string): EfCoreAnalysis {
    const patterns: EfCorePatternInfo[] = [];
    const dbContexts: string[] = [];
    const entityTypes = new Set<string>();
    const queryMethods = new Set<string>();
    const securityConcerns: string[] = [];
    let usesRawSql = false;
    let usesNoTracking = false;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // Detect DbContext inheritance
      const dbContextMatch = line.match(/class\s+(\w+)\s*:\s*DbContext/);
      if (dbContextMatch?.[1]) {
        dbContexts.push(dbContextMatch[1]);
        patterns.push({
          type: 'dbcontext',
          entityType: null,
          detail: dbContextMatch[1],
          line: lineNum,
          file,
        });
      }

      // Detect DbSet<T> properties
      const dbSetMatch = line.match(/DbSet<(\w+)>/);
      if (dbSetMatch?.[1]) {
        entityTypes.add(dbSetMatch[1]);
        patterns.push({
          type: 'dbset',
          entityType: dbSetMatch[1],
          detail: `DbSet<${dbSetMatch[1]}>`,
          line: lineNum,
          file,
        });
      }

      // Detect Include/ThenInclude (eager loading)
      if (line.includes('.Include(') || line.includes('.ThenInclude(')) {
        const includeMatch = line.match(/\.(Include|ThenInclude)\s*\(/);
        if (includeMatch) {
          patterns.push({
            type: 'include',
            entityType: null,
            detail: includeMatch[1] || 'Include',
            line: lineNum,
            file,
          });
          queryMethods.add(includeMatch[1] || 'Include');
        }
      }

      // Detect AsNoTracking
      if (line.includes('.AsNoTracking()')) {
        usesNoTracking = true;
        patterns.push({
          type: 'no-tracking',
          entityType: null,
          detail: 'AsNoTracking',
          line: lineNum,
          file,
        });
        queryMethods.add('AsNoTracking');
      }

      // Detect raw SQL - potential security concern
      if (line.includes('FromSqlRaw')) {
        usesRawSql = true;
        patterns.push({
          type: 'raw-sql',
          entityType: null,
          detail: 'FromSqlRaw',
          line: lineNum,
          file,
        });

        // Check for string interpolation in FromSqlRaw (SQL injection risk)
        if (line.includes('FromSqlRaw($"') || line.includes('FromSqlRaw($@"')) {
          securityConcerns.push(`SQL injection risk: string interpolation in FromSqlRaw at line ${lineNum}`);
        }
      }

      // Detect FromSqlInterpolated (safer)
      if (line.includes('FromSqlInterpolated')) {
        usesRawSql = true;
        patterns.push({
          type: 'raw-sql',
          entityType: null,
          detail: 'FromSqlInterpolated',
          line: lineNum,
          file,
        });
      }

      // Detect SaveChanges
      if (line.includes('SaveChanges') || line.includes('SaveChangesAsync')) {
        patterns.push({
          type: 'save-changes',
          entityType: null,
          detail: line.includes('Async') ? 'SaveChangesAsync' : 'SaveChanges',
          line: lineNum,
          file,
        });
      }

      // Detect transactions
      if (line.includes('BeginTransaction') || line.includes('Database.BeginTransaction')) {
        patterns.push({
          type: 'transaction',
          entityType: null,
          detail: 'BeginTransaction',
          line: lineNum,
          file,
        });
      }

      // Detect common query methods
      for (const method of QUERY_METHODS) {
        if (line.includes(`.${method}(`)) {
          queryMethods.add(method);
        }
      }
    }

    return {
      patterns,
      dbContexts,
      entityTypes: Array.from(entityTypes),
      queryMethods: Array.from(queryMethods),
      usesRawSql,
      usesNoTracking,
      securityConcerns,
      confidence: patterns.length > 0 ? 0.9 : 0,
    };
  }

  private detectViolations(analysis: EfCoreAnalysis, file: string): Violation[] {
    const violations: Violation[] = [];

    for (const concern of analysis.securityConcerns) {
      const lineMatch = concern.match(/line (\d+)/);
      const lineNum = lineMatch ? parseInt(lineMatch[1] || '1', 10) : 1;

      violations.push({
        id: `${this.id}-${file}-${lineNum}-sql-injection`,
        patternId: this.id,
        severity: 'error',
        file,
        range: {
          start: { line: lineNum - 1, character: 0 },
          end: { line: lineNum - 1, character: 100 },
        },
        message: 'SQL Injection Risk: Use FromSqlInterpolated instead of FromSqlRaw with string interpolation',
        expected: 'FromSqlInterpolated($"...")',
        actual: 'FromSqlRaw($"...")',
        explanation: 'FromSqlRaw with string interpolation can lead to SQL injection. ' +
          'Use FromSqlInterpolated which properly parameterizes interpolated values, ' +
          'or use FromSqlRaw with explicit parameters.',
        aiExplainAvailable: true,
        aiFixAvailable: true,
        firstSeen: new Date(),
        occurrences: 1,
      });
    }

    return violations;
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createEfCorePatternsDetector(): EfCorePatternsDetector {
  return new EfCorePatternsDetector();
}
