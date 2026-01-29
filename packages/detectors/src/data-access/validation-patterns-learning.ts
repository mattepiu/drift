/**
 * Validation Patterns Detector - LEARNING VERSION
 *
 * Learns validation patterns from the user's codebase:
 * - Validation library usage
 * - Schema definition style
 * - Validation placement
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ValidationLibrary = 'zod' | 'yup' | 'joi' | 'class-validator' | 'manual';

export interface ValidationPatternsConventions {
  [key: string]: unknown;
  validationLibrary: ValidationLibrary;
  validatesAtBoundary: boolean;
  usesSchemaInference: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const VALIDATION_PATTERNS: Array<{ pattern: RegExp; library: ValidationLibrary }> = [
  { pattern: /import.*from\s+['"]zod['"]/i, library: 'zod' },
  { pattern: /import.*from\s+['"]yup['"]/i, library: 'yup' },
  { pattern: /import.*from\s+['"]joi['"]/i, library: 'joi' },
  { pattern: /import.*from\s+['"]class-validator['"]/i, library: 'class-validator' },
];

function detectValidationLibrary(content: string): ValidationLibrary | null {
  for (const { pattern, library } of VALIDATION_PATTERNS) {
    if (pattern.test(content)) {return library;}
  }
  if (/typeof\s+\w+\s*===|instanceof|\.length\s*[<>=]/.test(content)) {return 'manual';}
  return null;
}

// ============================================================================
// Learning Validation Patterns Detector
// ============================================================================

export class ValidationPatternsLearningDetector extends LearningDetector<ValidationPatternsConventions> {
  readonly id = 'data-access/validation-patterns';
  readonly category = 'data-access' as const;
  readonly subcategory = 'validation-patterns';
  readonly name = 'Validation Patterns Detector (Learning)';
  readonly description = 'Learns validation patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ValidationPatternsConventions> {
    return ['validationLibrary', 'validatesAtBoundary', 'usesSchemaInference'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ValidationPatternsConventions, ValueDistribution>
  ): void {
    const library = detectValidationLibrary(context.content);
    const libraryDist = distributions.get('validationLibrary')!;
    const inferenceDist = distributions.get('usesSchemaInference')!;
    
    if (library) {libraryDist.add(library, context.file);}
    
    const usesInference = /z\.infer|InferType|yup\.InferType/.test(context.content);
    inferenceDist.add(usesInference, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ValidationPatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentLibrary = detectValidationLibrary(context.content);
    const learnedLibrary = conventions.conventions.validationLibrary?.value;
    
    if (currentLibrary && learnedLibrary && currentLibrary !== learnedLibrary) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'validation library', currentLibrary, learnedLibrary,
        `Using '${currentLibrary}' but your project uses '${learnedLibrary}'`
      ));
    }
    
    if (currentLibrary) {
      patterns.push({
        patternId: `${this.id}/${currentLibrary}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createValidationPatternsLearningDetector(): ValidationPatternsLearningDetector {
  return new ValidationPatternsLearningDetector();
}
