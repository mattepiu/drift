/**
 * Type Assertions Detector - Type assertion pattern detection
 *
 * Detects type assertion patterns including:
 * - as keyword assertions
 * - Angle bracket assertions
 * - Non-null assertions (!)
 * - const assertions
 * - satisfies operator
 * - Type guards
 * - Type predicates
 *
 * @requirements 18.6 - Type assertion patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type TypeAssertionPatternType =
  | 'as-assertion'
  | 'as-const'
  | 'as-unknown'
  | 'as-any'
  | 'angle-bracket'
  | 'non-null-assertion'
  | 'definite-assignment'
  | 'satisfies'
  | 'type-guard-typeof'
  | 'type-guard-instanceof'
  | 'type-guard-in'
  | 'type-predicate'
  | 'assertion-function'
  | 'double-assertion';

export type TypeAssertionViolationType =
  | 'unsafe-as-any'
  | 'excessive-non-null'
  | 'double-assertion'
  | 'unnecessary-assertion'
  | 'missing-type-guard';

export interface TypeAssertionPatternInfo {
  type: TypeAssertionPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  targetType?: string | undefined;
  guardType?: string | undefined;
  context?: string | undefined;
}

export interface TypeAssertionViolationInfo {
  type: TypeAssertionViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface TypeAssertionsAnalysis {
  patterns: TypeAssertionPatternInfo[];
  violations: TypeAssertionViolationInfo[];
  asAssertionCount: number;
  nonNullAssertionCount: number;
  typeGuardCount: number;
  usesSatisfies: boolean;
  usesConstAssertions: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const AS_ASSERTION_PATTERNS = [
  /\)\s+as\s+(\w+(?:<[^>]+>)?)/g,
  /\]\s+as\s+(\w+(?:<[^>]+>)?)/g,
  /\w+\s+as\s+(\w+(?:<[^>]+>)?)/g,
] as const;

export const AS_CONST_PATTERNS = [
  /as\s+const\b/g,
  /\]\s+as\s+const\b/g,
  /\}\s+as\s+const\b/g,
] as const;

export const AS_UNKNOWN_PATTERNS = [
  /as\s+unknown\b/g,
] as const;

export const AS_ANY_PATTERNS = [
  /as\s+any\b/g,
] as const;

export const ANGLE_BRACKET_PATTERNS = [
  /<(\w+(?:<[^>]+>)?)>\s*\w+/g,
  /<(\w+(?:<[^>]+>)?)>\s*\(/g,
] as const;

export const NON_NULL_ASSERTION_PATTERNS = [
  /\w+!/g,
  /\)!/g,
  /\]!/g,
] as const;

export const DEFINITE_ASSIGNMENT_PATTERNS = [
  /\w+!:\s*\w+/g,
  /private\s+\w+!:/g,
  /public\s+\w+!:/g,
  /protected\s+\w+!:/g,
  /readonly\s+\w+!:/g,
] as const;

export const SATISFIES_PATTERNS = [
  /satisfies\s+(\w+(?:<[^>]+>)?)/g,
  /\}\s+satisfies\s+(\w+)/g,
  /\]\s+satisfies\s+(\w+)/g,
] as const;

export const TYPE_GUARD_TYPEOF_PATTERNS = [
  /typeof\s+\w+\s*===?\s*['"`](\w+)['"`]/g,
  /typeof\s+\w+\s*!==?\s*['"`](\w+)['"`]/g,
  /['"`](\w+)['"`]\s*===?\s*typeof\s+\w+/g,
] as const;

export const TYPE_GUARD_INSTANCEOF_PATTERNS = [
  /\w+\s+instanceof\s+(\w+)/g,
] as const;

export const TYPE_GUARD_IN_PATTERNS = [
  /['"`](\w+)['"`]\s+in\s+\w+/g,
  /\w+\s+in\s+\w+/g,
] as const;

export const TYPE_PREDICATE_PATTERNS = [
  /\):\s*\w+\s+is\s+(\w+(?:<[^>]+>)?)/g,
  /function\s+\w+\([^)]*\):\s*\w+\s+is\s+(\w+)/g,
] as const;

export const ASSERTION_FUNCTION_PATTERNS = [
  /function\s+\w+\([^)]*\):\s*asserts\s+\w+/g,
  /\):\s*asserts\s+\w+\s+is\s+(\w+)/g,
  /\):\s*asserts\s+\w+/g,
] as const;

export const DOUBLE_ASSERTION_PATTERNS = [
  /as\s+unknown\s+as\s+(\w+)/g,
  /as\s+any\s+as\s+(\w+)/g,
  /as\s+\w+\s+as\s+(\w+)/g,
] as const;

export const UNSAFE_AS_ANY_PATTERNS = [
  /\w+\s+as\s+any\b/g,
  /\)\s+as\s+any\b/g,
] as const;

export const EXCESSIVE_NON_NULL_PATTERNS = [
  /\w+!!+/g,
  /\w+!\.\w+!/g,
  /\w+!\[\w+\]!/g,
] as const;

export const UNNECESSARY_ASSERTION_PATTERNS = [
  /:\s*(\w+)\s*=\s*\w+\s+as\s+\1\b/g,
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

export function detectAsAssertions(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip as const, as unknown, as any (handled separately)
    if (/as\s+(const|unknown|any)\b/.test(line)) {continue;}
    
    for (const pattern of AS_ASSERTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        if (match[1] && !['const', 'unknown', 'any'].includes(match[1])) {
          results.push({
            type: 'as-assertion',
            file: filePath,
            line: i + 1,
            column: match.index + 1,
            matchedText: match[0],
            targetType: match[1],
            context: line.trim(),
          });
        }
      }
    }
  }

  return results;
}

export function detectAsConst(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of AS_CONST_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'as-const',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          targetType: 'const',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAsUnknown(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of AS_UNKNOWN_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'as-unknown',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          targetType: 'unknown',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAsAny(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of AS_ANY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'as-any',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          targetType: 'any',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAngleBracket(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip JSX/TSX files for angle bracket detection
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {continue;}
    
    for (const pattern of ANGLE_BRACKET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'angle-bracket',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          targetType: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectNonNullAssertion(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip definite assignment assertions
    if (/\w+!:/.test(line)) {continue;}
    // Skip comments
    if (/^\s*\/\//.test(line)) {continue;}
    
    for (const pattern of NON_NULL_ASSERTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        // Skip if it's !== or !=
        if (line.slice(match.index).startsWith('!==') || line.slice(match.index).startsWith('!=')) {continue;}
        
        results.push({
          type: 'non-null-assertion',
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

export function detectDefiniteAssignment(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DEFINITE_ASSIGNMENT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'definite-assignment',
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

export function detectSatisfies(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SATISFIES_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'satisfies',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          targetType: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypeGuardTypeof(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_GUARD_TYPEOF_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'type-guard-typeof',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          guardType: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypeGuardInstanceof(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_GUARD_INSTANCEOF_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'type-guard-instanceof',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          guardType: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypeGuardIn(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip for...in loops
    if (/for\s*\(/.test(line)) {continue;}
    
    for (const pattern of TYPE_GUARD_IN_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'type-guard-in',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          guardType: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypePredicate(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_PREDICATE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'type-predicate',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          targetType: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAssertionFunction(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ASSERTION_FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'assertion-function',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          targetType: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectDoubleAssertion(
  content: string,
  filePath: string
): TypeAssertionPatternInfo[] {
  const results: TypeAssertionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DOUBLE_ASSERTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'double-assertion',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          targetType: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectUnsafeAsAnyViolations(
  content: string,
  filePath: string
): TypeAssertionViolationInfo[] {
  const results: TypeAssertionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of UNSAFE_AS_ANY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'unsafe-as-any',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Unsafe type assertion to any',
          suggestedFix: 'Use unknown with type guards or proper typing',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectExcessiveNonNullViolations(
  content: string,
  filePath: string
): TypeAssertionViolationInfo[] {
  const results: TypeAssertionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of EXCESSIVE_NON_NULL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'excessive-non-null',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Excessive non-null assertions',
          suggestedFix: 'Use optional chaining or proper null checks',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectDoubleAssertionViolations(
  content: string,
  filePath: string
): TypeAssertionViolationInfo[] {
  const results: TypeAssertionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DOUBLE_ASSERTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'double-assertion',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Double type assertion bypasses type safety',
          suggestedFix: 'Use type guards or proper type narrowing',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectUnnecessaryAssertionViolations(
  content: string,
  filePath: string
): TypeAssertionViolationInfo[] {
  const results: TypeAssertionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of UNNECESSARY_ASSERTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'unnecessary-assertion',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Unnecessary type assertion to same type',
          suggestedFix: 'Remove the redundant assertion',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function analyzeTypeAssertions(
  content: string,
  filePath: string
): TypeAssertionsAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      asAssertionCount: 0,
      nonNullAssertionCount: 0,
      typeGuardCount: 0,
      usesSatisfies: false,
      usesConstAssertions: false,
      confidence: 1.0,
    };
  }

  const patterns: TypeAssertionPatternInfo[] = [
    ...detectAsAssertions(content, filePath),
    ...detectAsConst(content, filePath),
    ...detectAsUnknown(content, filePath),
    ...detectAsAny(content, filePath),
    ...detectAngleBracket(content, filePath),
    ...detectNonNullAssertion(content, filePath),
    ...detectDefiniteAssignment(content, filePath),
    ...detectSatisfies(content, filePath),
    ...detectTypeGuardTypeof(content, filePath),
    ...detectTypeGuardInstanceof(content, filePath),
    ...detectTypeGuardIn(content, filePath),
    ...detectTypePredicate(content, filePath),
    ...detectAssertionFunction(content, filePath),
    ...detectDoubleAssertion(content, filePath),
  ];

  const violations: TypeAssertionViolationInfo[] = [
    ...detectUnsafeAsAnyViolations(content, filePath),
    ...detectExcessiveNonNullViolations(content, filePath),
    ...detectDoubleAssertionViolations(content, filePath),
    ...detectUnnecessaryAssertionViolations(content, filePath),
  ];

  const asAssertionCount = patterns.filter(
    (p) => p.type === 'as-assertion' || p.type === 'as-const' || p.type === 'as-unknown' || p.type === 'as-any'
  ).length;
  const nonNullAssertionCount = patterns.filter((p) => p.type === 'non-null-assertion').length;
  const typeGuardCount = patterns.filter(
    (p) => p.type.startsWith('type-guard-') || p.type === 'type-predicate'
  ).length;
  const usesSatisfies = patterns.some((p) => p.type === 'satisfies');
  const usesConstAssertions = patterns.some((p) => p.type === 'as-const');

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (typeGuardCount > 0) {confidence += 0.05;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    asAssertionCount,
    nonNullAssertionCount,
    typeGuardCount,
    usesSatisfies,
    usesConstAssertions,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class TypeAssertionsDetector extends RegexDetector {
  readonly id = 'types/type-assertions';
  readonly name = 'Type Assertions Detector';
  readonly description =
    'Detects type assertion patterns including as, non-null, and type guards';
  readonly category: PatternCategory = 'types';
  readonly subcategory = 'type-assertions';
  readonly supportedLanguages: Language[] = ['typescript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeTypeAssertions(context.content, context.file);

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
        asAssertionCount: analysis.asAssertionCount,
        nonNullAssertionCount: analysis.nonNullAssertionCount,
        typeGuardCount: analysis.typeGuardCount,
        usesSatisfies: analysis.usesSatisfies,
        usesConstAssertions: analysis.usesConstAssertions,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createTypeAssertionsDetector(): TypeAssertionsDetector {
  return new TypeAssertionsDetector();
}
