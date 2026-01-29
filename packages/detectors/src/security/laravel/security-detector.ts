/**
 * Laravel Security Detector
 *
 * @module security/laravel/security-detector
 */

import { CSRFExtractor } from './extractors/csrf-extractor.js';
import { MassAssignmentExtractor } from './extractors/mass-assignment-extractor.js';
import { XSSExtractor } from './extractors/xss-extractor.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { LaravelSecurityAnalysis } from './types.js';
import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { Language } from 'driftdetect-core';

export class LaravelSecurityDetector extends BaseDetector {
  readonly id = 'security/laravel-security';
  readonly category = 'security' as const;
  readonly subcategory = 'laravel';
  readonly name = 'Laravel Security Detector';
  readonly description = 'Extracts security patterns from Laravel code';
  readonly supportedLanguages: Language[] = ['php'];
  readonly detectionMethod = 'regex' as const;

  private readonly csrfExtractor: CSRFExtractor;
  private readonly massAssignmentExtractor: MassAssignmentExtractor;
  private readonly xssExtractor: XSSExtractor;

  constructor() {
    super();
    this.csrfExtractor = new CSRFExtractor();
    this.massAssignmentExtractor = new MassAssignmentExtractor();
    this.xssExtractor = new XSSExtractor();
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    if (!this.isLaravelCode(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeSecurity(content, file);

    return this.createResult([], [], analysis.confidence, {
      custom: { laravelSecurity: analysis, framework: 'laravel' },
    });
  }

  analyzeSecurity(content: string, file: string): LaravelSecurityAnalysis {
    const csrfResult = this.csrfExtractor.extract(content, file);
    const massAssignmentResult = this.massAssignmentExtractor.extract(content, file);
    const xssResult = this.xssExtractor.extract(content, file);

    const confidences = [csrfResult.confidence, massAssignmentResult.confidence, xssResult.confidence];
    const nonZeroConfidences = confidences.filter(c => c > 0);
    const confidence = nonZeroConfidences.length > 0
      ? nonZeroConfidences.reduce((a, b) => a + b, 0) / nonZeroConfidences.length
      : 0;

    return {
      csrf: csrfResult.usages,
      massAssignment: massAssignmentResult.models,
      xss: xssResult.usages,
      confidence,
    };
  }

  generateQuickFix(): null {
    return null;
  }

  private isLaravelCode(content: string): boolean {
    return content.includes('csrf') || content.includes('VerifyCsrfToken') || content.includes('$fillable');
  }
}

export function createLaravelSecurityDetector(): LaravelSecurityDetector {
  return new LaravelSecurityDetector();
}
