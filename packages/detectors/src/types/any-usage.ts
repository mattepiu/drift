/**
 * Any Usage Detector - any type usage pattern detection
 *
 * Detects any type usage patterns including:
 * - Explicit any annotations
 * - Implicit any (missing types)
 * - any in function parameters
 * - any in return types
 * - any in generics
 * - any[] arrays
 * - Record<string, any>
 * - Alternatives to any (unknown, never)
 *
 * @requirements 18.7 - any type usage patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type AnyUsagePatternType =
  | 'explicit-any-annotation'
  | 'any-parameter'
  | 'any-return-type'
  | 'any-generic'
  | 'any-array'
  | 'any-record'
  | 'any-object'
  | 'any-function'
  | 'any-promise'
  | 'any-cast'
  | 'unknown-usage'
  | 'never-usage'
  | 'object-type'
  | 'function-type';

export type AnyUsageViolationType =
  | 'explicit-any'
  | 'any-in-public-api'
  | 'any-spread'
  | 'any-index-signature'
  | 'prefer-unknown';

export interface AnyUsagePatternInfo {
  type: AnyUsagePatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  usageContext?: string | undefined;
  alternative?: string | undefined;
  context?: string | undefined;
}

export interface AnyUsageViolationInfo {
  type: AnyUsageViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface AnyUsageAnalysis {
  patterns: AnyUsagePatternInfo[];
  violations: AnyUsageViolationInfo[];
  explicitAnyCount: number;
  anyParameterCount: number;
  anyReturnCount: number;
  usesUnknown: boolean;
  usesNever: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const EXPLICIT_ANY_ANNOTATION_PATTERNS = [
  /:\s*any\b/g,
  /:\s*any\s*[;,)=]/g,
] as const;

export const ANY_PARAMETER_PATTERNS = [
  /\(\s*\w+\s*:\s*any\b/g,
  /,\s*\w+\s*:\s*any\b/g,
  /\(\s*\.{3}\w+\s*:\s*any\[\]\s*\)/g,
] as const;

export const ANY_RETURN_TYPE_PATTERNS = [
  /\)\s*:\s*any\b/g,
  /=>\s*any\b/g,
] as const;

export const ANY_GENERIC_PATTERNS = [
  /<any>/g,
  /<any,/g,
  /,\s*any>/g,
  /<\w+,\s*any>/g,
  /<any,\s*\w+>/g,
] as const;

export const ANY_ARRAY_PATTERNS = [
  /:\s*any\[\]/g,
  /:\s*Array<any>/g,
  /:\s*ReadonlyArray<any>/g,
] as const;

export const ANY_RECORD_PATTERNS = [
  /Record<\w+,\s*any>/g,
  /Record<string,\s*any>/g,
  /Record<number,\s*any>/g,
] as const;

export const ANY_OBJECT_PATTERNS = [
  /:\s*\{\s*\[key:\s*string\]:\s*any\s*\}/g,
  /:\s*\{\s*\[key:\s*number\]:\s*any\s*\}/g,
  /:\s*\{\s*\[\w+:\s*string\]:\s*any\s*\}/g,
] as const;

export const ANY_FUNCTION_PATTERNS = [
  /:\s*\([^)]*\)\s*=>\s*any\b/g,
  /Function\b/g,
] as const;

export const ANY_PROMISE_PATTERNS = [
  /Promise<any>/g,
  /:\s*Promise<any>/g,
] as const;

export const ANY_CAST_PATTERNS = [
  /as\s+any\b/g,
  /<any>\w+/g,
] as const;

export const UNKNOWN_USAGE_PATTERNS = [
  /:\s*unknown\b/g,
  /as\s+unknown\b/g,
  /<unknown>/g,
] as const;

export const NEVER_USAGE_PATTERNS = [
  /:\s*never\b/g,
  /<never>/g,
  /\|\s*never\b/g,
] as const;

export const OBJECT_TYPE_PATTERNS = [
  /:\s*object\b/g,
  /<object>/g,
] as const;

export const FUNCTION_TYPE_PATTERNS = [
  /:\s*Function\b/g,
  /<Function>/g,
] as const;

export const ANY_IN_PUBLIC_API_PATTERNS = [
  /export\s+(?:function|const|let|var)\s+\w+[^;]*:\s*any\b/g,
  /export\s+(?:interface|type)\s+\w+[^{]*\{\s*[^}]*:\s*any\b/g,
  /public\s+\w+\s*:\s*any\b/g,
] as const;

export const ANY_SPREAD_PATTERNS = [
  /\.{3}\w+\s*:\s*any\b/g,
  /\.{3}args\s*:\s*any\[\]/g,
] as const;

export const ANY_INDEX_SIGNATURE_PATTERNS = [
  /\[\w+:\s*string\]\s*:\s*any\b/g,
  /\[\w+:\s*number\]\s*:\s*any\b/g,
] as const;

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /node_modules\//,
    /\.min\.[jt]s$/,
    /\.d\.ts$/,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectExplicitAnyAnnotation(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of EXPLICIT_ANY_ANNOTATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'explicit-any-annotation',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'annotation',
          alternative: 'unknown',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAnyParameter(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_PARAMETER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-parameter',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'parameter',
          alternative: 'unknown or specific type',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAnyReturnType(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_RETURN_TYPE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-return-type',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'return-type',
          alternative: 'specific return type',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAnyGeneric(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_GENERIC_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-generic',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'generic',
          alternative: 'unknown or specific type',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAnyArray(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_ARRAY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-array',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'array',
          alternative: 'unknown[] or typed array',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAnyRecord(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_RECORD_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-record',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'record',
          alternative: 'Record<string, unknown>',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAnyObject(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_OBJECT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-object',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'object',
          alternative: 'Record<string, unknown>',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAnyFunction(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-function',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'function',
          alternative: 'specific function signature',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAnyPromise(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_PROMISE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-promise',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'promise',
          alternative: 'Promise<unknown> or specific type',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAnyCast(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_CAST_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-cast',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'cast',
          alternative: 'as unknown with type guard',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectUnknownUsage(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of UNKNOWN_USAGE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'unknown-usage',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'unknown-type',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectNeverUsage(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of NEVER_USAGE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'never-usage',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'never-type',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectObjectType(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of OBJECT_TYPE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'object-type',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'object-type',
          alternative: 'Record<string, unknown> or specific interface',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectFunctionType(
  content: string,
  filePath: string
): AnyUsagePatternInfo[] {
  const results: AnyUsagePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of FUNCTION_TYPE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'function-type',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          usageContext: 'function-type',
          alternative: 'specific function signature',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectExplicitAnyViolations(
  content: string,
  filePath: string
): AnyUsageViolationInfo[] {
  const results: AnyUsageViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) {continue;}
    
    for (const pattern of EXPLICIT_ANY_ANNOTATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'explicit-any',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Explicit any type usage',
          suggestedFix: 'Use unknown with type guards or specific types',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectAnyInPublicApiViolations(
  content: string,
  filePath: string
): AnyUsageViolationInfo[] {
  const results: AnyUsageViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_IN_PUBLIC_API_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-in-public-api',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'any type in public API',
          suggestedFix: 'Use specific types for better API contracts',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectAnySpreadViolations(
  content: string,
  filePath: string
): AnyUsageViolationInfo[] {
  const results: AnyUsageViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_SPREAD_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-spread',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'any type in spread parameter',
          suggestedFix: 'Use unknown[] or specific tuple types',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectAnyIndexSignatureViolations(
  content: string,
  filePath: string
): AnyUsageViolationInfo[] {
  const results: AnyUsageViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ANY_INDEX_SIGNATURE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'any-index-signature',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'any type in index signature',
          suggestedFix: 'Use unknown or specific value type',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeAnyUsage(
  content: string,
  filePath: string
): AnyUsageAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      explicitAnyCount: 0,
      anyParameterCount: 0,
      anyReturnCount: 0,
      usesUnknown: false,
      usesNever: false,
      confidence: 1.0,
    };
  }

  const patterns: AnyUsagePatternInfo[] = [
    ...detectExplicitAnyAnnotation(content, filePath),
    ...detectAnyParameter(content, filePath),
    ...detectAnyReturnType(content, filePath),
    ...detectAnyGeneric(content, filePath),
    ...detectAnyArray(content, filePath),
    ...detectAnyRecord(content, filePath),
    ...detectAnyObject(content, filePath),
    ...detectAnyFunction(content, filePath),
    ...detectAnyPromise(content, filePath),
    ...detectAnyCast(content, filePath),
    ...detectUnknownUsage(content, filePath),
    ...detectNeverUsage(content, filePath),
    ...detectObjectType(content, filePath),
    ...detectFunctionType(content, filePath),
  ];

  const violations: AnyUsageViolationInfo[] = [
    ...detectExplicitAnyViolations(content, filePath),
    ...detectAnyInPublicApiViolations(content, filePath),
    ...detectAnySpreadViolations(content, filePath),
    ...detectAnyIndexSignatureViolations(content, filePath),
  ];

  const explicitAnyCount = patterns.filter((p) => p.type === 'explicit-any-annotation').length;
  const anyParameterCount = patterns.filter((p) => p.type === 'any-parameter').length;
  const anyReturnCount = patterns.filter((p) => p.type === 'any-return-type').length;
  const usesUnknown = patterns.some((p) => p.type === 'unknown-usage');
  const usesNever = patterns.some((p) => p.type === 'never-usage');

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (usesUnknown) {confidence += 0.05;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    explicitAnyCount,
    anyParameterCount,
    anyReturnCount,
    usesUnknown,
    usesNever,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class AnyUsageDetector extends RegexDetector {
  readonly id = 'types/any-usage';
  readonly name = 'Any Usage Detector';
  readonly description =
    'Detects any type usage patterns and suggests safer alternatives';
  readonly category: PatternCategory = 'types';
  readonly subcategory = 'any-usage';
  readonly supportedLanguages: Language[] = ['typescript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeAnyUsage(context.content, context.file);

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
        explicitAnyCount: analysis.explicitAnyCount,
        anyParameterCount: analysis.anyParameterCount,
        anyReturnCount: analysis.anyReturnCount,
        usesUnknown: analysis.usesUnknown,
        usesNever: analysis.usesNever,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createAnyUsageDetector(): AnyUsageDetector {
  return new AnyUsageDetector();
}
