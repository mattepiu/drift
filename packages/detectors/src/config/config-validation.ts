/**
 * Config Validation Detector - Configuration validation pattern detection
 *
 * Detects configuration validation patterns including:
 * - Schema validation (Zod, Joi, Yup)
 * - Type checking
 * - Runtime validation
 * - Startup validation
 *
 * @requirements 17.5 - Configuration validation patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ConfigValidationPatternType =
  | 'zod-schema'
  | 'joi-schema'
  | 'yup-schema'
  | 'type-assertion'
  | 'runtime-check'
  | 'startup-validation'
  | 'env-validation';

export type ConfigValidationViolationType =
  | 'missing-validation'
  | 'unsafe-cast'
  | 'no-error-handling';

export interface ConfigValidationPatternInfo {
  type: ConfigValidationPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  library?: string | undefined;
  context?: string | undefined;
}

export interface ConfigValidationViolationInfo {
  type: ConfigValidationViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface ConfigValidationAnalysis {
  patterns: ConfigValidationPatternInfo[];
  violations: ConfigValidationViolationInfo[];
  hasValidation: boolean;
  validationLibrary?: string | undefined;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const ZOD_SCHEMA_PATTERNS = [
  /z\.object\s*\(/gi,
  /z\.string\s*\(/gi,
  /z\.number\s*\(/gi,
  /z\.boolean\s*\(/gi,
  /z\.array\s*\(/gi,
  /z\.enum\s*\(/gi,
  /z\.union\s*\(/gi,
  /z\.optional\s*\(/gi,
  /z\.nullable\s*\(/gi,
  /\.parse\s*\(/gi,
  /\.safeParse\s*\(/gi,
  /\.parseAsync\s*\(/gi,
  /import.*from\s*['"`]zod['"`]/gi,
  /require\s*\(\s*['"`]zod['"`]\s*\)/gi,
] as const;

export const JOI_SCHEMA_PATTERNS = [
  /Joi\.object\s*\(/gi,
  /Joi\.string\s*\(/gi,
  /Joi\.number\s*\(/gi,
  /Joi\.boolean\s*\(/gi,
  /Joi\.array\s*\(/gi,
  /Joi\.alternatives\s*\(/gi,
  /\.validate\s*\(/gi,
  /\.validateAsync\s*\(/gi,
  /import.*from\s*['"`]joi['"`]/gi,
  /require\s*\(\s*['"`]joi['"`]\s*\)/gi,
] as const;

export const YUP_SCHEMA_PATTERNS = [
  /yup\.object\s*\(/gi,
  /yup\.string\s*\(/gi,
  /yup\.number\s*\(/gi,
  /yup\.boolean\s*\(/gi,
  /yup\.array\s*\(/gi,
  /yup\.mixed\s*\(/gi,
  /\.validate\s*\(/gi,
  /\.validateSync\s*\(/gi,
  /import.*from\s*['"`]yup['"`]/gi,
  /require\s*\(\s*['"`]yup['"`]\s*\)/gi,
] as const;

export const TYPE_ASSERTION_PATTERNS = [
  /as\s+\w+Config/gi,
  /as\s+Config\w*/gi,
  /as\s+\w+Options/gi,
  /<\w+Config>/gi,
  /<Config\w*>/gi,
  /satisfies\s+\w+Config/gi,
] as const;

