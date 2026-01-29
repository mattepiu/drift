/**
 * Validation Patterns Detector - Input validation pattern detection
 *
 * Detects validation patterns including:
 * - Schema validation (Zod, Yup, Joi)
 * - Class validator decorators
 * - Manual validation patterns
 * - Validation middleware
 *
 * @requirements 13.4 - Validation pattern detection
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ValidationPatternType =
  | 'zod-schema'
  | 'yup-schema'
  | 'joi-schema'
  | 'class-validator'
  | 'manual-validation'
  | 'validation-middleware';

export type ValidationViolationType =
  | 'missing-validation'
  | 'inconsistent-validation'
  | 'weak-validation';

export interface ValidationPatternInfo {
  type: ValidationPatternType;
  line: number;
  column: number;
  match: string;
  library?: string;
}

export interface ValidationViolationInfo {
  type: ValidationViolationType;
  line: number;
  column: number;
  match: string;
  message: string;
}

export interface ValidationAnalysis {
  patterns: ValidationPatternInfo[];
  violations: ValidationViolationInfo[];
  dominantLibrary: string | null;
  hasValidation: boolean;
}

// ============================================================================
// Patterns
// ============================================================================

export const ZOD_PATTERNS = [
  /z\.object\s*\(\s*\{/gi,
  /z\.string\s*\(\s*\)/gi,
  /z\.number\s*\(\s*\)/gi,
  /z\.array\s*\(/gi,
  /z\.enum\s*\(/gi,
  /\.parse\s*\(/gi,
  /\.safeParse\s*\(/gi,
];

export const YUP_PATTERNS = [
  /yup\.object\s*\(\s*\{/gi,
  /yup\.string\s*\(\s*\)/gi,
  /yup\.number\s*\(\s*\)/gi,
  /\.validate\s*\(/gi,
  /\.validateSync\s*\(/gi,
];

export const JOI_PATTERNS = [
  /Joi\.object\s*\(\s*\{/gi,
  /Joi\.string\s*\(\s*\)/gi,
  /Joi\.number\s*\(\s*\)/gi,
  /\.validate\s*\(/gi,
];

export const CLASS_VALIDATOR_PATTERNS = [
  // JavaScript/TypeScript
  /@IsString\s*\(/gi,
  /@IsNumber\s*\(/gi,
  /@IsEmail\s*\(/gi,
  /@IsNotEmpty\s*\(/gi,
  /@ValidateNested\s*\(/gi,
  /@IsOptional\s*\(/gi,
  /@Min\s*\(/gi,
  /@Max\s*\(/gi,
  // Python Pydantic
  /Field\s*\(/gi,
  /validator\s*\(/gi,
  /@validator\s*\(/gi,
  /@field_validator\s*\(/gi,
  /constr\s*\(/gi,
  /conint\s*\(/gi,
  /confloat\s*\(/gi,
  /EmailStr/gi,
  /HttpUrl/gi,
];

export const MANUAL_VALIDATION_PATTERNS = [
  // JavaScript/TypeScript
  /if\s*\(\s*!?\w+\s*(?:===?|!==?)\s*(?:undefined|null|''|"")\s*\)/gi,
  /typeof\s+\w+\s*(?:===?|!==?)\s*['"`](?:string|number|boolean)['"`]/gi,
  /Array\.isArray\s*\(/gi,
  /Number\.isNaN\s*\(/gi,
  /Number\.isFinite\s*\(/gi,
  // Python
  /isinstance\s*\(\s*\w+\s*,\s*(?:str|int|float|bool|list|dict)/gi,
  /if\s+\w+\s+is\s+(?:None|not\s+None)/gi,
  /if\s+not\s+\w+\s*:/gi,
  /type\s*\(\s*\w+\s*\)\s*(?:==|is)/gi,
];

export const VALIDATION_MIDDLEWARE_PATTERNS = [
  /validateRequest\s*\(/gi,
  /validateBody\s*\(/gi,
  /validateQuery\s*\(/gi,
  /validateParams\s*\(/gi,
  /express-validator/gi,
];

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /\.d\.ts$/,
    /node_modules\//,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectZodSchemas(content: string): ValidationPatternInfo[] {
  const results: ValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ZOD_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'zod-schema',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          library: 'zod',
        });
      }
    }
  }

  return results;
}

export function detectYupSchemas(content: string): ValidationPatternInfo[] {
  const results: ValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of YUP_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'yup-schema',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          library: 'yup',
        });
      }
    }
  }

  return results;
}

export function detectJoiSchemas(content: string): ValidationPatternInfo[] {
  const results: ValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of JOI_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'joi-schema',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          library: 'joi',
        });
      }
    }
  }

  return results;
}

export function detectClassValidators(content: string): ValidationPatternInfo[] {
  const results: ValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CLASS_VALIDATOR_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'class-validator',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          library: 'class-validator',
        });
      }
    }
  }

  return results;
}

export function detectManualValidation(content: string): ValidationPatternInfo[] {
  const results: ValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of MANUAL_VALIDATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'manual-validation',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectValidationMiddleware(content: string): ValidationPatternInfo[] {
  const results: ValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of VALIDATION_MIDDLEWARE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'validation-middleware',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function analyzeValidationPatterns(content: string, filePath: string): ValidationAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      dominantLibrary: null,
      hasValidation: false,
    };
  }

  const patterns: ValidationPatternInfo[] = [
    ...detectZodSchemas(content),
    ...detectYupSchemas(content),
    ...detectJoiSchemas(content),
    ...detectClassValidators(content),
    ...detectManualValidation(content),
    ...detectValidationMiddleware(content),
  ];

  const violations: ValidationViolationInfo[] = [];

  // Determine dominant library
  const libraryCounts = new Map<string, number>();
  for (const pattern of patterns) {
    if (pattern.library) {
      libraryCounts.set(pattern.library, (libraryCounts.get(pattern.library) || 0) + 1);
    }
  }

  let dominantLibrary: string | null = null;
  let maxCount = 0;
  for (const [lib, count] of libraryCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantLibrary = lib;
    }
  }

  // Check for inconsistent validation libraries
  if (libraryCounts.size > 1) {
    violations.push({
      type: 'inconsistent-validation',
      line: 1,
      column: 1,
      match: '',
      message: `Multiple validation libraries detected: ${[...libraryCounts.keys()].join(', ')}`,
    });
  }

  return {
    patterns,
    violations,
    dominantLibrary,
    hasValidation: patterns.length > 0,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class ValidationPatternsDetector extends RegexDetector {
  readonly id = 'data-access/validation-patterns';
  readonly name = 'Validation Patterns Detector';
  readonly description = 'Detects input validation patterns and identifies inconsistencies';
  readonly category: PatternCategory = 'data-access';
  readonly subcategory = 'validation-patterns';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeValidationPatterns(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      file: context.file,
      line: v.line,
      column: v.column,
      type: v.type,
      value: v.match,
      issue: v.message,
      severity: 'warning',
    }));

    const confidence = analysis.hasValidation ? 0.9 : 0.7;
    return this.createResult([], violations, confidence, {
      custom: {
        patterns: analysis.patterns,
        dominantLibrary: analysis.dominantLibrary,
        hasValidation: analysis.hasValidation,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createValidationPatternsDetector(): ValidationPatternsDetector {
  return new ValidationPatternsDetector();
}
