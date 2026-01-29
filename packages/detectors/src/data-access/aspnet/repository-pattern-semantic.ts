/**
 * Repository Pattern Detector for C# - SEMANTIC VERSION
 *
 * Truly language-agnostic detector that finds repository pattern implementations
 * by looking for semantic concepts, not syntax.
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (Repositories/, Data/, etc.)
 * - Surrounding code context (repository interfaces, implementations)
 * - Semantic disambiguation (Repository vs other patterns)
 *
 * Detects repository pattern implementations:
 * - IRepository<T> interfaces
 * - Generic repository implementations
 * - Unit of Work patterns
 * - Specification pattern
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

/** File paths that indicate repository pattern code */
const REPOSITORY_FILE_PATTERNS = [
  /repositor/i, /data/i, /persistence/i, /infrastructure/i,
  /dal/i, /dataaccess/i, /storage/i, /store/i,
  /unitofwork/i, /uow/i, /specification/i,
];

/** File paths that indicate NON-repository code (false positive sources) */
const NON_REPOSITORY_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /tests\//i, /specs\//i,
  /mock/i, /fake/i, /stub/i,
  /\.d\.ts$/i, /\.d\.cs$/i,
  /controller/i, /service/i, /handler/i,
];

/** Keywords in surrounding context that indicate repository usage */
const REPOSITORY_CONTEXT_KEYWORDS = [
  'irepository', 'repository', 'genericrepository', 'baserepository',
  'iunitofwork', 'unitofwork', 'ispecification', 'specification',
  'getbyid', 'getbyidasync', 'getall', 'getallasync',
  'add', 'addasync', 'update', 'updateasync', 'delete', 'deleteasync',
  'find', 'findasync', 'query', 'list', 'listasync',
  'savechanges', 'savechangesasync', 'commit', 'rollback',
  'dbcontext', 'dbset', 'entityframework',
];

/** Keywords that indicate NON-repository context usage */
const NON_REPOSITORY_CONTEXT_KEYWORDS = [
  'gitrepository', 'git', 'svn', 'vcs', 'sourcecontrol',
  'nuget', 'package', 'artifact', 'docker', 'container',
  'npm', 'yarn', 'maven', 'gradle',
];

// ============================================================================
// Repository Pattern Semantic Detector
// ============================================================================

export class RepositoryPatternSemanticDetector extends SemanticDetector {
  readonly id = 'data-access/repository-pattern';
  readonly name = 'Repository Pattern Detector';
  readonly description = 'Learns repository pattern implementations from your C# codebase';
  readonly category = 'data-access' as const;
  readonly subcategory = 'patterns';

  // C# specific - Repository pattern in .NET
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
   * Semantic keywords for Repository pattern detection
   * These are C#-specific repository concepts
   */
  protected getSemanticKeywords(): string[] {
    return [
      // High-confidence Repository keywords
      'IRepository', 'Repository', 'GenericRepository', 'BaseRepository',
      'IUnitOfWork', 'UnitOfWork', 'ISpecification', 'Specification',
      'RepositoryBase', 'AbstractRepository', 'CrudRepository',
      
      // Repository method patterns
      'GetById', 'GetByIdAsync', 'GetAll', 'GetAllAsync',
      'FindById', 'FindByIdAsync', 'FindAll', 'FindAllAsync',
      'Add', 'AddAsync', 'AddRange', 'AddRangeAsync',
      'Update', 'UpdateAsync', 'UpdateRange', 'UpdateRangeAsync',
      'Delete', 'DeleteAsync', 'Remove', 'RemoveAsync',
      'Save', 'SaveAsync', 'SaveChanges', 'SaveChangesAsync',
      'Count', 'CountAsync', 'Any', 'AnyAsync', 'Exists', 'ExistsAsync',
      
      // Specification pattern
      'IsSatisfiedBy', 'ToExpression', 'And', 'Or', 'Not',
      'Criteria', 'Includes', 'OrderBy', 'OrderByDescending',
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
    const lineLower = lineContent.toLowerCase();

    // Skip test files
    for (const pattern of NON_REPOSITORY_FILE_PATTERNS) {
      if (pattern.test(file)) {
        // Allow if it's specifically a repository test
        if (/repositor/i.test(file)) {
          continue;
        }
        return false;
      }
    }

    // High-confidence keywords always match (Repository specific)
    const highConfidenceKeywords = [
      'IRepository', 'Repository', 'GenericRepository', 'BaseRepository',
      'IUnitOfWork', 'UnitOfWork', 'ISpecification', 'Specification',
      'RepositoryBase', 'AbstractRepository', 'CrudRepository',
    ];
    if (highConfidenceKeywords.some(k => keyword.toLowerCase() === k.toLowerCase())) {
      // But filter out git/package repositories
      if (/git|nuget|package|artifact|docker|npm|yarn|maven/i.test(lineLower)) {
        return false;
      }
      return true;
    }

    // For ambiguous keywords like "Add", "Delete", "Update", apply context validation
    
    // Check for NON-repository context indicators (Git, package managers, etc.)
    for (const nonRepoKeyword of NON_REPOSITORY_CONTEXT_KEYWORDS) {
      if (contextLower.includes(nonRepoKeyword.toLowerCase())) {
        return false;
      }
    }

    // Check file path for repository patterns (strong positive signal)
    for (const pattern of REPOSITORY_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context for repository keywords
    const repoContextScore = REPOSITORY_CONTEXT_KEYWORDS.filter(k => 
      contextLower.includes(k.toLowerCase())
    ).length;
    const nonRepoContextScore = NON_REPOSITORY_CONTEXT_KEYWORDS.filter(k => 
      contextLower.includes(k.toLowerCase())
    ).length;

    // Require positive repository context for ambiguous keywords
    if (repoContextScore === 0 && nonRepoContextScore === 0) {
      // No clear context - check for common C# repository patterns
      if (/interface\s+I\w*Repository/i.test(lineContent)) {return true;}
      if (/class\s+\w*Repository/i.test(lineContent)) {return true;}
      if (/:\s*I\w*Repository/i.test(lineContent)) {return true;}
      if (/IRepository<\w+>/i.test(lineContent)) {return true;}
    }

    return repoContextScore > nonRepoContextScore;
  }

  /**
   * Create violation for inconsistent repository pattern
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
      message: `Inconsistent repository pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for repository pattern in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createRepositoryPatternSemanticDetector(): RepositoryPatternSemanticDetector {
  return new RepositoryPatternSemanticDetector();
}
