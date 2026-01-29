/**
 * Laravel Testing Detector
 *
 * Main detector for Laravel testing patterns.
 *
 * @module testing/laravel/testing-detector
 */

import { TestCaseExtractor } from './extractors/test-case-extractor.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { LaravelTestingAnalysis } from './types.js';
import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { Language } from 'driftdetect-core';



export class LaravelTestingDetector extends BaseDetector {
  readonly id = 'testing/laravel-testing';
  readonly category = 'testing' as const;
  readonly subcategory = 'laravel';
  readonly name = 'Laravel Testing Detector';
  readonly description = 'Extracts testing patterns from Laravel code';
  readonly supportedLanguages: Language[] = ['php'];
  readonly detectionMethod = 'regex' as const;

  private readonly testCaseExtractor: TestCaseExtractor;

  constructor() {
    super();
    this.testCaseExtractor = new TestCaseExtractor();
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    if (!this.isTestFile(content, file)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeTesting(content, file);

    return this.createResult([], [], analysis.confidence, {
      custom: { laravelTesting: analysis, framework: 'laravel' },
    });
  }

  analyzeTesting(content: string, file: string): LaravelTestingAnalysis {
    const testCases = this.testCaseExtractor.extract(content, file);

    return {
      testCases,
      factories: { factories: [], confidence: 0 },
      mocks: { mocks: [], confidence: 0 },
      confidence: testCases.confidence,
    };
  }

  generateQuickFix(): null {
    return null;
  }

  private isTestFile(content: string, file: string): boolean {
    return file.includes('Test.php') || content.includes('extends TestCase');
  }
}

export function createLaravelTestingDetector(): LaravelTestingDetector {
  return new LaravelTestingDetector();
}
