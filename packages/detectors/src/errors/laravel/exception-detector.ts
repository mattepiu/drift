/**
 * Laravel Exception Detector
 *
 * Main detector for Laravel exception and error handling patterns.
 *
 * @module errors/laravel/exception-detector
 */

import { CustomExceptionExtractor } from './extractors/custom-exception-extractor.js';
import { ExceptionHandlerExtractor } from './extractors/exception-handler-extractor.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { LaravelErrorAnalysis } from './types.js';
import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { Language } from 'driftdetect-core';



export class LaravelExceptionDetector extends BaseDetector {
  readonly id = 'errors/laravel-exceptions';
  readonly category = 'errors' as const;
  readonly subcategory = 'laravel';
  readonly name = 'Laravel Exception Detector';
  readonly description = 'Extracts exception and error handling patterns from Laravel code';
  readonly supportedLanguages: Language[] = ['php'];
  readonly detectionMethod = 'regex' as const;

  private readonly handlerExtractor: ExceptionHandlerExtractor;
  private readonly exceptionExtractor: CustomExceptionExtractor;

  constructor() {
    super();
    this.handlerExtractor = new ExceptionHandlerExtractor();
    this.exceptionExtractor = new CustomExceptionExtractor();
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    if (!this.isLaravelCode(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeErrors(content, file);

    return this.createResult([], [], analysis.confidence, {
      custom: { laravelErrors: analysis, framework: 'laravel' },
    });
  }

  analyzeErrors(content: string, file: string): LaravelErrorAnalysis {
    const handlers = this.handlerExtractor.extract(content, file);
    const exceptions = this.exceptionExtractor.extract(content, file);

    const confidences = [handlers.confidence, exceptions.confidence];
    const nonZeroConfidences = confidences.filter(c => c > 0);
    const confidence = nonZeroConfidences.length > 0
      ? nonZeroConfidences.reduce((a, b) => a + b, 0) / nonZeroConfidences.length
      : 0;

    return { handlers, exceptions, confidence };
  }

  generateQuickFix(): null {
    return null;
  }

  private isLaravelCode(content: string): boolean {
    return (
      content.includes('use Illuminate\\') ||
      content.includes('ExceptionHandler') ||
      content.includes('Exception') ||
      content.includes('abort(')
    );
  }
}

export function createLaravelExceptionDetector(): LaravelExceptionDetector {
  return new LaravelExceptionDetector();
}
