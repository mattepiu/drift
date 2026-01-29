/**
 * Entity Framework Core Patterns Detector - SEMANTIC VERSION
 *
 * Truly language-agnostic detector that finds EF Core patterns
 * by looking for semantic concepts, not syntax.
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (Data/, Repositories/, etc.)
 * - Surrounding code context (EF Core imports, DbContext patterns)
 * - Semantic disambiguation (DbContext vs other contexts)
 *
 * Detects EF Core usage patterns:
 * - DbContext inheritance and configuration
 * - DbSet<T> properties
 * - LINQ query patterns (Include, ThenInclude, AsNoTracking)
 * - Raw SQL patterns (FromSqlRaw, FromSqlInterpolated)
 * - SaveChanges patterns
 * - Transaction patterns
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

// ============================================================================
// Context Validation Patterns
// ============================================================================

/** File paths that indicate EF Core / data access code */
const EFCORE_FILE_PATTERNS = [
  /data/i, /context/i, /dbcontext/i, /repository/i, /repositories/i,
  /persistence/i, /infrastructure/i, /entities/i, /models/i,
  /ef/i, /entityframework/i, /migrations/i,
];

/** File paths that indicate NON-EF Core code (false positive sources) */
const NON_EFCORE_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /tests\//i, /specs\//i,
  /mock/i, /fake/i, /stub/i,
  /\.d\.ts$/i, /\.d\.cs$/i,
];

/** Keywords in surrounding context that indicate EF Core usage */
const EFCORE_CONTEXT_KEYWORDS = [
  'entityframeworkcore', 'entityframework', 'microsoft.entityframeworkcore',
  'dbcontext', 'dbset', 'modelbuilder', 'onmodelcreating',
  'haskey', 'hasmany', 'hasone', 'withone', 'withmany',
  'tolist', 'tolistasync', 'firstordefault', 'firstordefaultasync',
  'savechanges', 'savechangesasync', 'addrange', 'removerange',
  'asnotracking', 'astracking', 'include', 'theninclude',
  'fromsqlraw', 'fromsqlinterpolated', 'executesqlraw',
];

/** Keywords that indicate NON-EF Core context usage */
const NON_EFCORE_CONTEXT_KEYWORDS = [
  'react', 'angular', 'vue', 'component', 'render',
  'usecontext', 'createcontext', 'contextprovider',
  'applicationcontext', 'springcontext', 'beancontext',
];

// ============================================================================
// EF Core Semantic Detector
// ============================================================================

export class EfCorePatternsSemanticDetector extends SemanticDetector {
  readonly id = 'data-access/efcore-patterns';
  readonly name = 'Entity Framework Core Patterns Detector';
  readonly description = 'Learns Entity Framework Core usage patterns from your codebase';
  readonly category = 'data-access' as const;
  readonly subcategory = 'orm';

  // C# specific - EF Core is a .NET technology
  override readonly supportedLanguages: Language[] = ['csharp'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: false,
    });
  }

  /**
   * Semantic keywords for EF Core detection
   * These are C#-specific EF Core concepts
   */
  protected getSemanticKeywords(): string[] {
    return [
      // High-confidence EF Core keywords
      'DbContext', 'DbSet', 'OnModelCreating', 'ModelBuilder',
      'SaveChanges', 'SaveChangesAsync', 'AddAsync', 'AddRangeAsync',
      'Include', 'ThenInclude', 'AsNoTracking', 'AsTracking',
      'FromSqlRaw', 'FromSqlInterpolated', 'ExecuteSqlRaw', 'ExecuteSqlRawAsync',
      'HasKey', 'HasMany', 'HasOne', 'WithOne', 'WithMany',
      'ToTable', 'HasIndex', 'IsRequired', 'HasMaxLength',
      
      // Medium-confidence (need context validation)
      'Entity', 'Entities', 'Migration', 'Migrations',
      'FirstOrDefault', 'FirstOrDefaultAsync', 'SingleOrDefault', 'SingleOrDefaultAsync',
      'ToList', 'ToListAsync', 'ToArray', 'ToArrayAsync',
      'Where', 'Select', 'OrderBy', 'OrderByDescending',
      'BeginTransaction', 'CommitAsync', 'RollbackAsync',
    ];
  }

  protected getSemanticCategory(): string {
    return 'data-access';
  }

  /**
   * Context-aware filtering to eliminate false positives
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    // Skip test files
    for (const pattern of NON_EFCORE_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return false;
      }
    }

    // High-confidence keywords always match (EF Core specific)
    const highConfidenceKeywords = [
      'DbContext', 'DbSet', 'OnModelCreating', 'ModelBuilder',
      'FromSqlRaw', 'FromSqlInterpolated', 'ExecuteSqlRaw',
      'AsNoTracking', 'ThenInclude', 'HasKey', 'HasMany', 'HasOne',
      'ToTable', 'HasIndex', 'SaveChangesAsync',
    ];
    if (highConfidenceKeywords.some(k => keyword.toLowerCase() === k.toLowerCase())) {
      return true;
    }

    // For ambiguous keywords like "Include", "Where", "Select", apply context validation
    
    // Check for NON-EF Core context indicators (React Context, Spring Context, etc.)
    for (const nonEfKeyword of NON_EFCORE_CONTEXT_KEYWORDS) {
      if (contextLower.includes(nonEfKeyword.toLowerCase())) {
        return false;
      }
    }

    // Check file path for EF Core patterns (strong positive signal)
    for (const pattern of EFCORE_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context for EF Core keywords
    const efCoreContextScore = EFCORE_CONTEXT_KEYWORDS.filter(k => 
      contextLower.includes(k.toLowerCase())
    ).length;
    const nonEfCoreContextScore = NON_EFCORE_CONTEXT_KEYWORDS.filter(k => 
      contextLower.includes(k.toLowerCase())
    ).length;

    // Require positive EF Core context for ambiguous keywords
    if (efCoreContextScore === 0 && nonEfCoreContextScore === 0) {
      // No clear context - check for common C# EF Core patterns
      if (/:\s*DbContext/i.test(lineContent)) {return true;} // Inherits DbContext
      if (/DbSet<\w+>/i.test(lineContent)) {return true;} // DbSet property
      if (/\.Include\s*\(\s*\w+\s*=>/i.test(lineContent)) {return true;} // Include with lambda
    }

    return efCoreContextScore > nonEfCoreContextScore;
  }

  /**
   * Create violation for inconsistent EF Core pattern
   */
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
      message: `Inconsistent EF Core pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for EF Core data access in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createEfCorePatternsSemanticDetector(): EfCorePatternsSemanticDetector {
  return new EfCorePatternsSemanticDetector();
}
