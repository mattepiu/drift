/**
 * Utility Types Detector - TypeScript utility type pattern detection
 *
 * Detects utility type patterns including:
 * - Built-in utility types (Partial, Required, Pick, Omit, etc.)
 * - Custom utility types
 * - Mapped type utilities
 * - Conditional type utilities
 * - Template literal types
 * - Recursive types
 *
 * @requirements 18.5 - Utility type patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type UtilityTypePatternType =
  | 'partial'
  | 'required'
  | 'readonly'
  | 'pick'
  | 'omit'
  | 'record'
  | 'exclude'
  | 'extract'
  | 'non-nullable'
  | 'return-type'
  | 'parameters'
  | 'instance-type'
  | 'awaited'
  | 'this-type'
  | 'custom-mapped'
  | 'custom-conditional'
  | 'template-literal'
  | 'recursive-type'
  | 'branded-type'
  | 'deep-partial'
  | 'deep-readonly';

export type UtilityTypeViolationType =
  | 'redundant-utility'
  | 'nested-utility'
  | 'missing-utility'
  | 'complex-utility-chain';

export interface UtilityTypePatternInfo {
  type: UtilityTypePatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  utilityName?: string | undefined;
  targetType?: string | undefined;
  isBuiltIn: boolean;
  context?: string | undefined;
}

export interface UtilityTypeViolationInfo {
  type: UtilityTypeViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface UtilityTypesAnalysis {
  patterns: UtilityTypePatternInfo[];
  violations: UtilityTypeViolationInfo[];
  builtInCount: number;
  customCount: number;
  usesDeepUtilities: boolean;
  usesBrandedTypes: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const PARTIAL_PATTERNS = [
  /Partial<(\w+)>/g,
  /Partial<typeof\s+\w+>/g,
] as const;

export const REQUIRED_PATTERNS = [
  /Required<(\w+)>/g,
  /Required<typeof\s+\w+>/g,
] as const;

export const READONLY_PATTERNS = [
  /Readonly<(\w+)>/g,
  /Readonly<typeof\s+\w+>/g,
  /readonly\s+\w+\[\]/g,
] as const;

export const PICK_PATTERNS = [
  /Pick<(\w+),\s*['"`]?\w+['"`]?(?:\s*\|\s*['"`]?\w+['"`]?)*>/g,
  /Pick<(\w+),\s*keyof\s+\w+>/g,
] as const;

export const OMIT_PATTERNS = [
  /Omit<(\w+),\s*['"`]?\w+['"`]?(?:\s*\|\s*['"`]?\w+['"`]?)*>/g,
  /Omit<(\w+),\s*keyof\s+\w+>/g,
] as const;

export const RECORD_PATTERNS = [
  /Record<(\w+),\s*(\w+)>/g,
  /Record<string,\s*(\w+)>/g,
  /Record<number,\s*(\w+)>/g,
] as const;

export const EXCLUDE_PATTERNS = [
  /Exclude<(\w+),\s*(\w+)>/g,
  /Exclude<(\w+),\s*null\s*\|\s*undefined>/g,
] as const;

export const EXTRACT_PATTERNS = [
  /Extract<(\w+),\s*(\w+)>/g,
] as const;

export const NON_NULLABLE_PATTERNS = [
  /NonNullable<(\w+)>/g,
] as const;

export const RETURN_TYPE_PATTERNS = [
  /ReturnType<typeof\s+(\w+)>/g,
  /ReturnType<(\w+)>/g,
] as const;

export const PARAMETERS_PATTERNS = [
  /Parameters<typeof\s+(\w+)>/g,
  /Parameters<(\w+)>/g,
] as const;

export const INSTANCE_TYPE_PATTERNS = [
  /InstanceType<typeof\s+(\w+)>/g,
  /InstanceType<(\w+)>/g,
] as const;

export const AWAITED_PATTERNS = [
  /Awaited<(\w+)>/g,
  /Awaited<Promise<(\w+)>>/g,
  /Awaited<ReturnType<typeof\s+\w+>>/g,
] as const;

export const THIS_TYPE_PATTERNS = [
  /ThisType<(\w+)>/g,
  /ThisParameterType<(\w+)>/g,
  /OmitThisParameter<(\w+)>/g,
] as const;

export const CUSTOM_MAPPED_PATTERNS = [
  /type\s+(\w+)\s*<[^>]+>\s*=\s*\{\s*\[/g,
  /type\s+(\w+)\s*=\s*\{\s*\[\s*\w+\s+in/g,
  /\{\s*\[\s*\w+\s+in\s+keyof\s+\w+\s*\]\s*-?\s*\??\s*:/g,
  /\{\s*-?\s*readonly\s*\[\s*\w+\s+in/g,
] as const;

export const CUSTOM_CONDITIONAL_PATTERNS = [
  /type\s+(\w+)\s*<[^>]+>\s*=\s*\w+\s+extends\s+\w+\s*\?/g,
  /type\s+(\w+)\s*=\s*\w+\s+extends\s+infer\s+\w+\s*\?/g,
] as const;

export const TEMPLATE_LITERAL_PATTERNS = [
  /type\s+(\w+)\s*=\s*`\$\{[^}]+\}`/g,
  /`\$\{[^}]+\}\$\{[^}]+\}`/g,
  /Uppercase<(\w+)>/g,
  /Lowercase<(\w+)>/g,
  /Capitalize<(\w+)>/g,
  /Uncapitalize<(\w+)>/g,
] as const;

export const RECURSIVE_TYPE_PATTERNS = [
  /type\s+(\w+)\s*=\s*[^;]*\1[^;]*;/g,
  /type\s+(\w+)\s*<[^>]+>\s*=\s*[^;]*\1</g,
] as const;

export const BRANDED_TYPE_PATTERNS = [
  /type\s+(\w+)\s*=\s*\w+\s*&\s*\{\s*(?:readonly\s+)?__brand\s*:/g,
  /type\s+(\w+)\s*=\s*\w+\s*&\s*\{\s*(?:readonly\s+)?_tag\s*:/g,
  /type\s+(\w+)\s*=\s*\w+\s*&\s*\{\s*(?:readonly\s+)?__type\s*:/g,
  /declare\s+const\s+\w+:\s*unique\s+symbol/g,
] as const;

export const DEEP_PARTIAL_PATTERNS = [
  /type\s+DeepPartial\s*</g,
  /DeepPartial<(\w+)>/g,
] as const;

export const DEEP_READONLY_PATTERNS = [
  /type\s+DeepReadonly\s*</g,
  /DeepReadonly<(\w+)>/g,
] as const;

export const REDUNDANT_UTILITY_PATTERNS = [
  /Partial<Partial<(\w+)>>/g,
  /Required<Required<(\w+)>>/g,
  /Readonly<Readonly<(\w+)>>/g,
  /NonNullable<NonNullable<(\w+)>>/g,
] as const;

export const NESTED_UTILITY_PATTERNS = [
  /Partial<Required<(\w+)>>/g,
  /Required<Partial<(\w+)>>/g,
  /Pick<Omit<(\w+)/g,
  /Omit<Pick<(\w+)/g,
] as const;

export const COMPLEX_UTILITY_CHAIN_PATTERNS = [
  /\w+<\w+<\w+<\w+<\w+/g, // 4+ levels of nesting
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
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

function detectBuiltInUtility(
  content: string,
  filePath: string,
  patterns: readonly RegExp[],
  type: UtilityTypePatternType,
  utilityName: string
): UtilityTypePatternInfo[] {
  const results: UtilityTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type,
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          utilityName,
          targetType: match[1],
          isBuiltIn: true,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectPartial(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, PARTIAL_PATTERNS, 'partial', 'Partial');
}

export function detectRequired(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, REQUIRED_PATTERNS, 'required', 'Required');
}

export function detectReadonly(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, READONLY_PATTERNS, 'readonly', 'Readonly');
}

export function detectPick(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, PICK_PATTERNS, 'pick', 'Pick');
}

export function detectOmit(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, OMIT_PATTERNS, 'omit', 'Omit');
}

export function detectRecord(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, RECORD_PATTERNS, 'record', 'Record');
}

export function detectExclude(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, EXCLUDE_PATTERNS, 'exclude', 'Exclude');
}

export function detectExtract(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, EXTRACT_PATTERNS, 'extract', 'Extract');
}

export function detectNonNullable(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, NON_NULLABLE_PATTERNS, 'non-nullable', 'NonNullable');
}

export function detectReturnType(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, RETURN_TYPE_PATTERNS, 'return-type', 'ReturnType');
}

export function detectParameters(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, PARAMETERS_PATTERNS, 'parameters', 'Parameters');
}

export function detectInstanceType(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, INSTANCE_TYPE_PATTERNS, 'instance-type', 'InstanceType');
}

export function detectAwaited(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, AWAITED_PATTERNS, 'awaited', 'Awaited');
}

export function detectThisType(content: string, filePath: string): UtilityTypePatternInfo[] {
  return detectBuiltInUtility(content, filePath, THIS_TYPE_PATTERNS, 'this-type', 'ThisType');
}

export function detectCustomMapped(content: string, filePath: string): UtilityTypePatternInfo[] {
  const results: UtilityTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CUSTOM_MAPPED_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'custom-mapped',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          utilityName: match[1] || 'mapped-type',
          isBuiltIn: false,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectCustomConditional(content: string, filePath: string): UtilityTypePatternInfo[] {
  const results: UtilityTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CUSTOM_CONDITIONAL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'custom-conditional',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          utilityName: match[1],
          isBuiltIn: false,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTemplateLiteral(content: string, filePath: string): UtilityTypePatternInfo[] {
  const results: UtilityTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TEMPLATE_LITERAL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'template-literal',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          utilityName: match[1] || 'template-literal',
          isBuiltIn: /^(Uppercase|Lowercase|Capitalize|Uncapitalize)/.test(match[0]),
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectRecursiveType(content: string, filePath: string): UtilityTypePatternInfo[] {
  const results: UtilityTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of RECURSIVE_TYPE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'recursive-type',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          utilityName: match[1],
          isBuiltIn: false,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectBrandedType(content: string, filePath: string): UtilityTypePatternInfo[] {
  const results: UtilityTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of BRANDED_TYPE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'branded-type',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          utilityName: match[1] || 'branded-type',
          isBuiltIn: false,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectDeepPartial(content: string, filePath: string): UtilityTypePatternInfo[] {
  const results: UtilityTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DEEP_PARTIAL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'deep-partial',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          utilityName: 'DeepPartial',
          targetType: match[1],
          isBuiltIn: false,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectDeepReadonly(content: string, filePath: string): UtilityTypePatternInfo[] {
  const results: UtilityTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DEEP_READONLY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'deep-readonly',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          utilityName: 'DeepReadonly',
          targetType: match[1],
          isBuiltIn: false,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectRedundantUtilityViolations(
  content: string,
  filePath: string
): UtilityTypeViolationInfo[] {
  const results: UtilityTypeViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REDUNDANT_UTILITY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'redundant-utility',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Redundant nested utility type',
          suggestedFix: 'Remove the outer utility type',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function detectNestedUtilityViolations(
  content: string,
  filePath: string
): UtilityTypeViolationInfo[] {
  const results: UtilityTypeViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of NESTED_UTILITY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'nested-utility',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Potentially conflicting nested utility types',
          suggestedFix: 'Consider simplifying or using a custom type',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectComplexUtilityChainViolations(
  content: string,
  filePath: string
): UtilityTypeViolationInfo[] {
  const results: UtilityTypeViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of COMPLEX_UTILITY_CHAIN_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'complex-utility-chain',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Complex utility type chain (4+ levels)',
          suggestedFix: 'Break into intermediate types for readability',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeUtilityTypes(
  content: string,
  filePath: string
): UtilityTypesAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      builtInCount: 0,
      customCount: 0,
      usesDeepUtilities: false,
      usesBrandedTypes: false,
      confidence: 1.0,
    };
  }

  const patterns: UtilityTypePatternInfo[] = [
    ...detectPartial(content, filePath),
    ...detectRequired(content, filePath),
    ...detectReadonly(content, filePath),
    ...detectPick(content, filePath),
    ...detectOmit(content, filePath),
    ...detectRecord(content, filePath),
    ...detectExclude(content, filePath),
    ...detectExtract(content, filePath),
    ...detectNonNullable(content, filePath),
    ...detectReturnType(content, filePath),
    ...detectParameters(content, filePath),
    ...detectInstanceType(content, filePath),
    ...detectAwaited(content, filePath),
    ...detectThisType(content, filePath),
    ...detectCustomMapped(content, filePath),
    ...detectCustomConditional(content, filePath),
    ...detectTemplateLiteral(content, filePath),
    ...detectRecursiveType(content, filePath),
    ...detectBrandedType(content, filePath),
    ...detectDeepPartial(content, filePath),
    ...detectDeepReadonly(content, filePath),
  ];

  const violations: UtilityTypeViolationInfo[] = [
    ...detectRedundantUtilityViolations(content, filePath),
    ...detectNestedUtilityViolations(content, filePath),
    ...detectComplexUtilityChainViolations(content, filePath),
  ];

  const builtInCount = patterns.filter((p) => p.isBuiltIn).length;
  const customCount = patterns.filter((p) => !p.isBuiltIn).length;
  const usesDeepUtilities = patterns.some(
    (p) => p.type === 'deep-partial' || p.type === 'deep-readonly'
  );
  const usesBrandedTypes = patterns.some((p) => p.type === 'branded-type');

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (builtInCount > 0) {confidence += 0.05;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    builtInCount,
    customCount,
    usesDeepUtilities,
    usesBrandedTypes,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class UtilityTypesDetector extends RegexDetector {
  readonly id = 'types/utility-types';
  readonly name = 'Utility Types Detector';
  readonly description =
    'Detects TypeScript utility type patterns including built-in and custom utilities';
  readonly category: PatternCategory = 'types';
  readonly subcategory = 'utility-types';
  readonly supportedLanguages: Language[] = ['typescript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeUtilityTypes(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(
      analysis.violations.map((v) => ({
        type: v.type,
        file: v.file,
        line: v.line,
        column: v.column,
        value: v.matchedText,
        issue: v.issue,
        suggestedFix: v.suggestedFix,
        severity: v.severity === 'high' ? 'error' as const : v.severity === 'medium' ? 'warning' as const : 'info' as const,
      }))
    );

    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        builtInCount: analysis.builtInCount,
        customCount: analysis.customCount,
        usesDeepUtilities: analysis.usesDeepUtilities,
        usesBrandedTypes: analysis.usesBrandedTypes,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createUtilityTypesDetector(): UtilityTypesDetector {
  return new UtilityTypesDetector();
}
