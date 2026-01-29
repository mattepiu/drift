/**
 * Config Validation Detector - LEARNING VERSION
 *
 * Learns config validation patterns from the user's codebase:
 * - Validation library preferences
 * - Schema definition patterns
 * - Error handling patterns
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

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ValidationLibrary = 'zod' | 'joi' | 'yup' | 'class-validator' | 'manual';

export interface ConfigValidationConventions {
  [key: string]: unknown;
  library: ValidationLibrary;
  usesSchemaValidation: boolean;
  throwsOnInvalid: boolean;
}

interface ValidationPatternInfo {
  library: ValidationLibrary;
  hasSchema: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractValidationPatterns(content: string, file: string): ValidationPatternInfo[] {
  const results: ValidationPatternInfo[] = [];

  const patterns: Array<{ regex: RegExp; library: ValidationLibrary }> = [
    { regex: /z\.object|z\.string|z\.number|zod/gi, library: 'zod' },
    { regex: /Joi\.object|Joi\.string|Joi\.number/gi, library: 'joi' },
    { regex: /yup\.object|yup\.string|yup\.number/gi, library: 'yup' },
    { regex: /@IsString|@IsNumber|@ValidateNested/g, library: 'class-validator' },
  ];

  for (const { regex, library } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        library,
        hasSchema: true,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Config Validation Detector
// ============================================================================

export class ConfigValidationLearningDetector extends LearningDetector<ConfigValidationConventions> {
  readonly id = 'config/config-validation';
  readonly category = 'config' as const;
  readonly subcategory = 'config-validation';
  readonly name = 'Config Validation Detector (Learning)';
  readonly description = 'Learns config validation patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ConfigValidationConventions> {
    return ['library', 'usesSchemaValidation', 'throwsOnInvalid'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ConfigValidationConventions, ValueDistribution>
  ): void {
    const patterns = extractValidationPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const libraryDist = distributions.get('library')!;
    const schemaDist = distributions.get('usesSchemaValidation')!;

    for (const pattern of patterns) {
      libraryDist.add(pattern.library, context.file);
      schemaDist.add(pattern.hasSchema, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ConfigValidationConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const validationPatterns = extractValidationPatterns(context.content, context.file);
    if (validationPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedLibrary = conventions.conventions.library?.value;

    // Check library consistency
    if (learnedLibrary) {
      for (const pattern of validationPatterns) {
        if (pattern.library !== learnedLibrary) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'validation library', pattern.library, learnedLibrary,
            `Using ${pattern.library} but project uses ${learnedLibrary}`
          ));
        }
      }
    }

    if (validationPatterns.length > 0) {
      const first = validationPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/validation`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createConfigValidationLearningDetector(): ConfigValidationLearningDetector {
  return new ConfigValidationLearningDetector();
}
