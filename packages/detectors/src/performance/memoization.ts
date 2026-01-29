/**
 * Memoization Detector - Memoization pattern detection
 *
 * Detects memoization patterns including:
 * - React.memo
 * - useMemo
 * - useCallback
 * - Custom memoization
 * - Selector memoization (reselect)
 *
 * @requirements 19.3 - Memoization patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type MemoizationPatternType =
  | 'react-memo'
  | 'use-memo'
  | 'use-callback'
  | 'reselect'
  | 'custom-memoize'
  | 'lodash-memoize'
  | 'memo-one';

export type MemoizationViolationType =
  | 'missing-deps'
  | 'empty-deps'
  | 'inline-object-deps'
  | 'unnecessary-memo';

export interface MemoizationPatternInfo {
  type: MemoizationPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  context?: string | undefined;
}

export interface MemoizationViolationInfo {
  type: MemoizationViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface MemoizationAnalysis {
  patterns: MemoizationPatternInfo[];
  violations: MemoizationViolationInfo[];
  useMemoCount: number;
  useCallbackCount: number;
  reactMemoCount: number;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const REACT_MEMO_PATTERNS = [
  /React\.memo\s*\(/g,
  /memo\s*\(\s*(?:function|\(|[A-Z])/g,
  /export\s+default\s+memo\s*\(/g,
] as const;

export const USE_MEMO_PATTERNS = [
  /useMemo\s*\(\s*\(\)\s*=>/g,
  /useMemo\s*\(\s*function/g,
  /const\s+\w+\s*=\s*useMemo\s*\(/g,
] as const;

export const USE_CALLBACK_PATTERNS = [
  /useCallback\s*\(\s*\(/g,
  /useCallback\s*\(\s*function/g,
  /useCallback\s*\(\s*async/g,
  /const\s+\w+\s*=\s*useCallback\s*\(/g,
] as const;

export const RESELECT_PATTERNS = [
  /createSelector\s*\(/g,
  /createStructuredSelector\s*\(/g,
  /from\s+['"`]reselect['"`]/g,
  /from\s+['"`]@reduxjs\/toolkit['"`]/g,
] as const;

export const CUSTOM_MEMOIZE_PATTERNS = [
  // JavaScript/TypeScript
  /memoize\s*\(/g,
  /memoized/gi,
  /cache\s*=\s*new\s+Map/g,
  /WeakMap\s*\(\)/g,
  // Python
  /@lru_cache/g,
  /@cache/g,
  /functools\.lru_cache/g,
  /functools\.cache/g,
  /@cached_property/g,
  /cachetools/gi,
] as const;

export const LODASH_MEMOIZE_PATTERNS = [
  /_.memoize\s*\(/g,
  /memoize\s*\(\s*function/g,
  /from\s+['"`]lodash\/memoize['"`]/g,
] as const;

export const MEMO_ONE_PATTERNS = [
  /memoizeOne\s*\(/g,
  /from\s+['"`]memoize-one['"`]/g,
] as const;

export const EMPTY_DEPS_PATTERNS = [
  /useMemo\s*\([^)]+,\s*\[\s*\]\s*\)/g,
  /useCallback\s*\([^)]+,\s*\[\s*\]\s*\)/g,
] as const;

export const INLINE_OBJECT_DEPS_PATTERNS = [
  /useMemo\s*\([^)]+,\s*\[\s*\{/g,
  /useCallback\s*\([^)]+,\s*\[\s*\{/g,
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

function detectPatterns(
  content: string,
  filePath: string,
  patterns: readonly RegExp[],
  type: MemoizationPatternType
): MemoizationPatternInfo[] {
  const results: MemoizationPatternInfo[] = [];
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
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectReactMemo(content: string, filePath: string): MemoizationPatternInfo[] {
  return detectPatterns(content, filePath, REACT_MEMO_PATTERNS, 'react-memo');
}

export function detectUseMemo(content: string, filePath: string): MemoizationPatternInfo[] {
  return detectPatterns(content, filePath, USE_MEMO_PATTERNS, 'use-memo');
}

export function detectUseCallback(content: string, filePath: string): MemoizationPatternInfo[] {
  return detectPatterns(content, filePath, USE_CALLBACK_PATTERNS, 'use-callback');
}

export function detectReselect(content: string, filePath: string): MemoizationPatternInfo[] {
  return detectPatterns(content, filePath, RESELECT_PATTERNS, 'reselect');
}

export function detectCustomMemoize(content: string, filePath: string): MemoizationPatternInfo[] {
  return detectPatterns(content, filePath, CUSTOM_MEMOIZE_PATTERNS, 'custom-memoize');
}

export function detectLodashMemoize(content: string, filePath: string): MemoizationPatternInfo[] {
  return detectPatterns(content, filePath, LODASH_MEMOIZE_PATTERNS, 'lodash-memoize');
}

export function detectMemoOne(content: string, filePath: string): MemoizationPatternInfo[] {
  return detectPatterns(content, filePath, MEMO_ONE_PATTERNS, 'memo-one');
}

export function detectEmptyDepsViolations(
  content: string,
  filePath: string
): MemoizationViolationInfo[] {
  const results: MemoizationViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of EMPTY_DEPS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'empty-deps',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Empty dependency array may cause stale closures',
          suggestedFix: 'Add dependencies or use useRef for stable values',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectInlineObjectDepsViolations(
  content: string,
  filePath: string
): MemoizationViolationInfo[] {
  const results: MemoizationViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of INLINE_OBJECT_DEPS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'inline-object-deps',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Inline object in dependency array defeats memoization',
          suggestedFix: 'Extract object to useMemo or use individual properties',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function analyzeMemoization(
  content: string,
  filePath: string
): MemoizationAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      useMemoCount: 0,
      useCallbackCount: 0,
      reactMemoCount: 0,
      confidence: 1.0,
    };
  }

  const patterns: MemoizationPatternInfo[] = [
    ...detectReactMemo(content, filePath),
    ...detectUseMemo(content, filePath),
    ...detectUseCallback(content, filePath),
    ...detectReselect(content, filePath),
    ...detectCustomMemoize(content, filePath),
    ...detectLodashMemoize(content, filePath),
    ...detectMemoOne(content, filePath),
  ];

  const violations: MemoizationViolationInfo[] = [
    ...detectEmptyDepsViolations(content, filePath),
    ...detectInlineObjectDepsViolations(content, filePath),
  ];

  const useMemoCount = patterns.filter((p) => p.type === 'use-memo').length;
  const useCallbackCount = patterns.filter((p) => p.type === 'use-callback').length;
  const reactMemoCount = patterns.filter((p) => p.type === 'react-memo').length;

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (violations.length === 0) {confidence += 0.1;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    useMemoCount,
    useCallbackCount,
    reactMemoCount,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class MemoizationDetector extends RegexDetector {
  readonly id = 'performance/memoization';
  readonly name = 'Memoization Detector';
  readonly description = 'Detects memoization patterns including React hooks and selectors';
  readonly category: PatternCategory = 'performance';
  readonly subcategory = 'memoization';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeMemoization(context.content, context.file);

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
        useMemoCount: analysis.useMemoCount,
        useCallbackCount: analysis.useCallbackCount,
        reactMemoCount: analysis.reactMemoCount,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createMemoizationDetector(): MemoizationDetector {
  return new MemoizationDetector();
}