export const RUNTIME_CHECK_PATTERNS = [
  // JavaScript/TypeScript
  /typeof\s+\w+\s*[!=]==?\s*['"`](?:string|number|boolean|object)['"`]/gi,
  /instanceof\s+\w+/gi,
  /Array\.isArray\s*\(/gi,
  /Number\.isNaN\s*\(/gi,
  /Number\.isFinite\s*\(/gi,
  /isNaN\s*\(/gi,
  /isFinite\s*\(/gi,
  // Python
  /isinstance\s*\(\s*\w+\s*,\s*(?:str|int|float|bool|list|dict)/gi,
  /type\s*\(\s*\w+\s*\)\s*(?:==|is)\s*(?:str|int|float|bool|list|dict)/gi,
  /hasattr\s*\(/gi,
] as const;

export const STARTUP_VALIDATION_PATTERNS = [
  // JavaScript/TypeScript
  /validateConfig\s*\(/gi,
  /validateEnv\s*\(/gi,
  /checkConfig\s*\(/gi,
  /assertConfig\s*\(/gi,
  /verifyConfig\s*\(/gi,
  /loadAndValidate\s*\(/gi,
  /configSchema\.parse/gi,
  /envSchema\.parse/gi,
  // Python
  /validate_config\s*\(/gi,
  /validate_env\s*\(/gi,
  /check_config\s*\(/gi,
  /assert_config\s*\(/gi,
  /verify_config\s*\(/gi,
  /load_and_validate\s*\(/gi,
  /Settings\s*\(\s*\)/gi, // Pydantic Settings instantiation
  /BaseSettings\s*\(/gi,
] as const;

export const ENV_VALIDATION_PATTERNS = [
  // JavaScript/TypeScript
  /envalid/gi,
  /env-var/gi,
  /dotenv-safe/gi,
  /cleanEnv\s*\(/gi,
  /str\s*\(\s*\{/gi,
  /num\s*\(\s*\{/gi,
  /bool\s*\(\s*\{/gi,
  /url\s*\(\s*\{/gi,
  /port\s*\(\s*\{/gi,
  // Python
  /pydantic_settings/gi,
  /pydantic\.BaseSettings/gi,
  /from\s+pydantic\s+import.*BaseSettings/gi,
  /class\s+\w+\s*\(\s*BaseSettings\s*\)/gi,
  /python-dotenv/gi,
  /dotenv\.load_dotenv/gi,
  /load_dotenv\s*\(/gi,
  /environ-config/gi,
] as const;

export const UNSAFE_CAST_PATTERNS = [
  /as\s+any/gi,
  /as\s+unknown/gi,
  /<any>/gi,
  /:\s*any\s*[=;,)]/gi,
] as const;

export const MISSING_VALIDATION_PATTERNS = [
  /process\.env\.[A-Z_]+\s*!/gi, // Non-null assertion without validation
] as const;

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
    /\.min\.[jt]s$/,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectZodSchema(
  content: string,
  filePath: string
): ConfigValidationPatternInfo[] {
  const results: ConfigValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ZOD_SCHEMA_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'zod-schema',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          library: 'zod',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectJoiSchema(
  content: string,
  filePath: string
): ConfigValidationPatternInfo[] {
  const results: ConfigValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of JOI_SCHEMA_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'joi-schema',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          library: 'joi',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectYupSchema(
  content: string,
  filePath: string
): ConfigValidationPatternInfo[] {
  const results: ConfigValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of YUP_SCHEMA_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'yup-schema',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          library: 'yup',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypeAssertion(
  content: string,
  filePath: string
): ConfigValidationPatternInfo[] {
  const results: ConfigValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_ASSERTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'type-assertion',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectRuntimeCheck(
  content: string,
  filePath: string
): ConfigValidationPatternInfo[] {
  const results: ConfigValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of RUNTIME_CHECK_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'runtime-check',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectStartupValidation(
  content: string,
  filePath: string
): ConfigValidationPatternInfo[] {
  const results: ConfigValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of STARTUP_VALIDATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'startup-validation',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectEnvValidation(
  content: string,
  filePath: string
): ConfigValidationPatternInfo[] {
  const results: ConfigValidationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ENV_VALIDATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        let library = 'unknown';
        if (/envalid|cleanEnv/i.test(match[0])) {library = 'envalid';}
        else if (/env-var/i.test(match[0])) {library = 'env-var';}
        else if (/dotenv-safe/i.test(match[0])) {library = 'dotenv-safe';}

        results.push({
          type: 'env-validation',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          library,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectUnsafeCastViolations(
  content: string,
  filePath: string
): ConfigValidationViolationInfo[] {
  const results: ConfigValidationViolationInfo[] = [];
  const lines = content.split('\n');

  // Only flag in config-related files
  if (!/config|env|settings/i.test(filePath)) {return results;}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments
    if (/^\s*\/\/|^\s*\/\*/.test(line)) {continue;}

    for (const pattern of UNSAFE_CAST_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'unsafe-cast',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Unsafe type cast in configuration - use schema validation instead',
          suggestedFix: 'Use Zod, Joi, or Yup for type-safe validation',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectMissingValidationViolations(
  content: string,
  filePath: string
): ConfigValidationViolationInfo[] {
  const results: ConfigValidationViolationInfo[] = [];
  const lines = content.split('\n');

  // Only flag in config-related files
  if (!/config|env|settings/i.test(filePath)) {return results;}

  // Check if file has any validation
  const hasValidation =
    ZOD_SCHEMA_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(content)) ||
    JOI_SCHEMA_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(content)) ||
    YUP_SCHEMA_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(content)) ||
    ENV_VALIDATION_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(content));

  if (hasValidation) {return results;}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of MISSING_VALIDATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'missing-validation',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Non-null assertion without validation',
          suggestedFix: 'Add schema validation for environment variables',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeConfigValidation(
  content: string,
  filePath: string
): ConfigValidationAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasValidation: false,
      confidence: 1.0,
    };
  }

  const patterns: ConfigValidationPatternInfo[] = [
    ...detectZodSchema(content, filePath),
    ...detectJoiSchema(content, filePath),
    ...detectYupSchema(content, filePath),
    ...detectTypeAssertion(content, filePath),
    ...detectRuntimeCheck(content, filePath),
    ...detectStartupValidation(content, filePath),
    ...detectEnvValidation(content, filePath),
  ];

  const violations: ConfigValidationViolationInfo[] = [
    ...detectUnsafeCastViolations(content, filePath),
    ...detectMissingValidationViolations(content, filePath),
  ];

  const hasValidation = patterns.some(
    (p) => p.type === 'zod-schema' || p.type === 'joi-schema' || p.type === 'yup-schema' || p.type === 'env-validation'
  );

  let validationLibrary: string | undefined;
  const libPattern = patterns.find((p) => p.library);
  if (libPattern) {validationLibrary = libPattern.library;}

  let confidence = 0.7;
  if (hasValidation) {confidence += 0.2;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    hasValidation,
    validationLibrary,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class ConfigValidationDetector extends RegexDetector {
  readonly id = 'config/config-validation';
  readonly name = 'Config Validation Detector';
  readonly description =
    'Detects configuration validation patterns';
  readonly category: PatternCategory = 'config';
  readonly subcategory = 'config-validation';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeConfigValidation(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations.map(v => ({
      file: v.file,
      line: v.line,
      column: v.column,
      value: v.matchedText,
      issue: v.issue,
      suggestedFix: v.suggestedFix,
      severity: v.severity === 'high' ? 'error' as const : v.severity === 'medium' ? 'warning' as const : 'info' as const,
    })));

    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasValidation: analysis.hasValidation,
        validationLibrary: analysis.validationLibrary,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createConfigValidationDetector(): ConfigValidationDetector {
  return new ConfigValidationDetector();
}
