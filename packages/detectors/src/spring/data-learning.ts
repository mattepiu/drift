/**
 * Spring Data Access Patterns Detector - LEARNING VERSION
 *
 * Learns data access patterns from the user's codebase:
 * - Repository interface preferences (JpaRepository vs CrudRepository)
 * - Query method conventions (@Query vs derived queries)
 * - Entity relationship patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import { SPRING_KEYWORD_GROUPS } from './keywords.js';
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

export type RepositoryType = 'JpaRepository' | 'CrudRepository' | 'PagingAndSortingRepository' | 'Repository';
export type QueryStyle = 'annotation' | 'derived' | 'native';
export type FetchStrategy = 'LAZY' | 'EAGER';

export interface SpringDataConventions {
  [key: string]: unknown;
  /** Preferred repository base interface */
  repositoryType: RepositoryType;
  /** Preferred query style */
  queryStyle: QueryStyle;
  /** Default fetch strategy for relationships */
  fetchStrategy: FetchStrategy;
}

interface DataPatternInfo {
  repositoryType: RepositoryType | null;
  queryStyle: QueryStyle | null;
  fetchStrategy: FetchStrategy | null;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractDataPatterns(content: string, file: string): DataPatternInfo[] {
  const results: DataPatternInfo[] = [];
  
  const keywords = SPRING_KEYWORD_GROUPS.data.keywords;
  const repositoryTypes: RepositoryType[] = ['JpaRepository', 'CrudRepository', 'PagingAndSortingRepository', 'Repository'];
  
  for (const keyword of keywords) {
    const pattern = new RegExp(`@?${keyword}\\b`, 'g');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip imports
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.slice(lineStart, content.indexOf('\n', match.index));
      if (lineContent.trim().startsWith('import ')) {continue;}
      
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      // Determine repository type
      let repositoryType: RepositoryType | null = null;
      for (const rt of repositoryTypes) {
        if (keyword === rt || lineContent.includes(`extends ${rt}`)) {
          repositoryType = rt;
          break;
        }
      }
      
      // Determine query style
      let queryStyle: QueryStyle | null = null;
      if (keyword === 'Query') {
        // Check if it's a native query
        const queryContext = content.slice(match.index, Math.min(content.length, match.index + 200));
        if (/nativeQuery\s*=\s*true/.test(queryContext)) {
          queryStyle = 'native';
        } else {
          queryStyle = 'annotation';
        }
      }
      
      // Determine fetch strategy
      let fetchStrategy: FetchStrategy | null = null;
      if (keyword === 'LAZY' || keyword === 'FetchType' && /LAZY/.test(lineContent)) {
        fetchStrategy = 'LAZY';
      } else if (keyword === 'EAGER' || keyword === 'FetchType' && /EAGER/.test(lineContent)) {
        fetchStrategy = 'EAGER';
      }

      // Only add if we found something meaningful
      if (repositoryType || queryStyle || fetchStrategy) {
        results.push({
          repositoryType,
          queryStyle,
          fetchStrategy,
          line,
          column,
          file,
        });
      }
    }
  }
  
  // Also check for derived query methods (findBy*, getBy*, etc.)
  const derivedQueryPattern = /(?:find|get|read|query|search|stream|count|exists|delete|remove)By\w+/g;
  let derivedMatch;
  while ((derivedMatch = derivedQueryPattern.exec(content)) !== null) {
    const lineStart = content.lastIndexOf('\n', derivedMatch.index) + 1;
    const lineContent = content.slice(lineStart, content.indexOf('\n', derivedMatch.index));
    if (lineContent.trim().startsWith('import ')) {continue;}
    
    const beforeMatch = content.slice(0, derivedMatch.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = derivedMatch.index - lastNewline;
    
    results.push({
      repositoryType: null,
      queryStyle: 'derived',
      fetchStrategy: null,
      line,
      column,
      file,
    });
  }
  
  return results;
}

// ============================================================================
// Learning Detector
// ============================================================================

export class SpringDataLearningDetector extends LearningDetector<SpringDataConventions> {
  readonly id = 'spring/data-patterns-learning';
  readonly category = 'data-access' as const;
  readonly subcategory = 'spring-data';
  readonly name = 'Spring Data Patterns Detector (Learning)';
  readonly description = 'Learns data access patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringDataConventions> {
    return ['repositoryType', 'queryStyle', 'fetchStrategy'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringDataConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractDataPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const repositoryTypeDist = distributions.get('repositoryType')!;
    const queryStyleDist = distributions.get('queryStyle')!;
    const fetchStrategyDist = distributions.get('fetchStrategy')!;

    for (const pattern of patterns) {
      if (pattern.repositoryType) {
        repositoryTypeDist.add(pattern.repositoryType, context.file);
      }
      if (pattern.queryStyle) {
        queryStyleDist.add(pattern.queryStyle, context.file);
      }
      if (pattern.fetchStrategy) {
        fetchStrategyDist.add(pattern.fetchStrategy, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringDataConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractDataPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedRepoType = conventions.conventions.repositoryType?.value;
    const learnedQueryStyle = conventions.conventions.queryStyle?.value;
    const learnedFetchStrategy = conventions.conventions.fetchStrategy?.value;

    // Check for repository type consistency
    if (learnedRepoType) {
      for (const pattern of foundPatterns) {
        if (pattern.repositoryType && pattern.repositoryType !== learnedRepoType) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'repository type', pattern.repositoryType, learnedRepoType,
            `Using ${pattern.repositoryType} but project prefers ${learnedRepoType}`
          ));
        }
      }
    }

    // Check for query style consistency
    if (learnedQueryStyle) {
      for (const pattern of foundPatterns) {
        if (pattern.queryStyle && pattern.queryStyle !== learnedQueryStyle) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'query style', pattern.queryStyle, learnedQueryStyle,
            `Using ${pattern.queryStyle} queries but project prefers ${learnedQueryStyle}`
          ));
        }
      }
    }

    // Check for fetch strategy consistency
    if (learnedFetchStrategy) {
      for (const pattern of foundPatterns) {
        if (pattern.fetchStrategy && pattern.fetchStrategy !== learnedFetchStrategy) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'fetch strategy', pattern.fetchStrategy, learnedFetchStrategy,
            `Using ${pattern.fetchStrategy} fetch but project prefers ${learnedFetchStrategy}`
          ));
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/data`,
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

export function createSpringDataLearningDetector(): SpringDataLearningDetector {
  return new SpringDataLearningDetector();
}
