/**
 * Laravel Performance Detector
 *
 * @module performance/laravel/performance-detector
 */

import { CacheExtractor } from './extractors/cache-extractor.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { LaravelPerformanceAnalysis } from './types.js';
import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { Language } from 'driftdetect-core';



export class LaravelPerformanceDetector extends BaseDetector {
  readonly id = 'performance/laravel-performance';
  readonly category = 'performance' as const;
  readonly subcategory = 'laravel';
  readonly name = 'Laravel Performance Detector';
  readonly description = 'Extracts performance patterns from Laravel code';
  readonly supportedLanguages: Language[] = ['php'];
  readonly detectionMethod = 'regex' as const;

  private readonly cacheExtractor: CacheExtractor;

  constructor() {
    super();
    this.cacheExtractor = new CacheExtractor();
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    if (!this.isLaravelCode(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzePerformance(content, file);

    return this.createResult([], [], analysis.confidence, {
      custom: { laravelPerformance: analysis, framework: 'laravel' },
    });
  }

  analyzePerformance(content: string, file: string): LaravelPerformanceAnalysis {
    const { usages: cache, confidence } = this.cacheExtractor.extract(content, file);
    return { cache, queue: [], eagerLoading: [], confidence };
  }

  generateQuickFix(): null {
    return null;
  }

  private isLaravelCode(content: string): boolean {
    return content.includes('Cache::') || content.includes('Queue::') || content.includes('->with(');
  }
}

export function createLaravelPerformanceDetector(): LaravelPerformanceDetector {
  return new LaravelPerformanceDetector();
}
