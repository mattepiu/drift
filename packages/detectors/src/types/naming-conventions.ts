/**
 * Naming Conventions Detector - Type naming convention pattern detection
 *
 * Detects type naming patterns including:
 * - PascalCase for types/interfaces
 * - Prefix conventions (I for interfaces, T for types)
 * - Suffix conventions (Props, State, Config, Options)
 * - Enum naming patterns
 * - Generic parameter naming
 *
 * @requirements 18.2 - Type naming convention patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type NamingConventionPatternType =
  | 'pascal-case-type'
  | 'pascal-case-interface'
  | 'i-prefix-interface'
  | 't-prefix-type'
  | 'props-suffix'
  | 'state-suffix'
  | 'config-suffix'
  | 'options-suffix'
  | 'enum-pascal-case'
  | 'generic-single-letter';

export type NamingConventionViolationType =
  | 'non-pascal-case'
  | 'inconsistent-prefix'
  | 'missing-suffix'
  | 'unclear-generic-name'
  | 'hungarian-notation';

export interface NamingConventionPatternInfo {
  type: NamingConventionPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  typeName: string;
  convention?: string | undefined;
  context?: string | undefined;
}

export interface NamingConventionViolationInfo {
  type: NamingConventionViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface NamingConventionAnalysis {
  patterns: NamingConventionPatternInfo[];
  violations: NamingConventionViolationInfo[];
  usesPascalCase: boolean;
  usesIPrefixForInterfaces: boolean;
  conventions: string[];
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const PASCAL_CASE_TYPE_PATTERNS = [
  /type\s+([A-Z][a-zA-Z0-9]*)\s*(?:<[^>]*>)?\s*=/g,
] as const;

export const PASCAL_CASE_INTERFACE_PATTERNS = [
  /interface\s+([A-Z][a-zA-Z0-9]*)\s*(?:<[^>]*>)?\s*(?:extends|{)/g,
] as const;

export const I_PREFIX_INTERFACE_PATTERNS = [
  /interface\s+(I[A-Z][a-zA-Z0-9]*)\s*/g,
] as const;

export const T_PREFIX_TYPE_PATTERNS = [
  /type\s+(T[A-Z][a-zA-Z0-9]*)\s*=/g,
] as const;

export const PROPS_SUFFIX_PATTERNS = [
  /(?:type|interface)\s+(\w+Props)\s*/g,
  /(?:type|interface)\s+(\w+PropsType)\s*/g,
] as const;

export const STATE_SUFFIX_PATTERNS = [
  /(?:type|interface)\s+(\w+State)\s*/g,
  /(?:type|interface)\s+(\w+StateType)\s*/g,
] as const;

export const CONFIG_SUFFIX_PATTERNS = [
  /(?:type|interface)\s+(\w+Config)\s*/g,
  /(?:type|interface)\s+(\w+Configuration)\s*/g,
] as const;

export const OPTIONS_SUFFIX_PATTERNS = [
  /(?:type|interface)\s+(\w+Options)\s*/g,
  /(?:type|interface)\s+(\w+Opts)\s*/g,
] as const;

