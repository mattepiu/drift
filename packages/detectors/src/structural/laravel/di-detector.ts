/**
 * Laravel DI Detector
 *
 * @module structural/laravel/di-detector
 */

import { ServiceProviderExtractor } from './extractors/service-provider-extractor.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { LaravelStructuralAnalysis } from './types.js';
import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { Language } from 'driftdetect-core';



export class LaravelDIDetector extends BaseDetector {
  readonly id = 'structural/laravel-di';
  readonly category = 'structural' as const;
  readonly subcategory = 'laravel';
  readonly name = 'Laravel DI Detector';
  readonly description = 'Extracts dependency injection patterns from Laravel code';
  readonly supportedLanguages: Language[] = ['php'];
  readonly detectionMethod = 'regex' as const;

  private readonly providerExtractor: ServiceProviderExtractor;

  constructor() {
    super();
    this.providerExtractor = new ServiceProviderExtractor();
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    if (!this.isLaravelCode(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeStructure(content, file);

    return this.createResult([], [], analysis.confidence, {
      custom: { laravelStructural: analysis, framework: 'laravel' },
    });
  }

  analyzeStructure(content: string, file: string): LaravelStructuralAnalysis {
    const { providers, confidence } = this.providerExtractor.extract(content, file);
    return { providers, facades: [], confidence };
  }

  generateQuickFix(): null {
    return null;
  }

  private isLaravelCode(content: string): boolean {
    return content.includes('ServiceProvider') || content.includes('$this->app->');
  }
}

export function createLaravelDIDetector(): LaravelDIDetector {
  return new LaravelDIDetector();
}
