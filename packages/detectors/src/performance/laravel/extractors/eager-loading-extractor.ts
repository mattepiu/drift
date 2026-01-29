/**
 * Laravel Eager Loading Extractor
 *
 * Extracts eager loading patterns and detects N+1 query issues.
 *
 * @module performance/laravel/extractors/eager-loading-extractor
 */

import type { EagerLoadingInfo } from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * With eager loading
 */
const WITH_PATTERN = /(\w+)::(?:query\s*\(\s*\)\s*->)?with\s*\(\s*\[?([^\])]+)\]?\s*\)/g;

/**
 * Load method
 */
const LOAD_PATTERN = /->load\s*\(\s*\[?([^\])]+)\]?\s*\)/g;

/**
 * LoadMissing method
 */
const LOAD_MISSING_PATTERN = /->loadMissing\s*\(\s*\[?([^\])]+)\]?\s*\)/g;

// Note: These patterns are defined for future use in count-based eager loading
// const LOAD_COUNT_PATTERN = /->loadCount\s*\(\s*\[?([^\])]+)\]?\s*\)/g;
// const WITH_COUNT_PATTERN = /->withCount\s*\(\s*\[?([^\])]+)\]?\s*\)/g;

// Note: Defined for future use in relationship access detection
// const RELATIONSHIP_ACCESS_PATTERN = /\$(\w+)->(\w+)(?:->|\s|;|\))/g;

/**
 * Potential N+1 - accessing relationship in loop
 */
const FOREACH_PATTERN = /foreach\s*\(\s*(\w+)(?:::all\s*\(\s*\)|::get\s*\(\s*\))\s+as\s+\$(\w+)\s*\)/g;

/**
 * Model $with property
 */
const MODEL_WITH_PATTERN = /protected\s+\$with\s*=\s*\[([\s\S]*?)\]/;

/**
 * Model $withCount property
 */
const MODEL_WITH_COUNT_PATTERN = /protected\s+\$withCount\s*=\s*\[([\s\S]*?)\]/;

// ============================================================================
// Extended Types
// ============================================================================

/**
 * N+1 query issue
 */
export interface NPlusOneIssue {
  /** Model being iterated */
  model: string;
  /** Variable name */
  variable: string;
  /** Relationships accessed */
  relationships: string[];
  /** File path */
  file: string;
  /** Line number */
  line: number;
}

/**
 * Eager loading extraction result
 */
export interface EagerLoadingExtractionResult {
  /** Eager loading usages */
  eagerLoads: EagerLoadingInfo[];
  /** Potential N+1 issues */
  nPlusOneIssues: NPlusOneIssue[];
  /** Model default eager loads */
  modelDefaults: ModelEagerLoadDefaults[];
  /** Confidence score */
  confidence: number;
}

/**
 * Model default eager loads
 */
export interface ModelEagerLoadDefaults {
  /** Model name */
  model: string;
  /** Default relations */
  with: string[];
  /** Default counts */
  withCount: string[];
  /** File path */
  file: string;
  /** Line number */
  line: number;
}

// ============================================================================
// Eager Loading Extractor
// ============================================================================

/**
 * Extracts eager loading patterns from Laravel code
 */
export class EagerLoadingExtractor {
  /**
   * Extract all eager loading patterns from content
   */
  extract(content: string, file: string): EagerLoadingExtractionResult {
    const eagerLoads = this.extractEagerLoads(content, file);
    const nPlusOneIssues = this.detectNPlusOneIssues(content, file);
    const modelDefaults = this.extractModelDefaults(content, file);
    const confidence = eagerLoads.length > 0 || nPlusOneIssues.length > 0 ? 0.9 : 0;

    return {
      eagerLoads,
      nPlusOneIssues,
      modelDefaults,
      confidence,
    };
  }

