/**
 * Generic Patterns Detector - Generic type pattern detection
 *
 * Detects generic type patterns including:
 * - Generic function declarations
 * - Generic class declarations
 * - Generic interface declarations
 * - Constrained generics (extends)
 * - Default generic parameters
 * - Multiple type parameters
 * - Generic type inference
 * - Higher-kinded types patterns
 *
 * @requirements 18.4 - Generic type patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type GenericPatternType =
  | 'generic-function'
  | 'generic-arrow-function'
  | 'generic-class'
  | 'generic-interface'
  | 'generic-type-alias'
  | 'constrained-generic'
  | 'default-generic'
  | 'multiple-type-params'
  | 'generic-method'
  | 'generic-constructor'
  | 'infer-keyword'
  | 'keyof-constraint'
  | 'mapped-generic'
  | 'conditional-generic';

export type GenericViolationType =
  | 'unused-generic'
  | 'overly-complex-generic'
  | 'missing-constraint'
  | 'redundant-constraint'
  | 'unclear-generic-name'
  | 'too-many-type-params';

export interface GenericPatternInfo {
  type: GenericPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  name?: string | undefined;
  typeParams?: string[] | undefined;
  constraints?: string[] | undefined;
  context?: string | undefined;
}

export interface GenericViolationInfo {
  type: GenericViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface GenericPatternsAnalysis {
  patterns: GenericPatternInfo[];
  violations: GenericViolationInfo[];
  genericFunctionCount: number;
  genericClassCount: number;
  genericInterfaceCount: number;
  usesConstraints: boolean;
  usesDefaults: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const GENERIC_FUNCTION_PATTERNS = [
  /function\s+(\w+)\s*<([^>]+)>\s*\(/g,
  /async\s+function\s+(\w+)\s*<([^>]+)>\s*\(/g,
  /export\s+function\s+(\w+)\s*<([^>]+)>\s*\(/g,
  /export\s+async\s+function\s+(\w+)\s*<([^>]+)>\s*\(/g,
] as const;

export const GENERIC_ARROW_FUNCTION_PATTERNS = [
  /const\s+(\w+)\s*=\s*<([^>]+)>\s*\(/g,
  /let\s+(\w+)\s*=\s*<([^>]+)>\s*\(/g,
  /(\w+)\s*:\s*<([^>]+)>\s*\([^)]*\)\s*=>/g,
] as const;

export const GENERIC_CLASS_PATTERNS = [
  /class\s+(\w+)\s*<([^>]+)>\s*(?:extends|implements|{)/g,
  /abstract\s+class\s+(\w+)\s*<([^>]+)>\s*/g,
  /export\s+class\s+(\w+)\s*<([^>]+)>\s*/g,
  /export\s+abstract\s+class\s+(\w+)\s*<([^>]+)>\s*/g,
] as const;

export const GENERIC_INTERFACE_PATTERNS = [
  /interface\s+(\w+)\s*<([^>]+)>\s*(?:extends|{)/g,
  /export\s+interface\s+(\w+)\s*<([^>]+)>\s*/g,
] as const;

export const GENERIC_TYPE_ALIAS_PATTERNS = [
  /type\s+(\w+)\s*<([^>]+)>\s*=/g,
  /export\s+type\s+(\w+)\s*<([^>]+)>\s*=/g,
] as const;

export const CONSTRAINED_GENERIC_PATTERNS = [
  /<(\w+)\s+extends\s+(\w+(?:\s*[|&]\s*\w+)*)>/g,
  /<(\w+)\s+extends\s+keyof\s+(\w+)>/g,
  /<(\w+)\s+extends\s+\{[^}]+\}>/g,
  /<(\w+)\s+extends\s+readonly\s+\w+\[\]>/g,
  /<(\w+)\s+extends\s+\([^)]+\)\s*=>\s*\w+>/g,
] as const;

export const DEFAULT_GENERIC_PATTERNS = [
  /<(\w+)\s*=\s*(\w+)>/g,
  /<(\w+)\s+extends\s+\w+\s*=\s*(\w+)>/g,
  /<[^>]*,\s*(\w+)\s*=\s*(\w+)[^>]*>/g,
] as const;

export const MULTIPLE_TYPE_PARAMS_PATTERNS = [
  /<(\w+)\s*,\s*(\w+)(?:\s*,\s*\w+)*>/g,
  /<(\w+)\s+extends\s+\w+\s*,\s*(\w+)>/g,
] as const;

