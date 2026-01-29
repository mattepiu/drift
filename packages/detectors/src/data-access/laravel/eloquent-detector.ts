/**
 * Laravel Eloquent Detector
 *
 * Main detector for Laravel Eloquent ORM patterns.
 * Orchestrates Model and Query Builder extraction.
 *
 * @module data-access/laravel/eloquent-detector
 */

import { EloquentModelExtractor } from './extractors/eloquent-model-extractor.js';
import { QueryBuilderExtractor } from './extractors/query-builder-extractor.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { LaravelDataAccessAnalysis } from './types.js';
import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { Language } from 'driftdetect-core';

// ============================================================================
// Laravel Eloquent Detector
// ============================================================================

/**
 * Detects Laravel Eloquent ORM patterns.
 *
 * Supports:
 * - Eloquent model definitions
 * - Relationships (hasOne, hasMany, belongsTo, etc.)
 * - Scopes and accessors/mutators
 * - Query builder patterns
 * - Raw queries (security concern detection)
 * - N+1 query detection hints
 */
export class LaravelEloquentDetector extends BaseDetector {
  readonly id = 'data-access/laravel-eloquent';
  readonly category = 'data-access' as const;
  readonly subcategory = 'laravel';
  readonly name = 'Laravel Eloquent Detector';
  readonly description = 'Extracts Eloquent ORM patterns from Laravel code';
  readonly supportedLanguages: Language[] = ['php'];
  readonly detectionMethod = 'regex' as const;

  private readonly modelExtractor: EloquentModelExtractor;
  private readonly queryExtractor: QueryBuilderExtractor;

  constructor() {
    super();
    this.modelExtractor = new EloquentModelExtractor();
    this.queryExtractor = new QueryBuilderExtractor();
  }

  /**
   * Detect Laravel Eloquent patterns.
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    if (!this.isLaravelCode(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeDataAccess(content, file);

    return this.createResult([], [], analysis.confidence, {
      custom: { laravelDataAccess: analysis, framework: 'laravel' },
    });
  }

  /**
   * Analyze Laravel data access patterns for external use.
   */
  analyzeDataAccess(content: string, file: string): LaravelDataAccessAnalysis {
    const models = this.modelExtractor.extract(content, file);
    const queries = this.queryExtractor.extract(content, file);

    // Calculate overall confidence
    const confidences = [models.confidence, queries.confidence];
    const nonZeroConfidences = confidences.filter(c => c > 0);
    const confidence = nonZeroConfidences.length > 0
      ? nonZeroConfidences.reduce((a, b) => a + b, 0) / nonZeroConfidences.length
      : 0;

    return {
      models,
      queries,
      confidence,
    };
  }

  generateQuickFix(): null {
    return null;
  }

  private isLaravelCode(content: string): boolean {
    return (
      content.includes('use Illuminate\\') ||
      content.includes('extends Model') ||
      content.includes('DB::') ||
      content.includes('Eloquent')
    );
  }
}

/**
 * Create a new Laravel Eloquent detector.
 */
export function createLaravelEloquentDetector(): LaravelEloquentDetector {
  return new LaravelEloquentDetector();
}