  /**
   * Check if content contains eager loading patterns
   */
  hasEagerLoadingPatterns(content: string): boolean {
    return (
      /::with\s*\(/.test(content) ||
      /->with\s*\(/.test(content) ||
      content.includes('->load(') ||
      content.includes('->loadMissing(') ||
      content.includes('$with')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract eager loading usages
   */
  private extractEagerLoads(content: string, file: string): EagerLoadingInfo[] {
    const eagerLoads: EagerLoadingInfo[] = [];

    // With pattern
    WITH_PATTERN.lastIndex = 0;
    let match;
    while ((match = WITH_PATTERN.exec(content)) !== null) {
      const model = match[1] || '';
      const relationsStr = match[2] || '';
      const line = this.getLineNumber(content, match.index);
      const relations = this.parseRelations(relationsStr);

      eagerLoads.push({
        model,
        relations,
        file,
        line,
      });
    }

    // Load pattern
    LOAD_PATTERN.lastIndex = 0;
    while ((match = LOAD_PATTERN.exec(content)) !== null) {
      const relationsStr = match[1] || '';
      const line = this.getLineNumber(content, match.index);
      const relations = this.parseRelations(relationsStr);

      eagerLoads.push({
        model: 'unknown',
        relations,
        file,
        line,
      });
    }

    // LoadMissing pattern
    LOAD_MISSING_PATTERN.lastIndex = 0;
    while ((match = LOAD_MISSING_PATTERN.exec(content)) !== null) {
      const relationsStr = match[1] || '';
      const line = this.getLineNumber(content, match.index);
      const relations = this.parseRelations(relationsStr);

      eagerLoads.push({
        model: 'unknown',
        relations,
        file,
        line,
      });
    }

    return eagerLoads;
  }

  /**
   * Detect potential N+1 query issues
   */
  private detectNPlusOneIssues(content: string, file: string): NPlusOneIssue[] {
    const issues: NPlusOneIssue[] = [];
    FOREACH_PATTERN.lastIndex = 0;

    let match;
    while ((match = FOREACH_PATTERN.exec(content)) !== null) {
      const model = match[1] || '';
      const variable = match[2] || '';
      const line = this.getLineNumber(content, match.index);

      // Find the loop body
      const loopStart = content.indexOf('{', match.index);
      if (loopStart === -1) {continue;}

      const loopBody = this.extractBlockBody(content, loopStart);

      // Find relationship accesses in the loop
      const relationships = this.findRelationshipAccesses(loopBody, variable);

      if (relationships.length > 0) {
        issues.push({
          model,
          variable,
          relationships,
          file,
          line,
        });
      }
    }

    return issues;
  }

  /**
   * Extract model default eager loads
   */
  private extractModelDefaults(content: string, file: string): ModelEagerLoadDefaults[] {
    const defaults: ModelEagerLoadDefaults[] = [];

    // Check if this is a model file
    const modelMatch = content.match(/class\s+(\w+)\s+extends\s+(?:Illuminate\\Database\\Eloquent\\)?Model/);
    if (!modelMatch) {return defaults;}

    const model = modelMatch[1] || '';
    const line = modelMatch.index !== undefined ? this.getLineNumber(content, modelMatch.index) : 1;

    // Extract $with property
    const withMatch = content.match(MODEL_WITH_PATTERN);
    const withRelations = withMatch ? this.parseRelations(withMatch[1] || '') : [];

    // Extract $withCount property
    const withCountMatch = content.match(MODEL_WITH_COUNT_PATTERN);
    const withCountRelations = withCountMatch ? this.parseRelations(withCountMatch[1] || '') : [];

    if (withRelations.length > 0 || withCountRelations.length > 0) {
      defaults.push({
        model,
        with: withRelations,
        withCount: withCountRelations,
        file,
        line,
      });
    }

    return defaults;
  }

  /**
   * Find relationship accesses for a variable
   */
  private findRelationshipAccesses(content: string, variable: string): string[] {
    const relationships: string[] = [];
    const pattern = new RegExp(`\\$${variable}->(\\w+)(?:->|\\s|;|\\))`, 'g');

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const prop = match[1] || '';
      // Skip common non-relationship properties
      if (!['id', 'name', 'email', 'created_at', 'updated_at', 'deleted_at'].includes(prop)) {
        if (!relationships.includes(prop)) {
          relationships.push(prop);
        }
      }
    }

    return relationships;
  }

  /**
   * Parse relations from string
   */
  private parseRelations(relationsStr: string): string[] {
    return relationsStr
      .split(',')
      .map(r => r.trim().replace(/['"]/g, '').split(':')[0] || '')
      .filter(Boolean);
  }

  /**
   * Extract block body
   */
  private extractBlockBody(content: string, startIndex: number): string {
    let depth = 1;
    let i = startIndex + 1;

    while (i < content.length && depth > 0) {
      if (content[i] === '{') {depth++;}
      else if (content[i] === '}') {depth--;}
      i++;
    }

    return content.substring(startIndex + 1, i - 1);
  }

  /**
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new eager loading extractor
 */
export function createEagerLoadingExtractor(): EagerLoadingExtractor {
  return new EagerLoadingExtractor();
}
