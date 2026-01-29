/**
 * Laravel Eloquent Patterns Detector - SEMANTIC VERSION
 *
 * Learns Eloquent ORM patterns from your Laravel codebase:
 * - Model definitions and conventions
 * - Relationship patterns (hasOne, hasMany, belongsTo, etc.)
 * - Query builder patterns
 * - Scope definitions
 * - Accessor/mutator patterns
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

const ELOQUENT_FILE_PATTERNS = [
  /models\//i, /entities\//i, /repositories\//i,
  /services\//i, /controllers\//i,
];

const NON_ELOQUENT_FILE_PATTERNS = [
  /migrations\//i, /seeders\//i, /factories\//i,
  /\.blade\.php$/i, /views\//i,
];

const ELOQUENT_CONTEXT_KEYWORDS = [
  'illuminate\\database\\eloquent',
  'extends model', 'extends authenticatable',
  '$fillable', '$guarded', '$hidden', '$casts',
  'hasmany', 'hasone', 'belongsto', 'belongstomany',
  'morphto', 'morphmany', 'morphtomany',
  'eloquent', 'query()', 'where(', 'find(', 'first(',
];

// ============================================================================
// Laravel Eloquent Semantic Detector
// ============================================================================

export class LaravelEloquentSemanticDetector extends SemanticDetector {
  readonly id = 'data-access/laravel-eloquent-semantic';
  readonly name = 'Laravel Eloquent Patterns Detector';
  readonly description = 'Learns Eloquent ORM patterns from your Laravel codebase';
  readonly category = 'data-access' as const;
  readonly subcategory = 'laravel';

  override readonly supportedLanguages: Language[] = ['php'];

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
    return [
      // Model patterns
      'Model', 'Eloquent', 'fillable', 'guarded', 'hidden', 'casts',
      'timestamps', 'primaryKey', 'table', 'connection',
      
      // Relationships
      'hasOne', 'hasMany', 'belongsTo', 'belongsToMany',
      'hasOneThrough', 'hasManyThrough',
      'morphTo', 'morphOne', 'morphMany', 'morphToMany', 'morphedByMany',
      'withPivot', 'withTimestamps',
      
      // Query builder
      'where', 'orWhere', 'whereIn', 'whereNotIn', 'whereBetween',
      'whereNull', 'whereNotNull', 'whereHas', 'whereDoesntHave',
      'orderBy', 'groupBy', 'having', 'limit', 'offset',
      'select', 'addSelect', 'distinct',
      'join', 'leftJoin', 'rightJoin', 'crossJoin',
      'with', 'load', 'loadMissing',
      'find', 'findOrFail', 'first', 'firstOrFail', 'firstOrCreate',
      'get', 'all', 'pluck', 'count', 'sum', 'avg', 'max', 'min',
      'create', 'update', 'delete', 'forceDelete', 'restore',
      'save', 'push', 'touch',
      
      // Scopes
      'scope', 'scopeActive', 'scopePublished',
      
      // Accessors/Mutators
      'Attribute', 'getAttribute', 'setAttribute',
      
      // Events
      'creating', 'created', 'updating', 'updated',
      'saving', 'saved', 'deleting', 'deleted',
    ];
  }

  protected getSemanticCategory(): string {
    return 'data-access';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    // High-confidence keywords
    const highConfidenceKeywords = [
      'Model', 'Eloquent', 'fillable', 'guarded', 'hasOne', 'hasMany',
      'belongsTo', 'belongsToMany', 'morphTo', 'morphMany',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    // Skip non-eloquent files
    for (const pattern of NON_ELOQUENT_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const hasContext = ELOQUENT_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (!hasContext) {return false;}
      }
    }

    // Skip comments
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // For ambiguous keywords, require Eloquent context
    const ambiguousKeywords = ['where', 'find', 'first', 'get', 'create', 'update', 'delete', 'save'];
    if (ambiguousKeywords.includes(keyword.toLowerCase())) {
      const hasContext = ELOQUENT_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inEloquentFile = ELOQUENT_FILE_PATTERNS.some(p => p.test(file));
        if (!inEloquentFile) {return false;}
      }
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
      message: `Inconsistent Eloquent pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for Eloquent in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelEloquentSemanticDetector(): LaravelEloquentSemanticDetector {
  return new LaravelEloquentSemanticDetector();
}