export const GENERIC_METHOD_PATTERNS = [
  /(\w+)\s*<([^>]+)>\s*\([^)]*\)\s*(?::\s*\w+)?/g,
  /async\s+(\w+)\s*<([^>]+)>\s*\(/g,
] as const;

export const INFER_KEYWORD_PATTERNS = [
  /infer\s+(\w+)/g,
  /\?\s*infer\s+(\w+)\s*:/g,
] as const;

export const KEYOF_CONSTRAINT_PATTERNS = [
  /keyof\s+(\w+)/g,
  /\[\s*\w+\s+in\s+keyof\s+(\w+)\s*\]/g,
] as const;

export const MAPPED_GENERIC_PATTERNS = [
  /\{\s*\[\s*(\w+)\s+in\s+(\w+)\s*\]\s*:/g,
  /\{\s*\[\s*(\w+)\s+in\s+keyof\s+(\w+)\s*\]\s*:/g,
  /\{\s*-?\s*readonly\s*\[\s*(\w+)\s+in/g,
  /\{\s*\[\s*(\w+)\s+in\s+\w+\s*\]\s*-?\s*\??\s*:/g,
] as const;

export const CONDITIONAL_GENERIC_PATTERNS = [
  /(\w+)\s+extends\s+(\w+)\s*\?\s*(\w+)\s*:\s*(\w+)/g,
  /(\w+)\s+extends\s+infer\s+(\w+)\s*\?/g,
] as const;

export const UNUSED_GENERIC_PATTERNS = [
  // Generic declared but not used in params or return
  /function\s+\w+\s*<(\w+)>\s*\(\s*\)\s*:\s*(?!.*\1)/g,
] as const;

export const OVERLY_COMPLEX_GENERIC_PATTERNS = [
  // More than 4 type parameters
  /<\w+(?:\s+extends\s+[^,>]+)?\s*,\s*\w+(?:\s+extends\s+[^,>]+)?\s*,\s*\w+(?:\s+extends\s+[^,>]+)?\s*,\s*\w+(?:\s+extends\s+[^,>]+)?\s*,\s*\w+/g,
  // Deeply nested generics
  /<[^>]*<[^>]*<[^>]*<[^>]*>/g,
] as const;

export const UNCLEAR_GENERIC_NAME_PATTERNS = [
  /<([A-Z]{3,})(?:\s+extends|\s*,|\s*>)/g,
  /<(Data|Item|Value|Element|Thing|Obj|Arr)(?:\s+extends|\s*,|\s*>)/g,
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

function parseTypeParams(typeParamStr: string): string[] {
  const params: string[] = [];
  let depth = 0;
  let current = '';
  
  for (const char of typeParamStr) {
    if (char === '<') {depth++;}
    else if (char === '>') {depth--;}
    else if (char === ',' && depth === 0) {
      const param = current.trim().split(/\s+/)[0];
      if (param) {params.push(param);}
      current = '';
      continue;
    }
    current += char;
  }
  
  const lastParam = current.trim().split(/\s+/)[0];
  if (lastParam) {params.push(lastParam);}
  
  return params;
}

export function detectGenericFunctions(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of GENERIC_FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const typeParams = parseTypeParams(match[2] || '');
        results.push({
          type: 'generic-function',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          typeParams,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectGenericArrowFunctions(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of GENERIC_ARROW_FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const typeParams = parseTypeParams(match[2] || '');
        results.push({
          type: 'generic-arrow-function',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          typeParams,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectGenericClasses(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of GENERIC_CLASS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const typeParams = parseTypeParams(match[2] || '');
        results.push({
          type: 'generic-class',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          typeParams,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectGenericInterfaces(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of GENERIC_INTERFACE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const typeParams = parseTypeParams(match[2] || '');
        results.push({
          type: 'generic-interface',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          typeParams,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectGenericTypeAliases(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of GENERIC_TYPE_ALIAS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const typeParams = parseTypeParams(match[2] || '');
        results.push({
          type: 'generic-type-alias',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          typeParams,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectConstrainedGenerics(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CONSTRAINED_GENERIC_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'constrained-generic',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          constraints: match[2] ? [match[2]] : undefined,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectDefaultGenerics(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DEFAULT_GENERIC_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'default-generic',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectMultipleTypeParams(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of MULTIPLE_TYPE_PARAMS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'multiple-type-params',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          typeParams: [match[1]!, match[2]!].filter(Boolean),
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectGenericMethods(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of GENERIC_METHOD_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const typeParams = parseTypeParams(match[2] || '');
        results.push({
          type: 'generic-method',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          typeParams,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectInferKeyword(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of INFER_KEYWORD_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'infer-keyword',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectKeyofConstraint(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of KEYOF_CONSTRAINT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'keyof-constraint',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectMappedGenerics(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of MAPPED_GENERIC_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'mapped-generic',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectConditionalGenerics(
  content: string,
  filePath: string
): GenericPatternInfo[] {
  const results: GenericPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CONDITIONAL_GENERIC_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'conditional-generic',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectOverlyComplexGenerics(
  content: string,
  filePath: string
): GenericViolationInfo[] {
  const results: GenericViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of OVERLY_COMPLEX_GENERIC_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'overly-complex-generic',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Generic type is overly complex',
          suggestedFix: 'Consider breaking into smaller, composable types',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectUnclearGenericNames(
  content: string,
  filePath: string
): GenericViolationInfo[] {
  const results: GenericViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of UNCLEAR_GENERIC_NAME_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'unclear-generic-name',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: `Generic parameter "${match[1]}" has unclear naming`,
          suggestedFix: 'Use single letters (T, K, V) or descriptive names (TItem, TKey)',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function detectTooManyTypeParams(
  content: string,
  filePath: string
): GenericViolationInfo[] {
  const results: GenericViolationInfo[] = [];
  const lines = content.split('\n');
  
  const typeParamPattern = /<([^>]+)>/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let match;
    while ((match = typeParamPattern.exec(line)) !== null) {
      const params = parseTypeParams(match[1] || '');
      if (params.length > 4) {
        results.push({
          type: 'too-many-type-params',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: `Too many type parameters (${params.length})`,
          suggestedFix: 'Consider using an options object type or breaking into smaller types',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeGenericPatterns(
  content: string,
  filePath: string
): GenericPatternsAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      genericFunctionCount: 0,
      genericClassCount: 0,
      genericInterfaceCount: 0,
      usesConstraints: false,
      usesDefaults: false,
      confidence: 1.0,
    };
  }

  const patterns: GenericPatternInfo[] = [
    ...detectGenericFunctions(content, filePath),
    ...detectGenericArrowFunctions(content, filePath),
    ...detectGenericClasses(content, filePath),
    ...detectGenericInterfaces(content, filePath),
    ...detectGenericTypeAliases(content, filePath),
    ...detectConstrainedGenerics(content, filePath),
    ...detectDefaultGenerics(content, filePath),
    ...detectMultipleTypeParams(content, filePath),
    ...detectGenericMethods(content, filePath),
    ...detectInferKeyword(content, filePath),
    ...detectKeyofConstraint(content, filePath),
    ...detectMappedGenerics(content, filePath),
    ...detectConditionalGenerics(content, filePath),
  ];

  const violations: GenericViolationInfo[] = [
    ...detectOverlyComplexGenerics(content, filePath),
    ...detectUnclearGenericNames(content, filePath),
    ...detectTooManyTypeParams(content, filePath),
  ];

  const genericFunctionCount = patterns.filter(
    (p) => p.type === 'generic-function' || p.type === 'generic-arrow-function'
  ).length;
  const genericClassCount = patterns.filter((p) => p.type === 'generic-class').length;
  const genericInterfaceCount = patterns.filter((p) => p.type === 'generic-interface').length;
  const usesConstraints = patterns.some((p) => p.type === 'constrained-generic');
  const usesDefaults = patterns.some((p) => p.type === 'default-generic');

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (usesConstraints) {confidence += 0.05;}
  if (usesDefaults) {confidence += 0.05;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    genericFunctionCount,
    genericClassCount,
    genericInterfaceCount,
    usesConstraints,
    usesDefaults,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class GenericPatternsDetector extends RegexDetector {
  readonly id = 'types/generic-patterns';
  readonly name = 'Generic Patterns Detector';
  readonly description =
    'Detects generic type patterns including constraints, defaults, and advanced patterns';
  readonly category: PatternCategory = 'types';
  readonly subcategory = 'generic-patterns';
  readonly supportedLanguages: Language[] = ['typescript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeGenericPatterns(context.content, context.file);

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
        genericFunctionCount: analysis.genericFunctionCount,
        genericClassCount: analysis.genericClassCount,
        genericInterfaceCount: analysis.genericInterfaceCount,
        usesConstraints: analysis.usesConstraints,
        usesDefaults: analysis.usesDefaults,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createGenericPatternsDetector(): GenericPatternsDetector {
  return new GenericPatternsDetector();
}
