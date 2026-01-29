/**
 * Laravel Config Detector
 *
 * @module config/laravel/config-detector
 */

import { EnvExtractor } from './extractors/env-extractor.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { LaravelConfigAnalysis } from './types.js';
import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { Language } from 'driftdetect-core';



export class LaravelConfigDetector extends BaseDetector {
  readonly id = 'config/laravel-config';
  readonly category = 'config' as const;
  readonly subcategory = 'laravel';
  readonly name = 'Laravel Config Detector';
  readonly description = 'Extracts configuration patterns from Laravel code';
  readonly supportedLanguages: Language[] = ['php'];
  readonly detectionMethod = 'regex' as const;

  private readonly envExtractor: EnvExtractor;

  constructor() {
    super();
    this.envExtractor = new EnvExtractor();
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    if (!this.isLaravelCode(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeConfig(content, file);

    return this.createResult([], [], analysis.confidence, {
      custom: { laravelConfig: analysis, framework: 'laravel' },
    });
  }

  analyzeConfig(content: string, file: string): LaravelConfigAnalysis {
    return this.envExtractor.extract(content, file);
  }

  generateQuickFix(): null {
    return null;
  }

  private isLaravelCode(content: string): boolean {
    return content.includes('env(') || content.includes('config(');
  }
}

export function createLaravelConfigDetector(): LaravelConfigDetector {
  return new LaravelConfigDetector();
}