export const ENUM_PASCAL_CASE_PATTERNS = [
  /enum\s+([A-Z][a-zA-Z0-9]*)\s*\{/g,
  /const\s+enum\s+([A-Z][a-zA-Z0-9]*)\s*\{/g,
] as const;

export const GENERIC_SINGLE_LETTER_PATTERNS = [
  /<([TUKVRESNMABCD])(?:\s+extends|\s*,|\s*>)/g,
  /<([TUKVRESNMABCD]),\s*([TUKVRESNMABCD])(?:\s*,|\s*>)/g,
] as const;

export const NON_PASCAL_CASE_PATTERNS = [
  /type\s+([a-z][a-zA-Z0-9]*)\s*=/g, // camelCase type
  /interface\s+([a-z][a-zA-Z0-9]*)\s*/g, // camelCase interface
  /type\s+([A-Z_]+)\s*=/g, // SCREAMING_SNAKE_CASE type
  /type\s+([a-z_]+)\s*=/g, // snake_case type
] as const;

export const HUNGARIAN_NOTATION_PATTERNS = [
  /(?:type|interface)\s+(str[A-Z]\w*)\s*/g,
  /(?:type|interface)\s+(num[A-Z]\w*)\s*/g,
  /(?:type|interface)\s+(bool[A-Z]\w*)\s*/g,
  /(?:type|interface)\s+(arr[A-Z]\w*)\s*/g,
  /(?:type|interface)\s+(obj[A-Z]\w*)\s*/g,
] as const;

export const UNCLEAR_GENERIC_PATTERNS = [
  /<([A-Z]{2,})(?:\s+extends|\s*,|\s*>)/g, // Multi-letter unclear generics
  /<(Data|Item|Value|Element|Thing)(?:\s+extends|\s*,|\s*>)/g, // Too generic names
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

export function detectPascalCaseTypes(
  content: string,
  filePath: string
): NamingConventionPatternInfo[] {
  const results: NamingConventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of PASCAL_CASE_TYPE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'pascal-case-type',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          typeName: match[1]!,
          convention: 'PascalCase',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectPascalCaseInterfaces(
  content: string,
  filePath: string
): NamingConventionPatternInfo[] {
  const results: NamingConventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of PASCAL_CASE_INTERFACE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'pascal-case-interface',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          typeName: match[1]!,
          convention: 'PascalCase',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectIPrefixInterfaces(
  content: string,
  filePath: string
): NamingConventionPatternInfo[] {
  const results: NamingConventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of I_PREFIX_INTERFACE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'i-prefix-interface',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          typeName: match[1]!,
          convention: 'I-prefix',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTPrefixTypes(
  content: string,
  filePath: string
): NamingConventionPatternInfo[] {
  const results: NamingConventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of T_PREFIX_TYPE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 't-prefix-type',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          typeName: match[1]!,
          convention: 'T-prefix',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectPropsSuffix(
  content: string,
  filePath: string
): NamingConventionPatternInfo[] {
  const results: NamingConventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of PROPS_SUFFIX_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'props-suffix',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          typeName: match[1]!,
          convention: 'Props-suffix',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectStateSuffix(
  content: string,
  filePath: string
): NamingConventionPatternInfo[] {
  const results: NamingConventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of STATE_SUFFIX_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'state-suffix',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          typeName: match[1]!,
          convention: 'State-suffix',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectConfigSuffix(
  content: string,
  filePath: string
): NamingConventionPatternInfo[] {
  const results: NamingConventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CONFIG_SUFFIX_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'config-suffix',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          typeName: match[1]!,
          convention: 'Config-suffix',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectEnumPascalCase(
  content: string,
  filePath: string
): NamingConventionPatternInfo[] {
  const results: NamingConventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ENUM_PASCAL_CASE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'enum-pascal-case',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          typeName: match[1]!,
          convention: 'PascalCase-enum',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectGenericSingleLetter(
  content: string,
  filePath: string
): NamingConventionPatternInfo[] {
  const results: NamingConventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of GENERIC_SINGLE_LETTER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'generic-single-letter',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          typeName: match[1]!,
          convention: 'single-letter-generic',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectNonPascalCaseViolations(
  content: string,
  filePath: string
): NamingConventionViolationInfo[] {
  const results: NamingConventionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of NON_PASCAL_CASE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const typeName = match[1]!;
        const suggestedName = typeName.charAt(0).toUpperCase() + typeName.slice(1);
        results.push({
          type: 'non-pascal-case',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: `Type "${typeName}" should use PascalCase`,
          suggestedFix: `Rename to ${suggestedName}`,
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectHungarianNotationViolations(
  content: string,
  filePath: string
): NamingConventionViolationInfo[] {
  const results: NamingConventionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of HUNGARIAN_NOTATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'hungarian-notation',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Hungarian notation is discouraged in TypeScript',
          suggestedFix: 'Use descriptive names without type prefixes',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function detectUnclearGenericViolations(
  content: string,
  filePath: string
): NamingConventionViolationInfo[] {
  const results: NamingConventionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of UNCLEAR_GENERIC_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'unclear-generic-name',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: `Generic parameter "${match[1]}" is unclear`,
          suggestedFix: 'Use single letters (T, K, V) or descriptive names (TItem, TKey)',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function analyzeNamingConventions(
  content: string,
  filePath: string
): NamingConventionAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      usesPascalCase: false,
      usesIPrefixForInterfaces: false,
      conventions: [],
      confidence: 1.0,
    };
  }

  const patterns: NamingConventionPatternInfo[] = [
    ...detectPascalCaseTypes(content, filePath),
    ...detectPascalCaseInterfaces(content, filePath),
    ...detectIPrefixInterfaces(content, filePath),
    ...detectTPrefixTypes(content, filePath),
    ...detectPropsSuffix(content, filePath),
    ...detectStateSuffix(content, filePath),
    ...detectConfigSuffix(content, filePath),
    ...detectEnumPascalCase(content, filePath),
    ...detectGenericSingleLetter(content, filePath),
  ];

  const violations: NamingConventionViolationInfo[] = [
    ...detectNonPascalCaseViolations(content, filePath),
    ...detectHungarianNotationViolations(content, filePath),
    ...detectUnclearGenericViolations(content, filePath),
  ];

  const usesPascalCase = patterns.some(
    (p) => p.type === 'pascal-case-type' || p.type === 'pascal-case-interface'
  );
  const usesIPrefixForInterfaces = patterns.some((p) => p.type === 'i-prefix-interface');

  const conventions = [...new Set(patterns.filter((p) => p.convention).map((p) => p.convention!))];

  let confidence = 0.7;
  if (usesPascalCase) {confidence += 0.15;}
  if (conventions.length > 0) {confidence += 0.1;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    usesPascalCase,
    usesIPrefixForInterfaces,
    conventions,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class NamingConventionsDetector extends RegexDetector {
  readonly id = 'types/naming-conventions';
  readonly name = 'Naming Conventions Detector';
  readonly description =
    'Detects type naming convention patterns and identifies violations';
  readonly category: PatternCategory = 'types';
  readonly subcategory = 'naming-conventions';
  readonly supportedLanguages: Language[] = ['typescript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeNamingConventions(context.content, context.file);

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
        usesPascalCase: analysis.usesPascalCase,
        usesIPrefixForInterfaces: analysis.usesIPrefixForInterfaces,
        conventions: analysis.conventions,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createNamingConventionsDetector(): NamingConventionsDetector {
  return new NamingConventionsDetector();
}
