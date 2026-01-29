/**
 * Required Optional Detector - Required vs optional config pattern detection
 *
 * Detects configuration patterns including:
 * - Required environment variables
 * - Optional with defaults
 * - Validation patterns
 * - Type coercion patterns
 *
 * @requirements 17.2 - Required vs optional configuration patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type RequiredOptionalPatternType =
  | 'required-env'
  | 'optional-env'
  | 'default-fallback'
  | 'nullish-coalescing'
  | 'or-operator'
  | 'type-coercion'
  | 'validation-check';

export type RequiredOptionalViolationType =
  | 'missing-required-check'
  | 'unsafe-access'
  | 'missing-type-coercion';

export interface RequiredOptionalPatternInfo {
  type: RequiredOptionalPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  envName?: string | undefined;
  hasDefault?: boolean | undefined;
  context?: string | undefined;
}

export interface RequiredOptionalViolationInfo {
  type: RequiredOptionalViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface RequiredOptionalAnalysis {
  patterns: RequiredOptionalPatternInfo[];
  violations: RequiredOptionalViolationInfo[];
  hasRequiredChecks: boolean;
  hasDefaults: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const REQUIRED_ENV_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.[A-Z_]+\s*!\s*$/gm,
  /process\.env\.[A-Z_]+\s+as\s+string/gi,
  /if\s*\(\s*!process\.env\.[A-Z_]+\s*\)/gi,
  /throw.*process\.env\.[A-Z_]+/gi,
  /required\s*:\s*true/gi,
  /\.required\s*\(\s*\)/gi,
  /assertEnv\s*\(/gi,
  /requireEnv\s*\(/gi,
  // Python
  /os\.environ\[['"]\w+['"]\]/gi, // Direct access without .get() is required
  /if\s+not\s+os\.environ\.get\s*\(/gi,
  /raise.*os\.environ/gi,
  /assert\s+os\.environ/gi,
  /assert_env\s*\(/gi,
  /require_env\s*\(/gi,
] as const;

export const OPTIONAL_ENV_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.[A-Z_]+\s*\?\?/gi,
  /process\.env\.[A-Z_]+\s*\|\|/gi,
  /process\.env\.[A-Z_]+\s*\?\./gi,
  /optional\s*:\s*true/gi,
  /\.optional\s*\(\s*\)/gi,
  /\.default\s*\(/gi,
  // Python
  /os\.environ\.get\s*\(/gi, // .get() with default is optional
  /os\.getenv\s*\(/gi,
  /\.get\s*\(\s*['"][A-Z_]+['"]\s*,/gi, // dict.get with default
] as const;

export const DEFAULT_FALLBACK_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.[A-Z_]+\s*\?\?\s*['"`][^'"`]*['"`]/gi,
  /process\.env\.[A-Z_]+\s*\|\|\s*['"`][^'"`]*['"`]/gi,
  /process\.env\.[A-Z_]+\s*\?\?\s*\d+/gi,
  /process\.env\.[A-Z_]+\s*\|\|\s*\d+/gi,
  /process\.env\.[A-Z_]+\s*\?\?\s*(?:true|false)/gi,
  /\.default\s*\(\s*['"`][^'"`]*['"`]\s*\)/gi,
  /\.default\s*\(\s*\d+\s*\)/gi,
  // Python
  /os\.environ\.get\s*\(\s*['"][A-Z_]+['"]\s*,\s*['"][^'"]*['"]\s*\)/gi,
  /os\.getenv\s*\(\s*['"][A-Z_]+['"]\s*,\s*['"][^'"]*['"]\s*\)/gi,
  /os\.getenv\s*\(\s*['"][A-Z_]+['"]\s*,\s*\d+\s*\)/gi,
  /os\.getenv\s*\(\s*['"][A-Z_]+['"]\s*\)\s*or\s*['"][^'"]*['"]/gi,
] as const;

export const NULLISH_COALESCING_PATTERNS = [
  /process\.env\.[A-Z_]+\s*\?\?/gi,
  /\?\?\s*['"`][^'"`]*['"`]/gi,
  /\?\?\s*\d+/gi,
] as const;

export const OR_OPERATOR_PATTERNS = [
  /process\.env\.[A-Z_]+\s*\|\|/gi,
  /\|\|\s*['"`][^'"`]*['"`]/gi,
  /\|\|\s*\d+/gi,
] as const;

export const TYPE_COERCION_PATTERNS = [
  // JavaScript/TypeScript
  /parseInt\s*\(\s*process\.env\.[A-Z_]+/gi,
  /parseFloat\s*\(\s*process\.env\.[A-Z_]+/gi,
  /Number\s*\(\s*process\.env\.[A-Z_]+/gi,
  /Boolean\s*\(\s*process\.env\.[A-Z_]+/gi,
  /JSON\.parse\s*\(\s*process\.env\.[A-Z_]+/gi,
  /process\.env\.[A-Z_]+\s*===\s*['"`]true['"`]/gi,
  /process\.env\.[A-Z_]+\s*===\s*['"`]1['"`]/gi,
  /\.transform\s*\(/gi,
  /\.coerce\s*\(/gi,
  // Python
  /int\s*\(\s*os\.environ/gi,
  /int\s*\(\s*os\.getenv/gi,
  /float\s*\(\s*os\.environ/gi,
  /float\s*\(\s*os\.getenv/gi,
  /bool\s*\(\s*os\.environ/gi,
  /json\.loads\s*\(\s*os\.environ/gi,
  /json\.loads\s*\(\s*os\.getenv/gi,
  /\.lower\s*\(\s*\)\s*(?:==|in)\s*\(?['"]true['"]/gi,
] as const;

export const VALIDATION_CHECK_PATTERNS = [
  /if\s*\(\s*!?process\.env\.[A-Z_]+\s*\)/gi,
  /process\.env\.[A-Z_]+\s*[!=]==?\s*undefined/gi,
  /typeof\s+process\.env\.[A-Z_]+/gi,
  /\.safeParse\s*\(/gi,
  /\.parse\s*\(/gi,
  /z\.string\s*\(\s*\)/gi,
  /z\.number\s*\(\s*\)/gi,
  /z\.boolean\s*\(\s*\)/gi,
] as const;

export const UNSAFE_ACCESS_PATTERNS = [
  /process\.env\.[A-Z_]+\s*\./gi, // Direct property access without check
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

export function detectRequiredEnv(
  content: string,
  filePath: string
): RequiredOptionalPatternInfo[] {
  const results: RequiredOptionalPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REQUIRED_ENV_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envMatch = match[0].match(/process\.env\.([A-Z_]+)/);
        results.push({
          type: 'required-env',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName: envMatch ? envMatch[1] : undefined,
          hasDefault: false,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectOptionalEnv(
  content: string,
  filePath: string
): RequiredOptionalPatternInfo[] {
  const results: RequiredOptionalPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of OPTIONAL_ENV_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envMatch = match[0].match(/process\.env\.([A-Z_]+)/);
        results.push({
          type: 'optional-env',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName: envMatch ? envMatch[1] : undefined,
          hasDefault: /\?\?|\|\|/.test(match[0]),
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectDefaultFallback(
  content: string,
  filePath: string
): RequiredOptionalPatternInfo[] {
  const results: RequiredOptionalPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DEFAULT_FALLBACK_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envMatch = match[0].match(/process\.env\.([A-Z_]+)/);
        results.push({
          type: 'default-fallback',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName: envMatch ? envMatch[1] : undefined,
          hasDefault: true,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypeCoercion(
  content: string,
  filePath: string
): RequiredOptionalPatternInfo[] {
  const results: RequiredOptionalPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_COERCION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envMatch = match[0].match(/process\.env\.([A-Z_]+)/);
        results.push({
          type: 'type-coercion',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName: envMatch ? envMatch[1] : undefined,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectValidationCheck(
  content: string,
  filePath: string
): RequiredOptionalPatternInfo[] {
  const results: RequiredOptionalPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of VALIDATION_CHECK_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envMatch = match[0].match(/process\.env\.([A-Z_]+)/);
        results.push({
          type: 'validation-check',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName: envMatch ? envMatch[1] : undefined,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectUnsafeAccessViolations(
  content: string,
  filePath: string
): RequiredOptionalViolationInfo[] {
  const results: RequiredOptionalViolationInfo[] = [];
  const lines = content.split('\n');

  // Check for direct property access without validation
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip if line has validation patterns
    if (/\?\?|\|\||if\s*\(|!==?\s*undefined|typeof/.test(line)) {continue;}

    for (const pattern of UNSAFE_ACCESS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        // Skip if it's part of a larger safe pattern
        if (/\?\?|\|\|/.test(line.slice(match.index))) {continue;}

        results.push({
          type: 'unsafe-access',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Direct property access on potentially undefined env variable',
          suggestedFix: 'Add nullish coalescing or validation check',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeRequiredOptional(
  content: string,
  filePath: string
): RequiredOptionalAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasRequiredChecks: false,
      hasDefaults: false,
      confidence: 1.0,
    };
  }

  const patterns: RequiredOptionalPatternInfo[] = [
    ...detectRequiredEnv(content, filePath),
    ...detectOptionalEnv(content, filePath),
    ...detectDefaultFallback(content, filePath),
    ...detectTypeCoercion(content, filePath),
    ...detectValidationCheck(content, filePath),
  ];

  const violations = detectUnsafeAccessViolations(content, filePath);

  const hasRequiredChecks = patterns.some((p) => p.type === 'required-env' || p.type === 'validation-check');
  const hasDefaults = patterns.some((p) => p.hasDefault);

  let confidence = 0.7;
  if (hasRequiredChecks) {confidence += 0.15;}
  if (hasDefaults) {confidence += 0.1;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    hasRequiredChecks,
    hasDefaults,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class RequiredOptionalDetector extends RegexDetector {
  readonly id = 'config/required-optional';
  readonly name = 'Required Optional Detector';
  readonly description =
    'Detects required vs optional configuration patterns';
  readonly category: PatternCategory = 'config';
  readonly subcategory = 'required-optional';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeRequiredOptional(context.content, context.file);

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
        hasRequiredChecks: analysis.hasRequiredChecks,
        hasDefaults: analysis.hasDefaults,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createRequiredOptionalDetector(): RequiredOptionalDetector {
  return new RequiredOptionalDetector();
}
