/**
 * Debounce Throttle Detector - Debounce and throttle pattern detection
 *
 * Detects debounce and throttle patterns including:
 * - Lodash debounce/throttle
 * - Custom implementations
 * - React hooks (useDebounce, useThrottle)
 * - Event handler optimization
 *
 * @requirements 19.5 - Debounce and throttle patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type DebounceThrottlePatternType =
  | 'lodash-debounce'
  | 'lodash-throttle'
  | 'custom-debounce'
  | 'custom-throttle'
  | 'use-debounce'
  | 'use-throttle'
  | 'request-animation-frame'
  | 'set-timeout-debounce';

export type DebounceThrottleViolationType =
  | 'missing-debounce'
  | 'missing-throttle'
  | 'excessive-delay';

export interface DebounceThrottlePatternInfo {
  type: DebounceThrottlePatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  delay?: number | undefined;
  context?: string | undefined;
}

export interface DebounceThrottleViolationInfo {
  type: DebounceThrottleViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface DebounceThrottleAnalysis {
  patterns: DebounceThrottlePatternInfo[];
  violations: DebounceThrottleViolationInfo[];
  debounceCount: number;
  throttleCount: number;
  usesRAF: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const LODASH_DEBOUNCE_PATTERNS = [
  /_.debounce\s*\(/g,
  /debounce\s*\(\s*\w+\s*,\s*\d+/g,
  /from\s+['"`]lodash\/debounce['"`]/g,
  /import\s+\{\s*debounce\s*\}\s+from\s+['"`]lodash['"`]/g,
] as const;

export const LODASH_THROTTLE_PATTERNS = [
  /_.throttle\s*\(/g,
  /throttle\s*\(\s*\w+\s*,\s*\d+/g,
  /from\s+['"`]lodash\/throttle['"`]/g,
  /import\s+\{\s*throttle\s*\}\s+from\s+['"`]lodash['"`]/g,
] as const;

export const CUSTOM_DEBOUNCE_PATTERNS = [
  /function\s+debounce\s*\(/g,
  /const\s+debounce\s*=\s*\(/g,
  /let\s+debounce\s*=\s*\(/g,
  /clearTimeout\s*\([^)]*\)\s*;\s*\w+\s*=\s*setTimeout/g,
] as const;

export const CUSTOM_THROTTLE_PATTERNS = [
  /function\s+throttle\s*\(/g,
  /const\s+throttle\s*=\s*\(/g,
  /let\s+throttle\s*=\s*\(/g,
  /Date\.now\s*\(\)\s*-\s*\w+\s*[<>]=?\s*\d+/g,
] as const;

export const USE_DEBOUNCE_PATTERNS = [
  /useDebounce\s*\(/g,
  /useDebouncedValue\s*\(/g,
  /useDebouncedCallback\s*\(/g,
  /use-debounce/g,
] as const;

export const USE_THROTTLE_PATTERNS = [
  /useThrottle\s*\(/g,
  /useThrottledValue\s*\(/g,
  /useThrottledCallback\s*\(/g,
] as const;

export const REQUEST_ANIMATION_FRAME_PATTERNS = [
  /requestAnimationFrame\s*\(/g,
  /cancelAnimationFrame\s*\(/g,
  /window\.requestAnimationFrame/g,
] as const;

export const SET_TIMEOUT_DEBOUNCE_PATTERNS = [
  /setTimeout\s*\([^)]+,\s*\d+\s*\)/g,
  /clearTimeout\s*\(/g,
] as const;

export const MISSING_DEBOUNCE_PATTERNS = [
  /onScroll\s*=\s*\{[^}]*\}/g,
  /onResize\s*=\s*\{[^}]*\}/g,
  /onInput\s*=\s*\{[^}]*\}/g,
  /onChange\s*=\s*\{[^}]*fetch/gi,
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
  type: DebounceThrottlePatternType
): DebounceThrottlePatternInfo[] {
  const results: DebounceThrottlePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const delayMatch = match[0].match(/,\s*(\d+)/);
        results.push({
          type,
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          delay: delayMatch ? parseInt(delayMatch[1]!, 10) : undefined,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectLodashDebounce(content: string, filePath: string): DebounceThrottlePatternInfo[] {
  return detectPatterns(content, filePath, LODASH_DEBOUNCE_PATTERNS, 'lodash-debounce');
}

export function detectLodashThrottle(content: string, filePath: string): DebounceThrottlePatternInfo[] {
  return detectPatterns(content, filePath, LODASH_THROTTLE_PATTERNS, 'lodash-throttle');
}

export function detectCustomDebounce(content: string, filePath: string): DebounceThrottlePatternInfo[] {
  return detectPatterns(content, filePath, CUSTOM_DEBOUNCE_PATTERNS, 'custom-debounce');
}

export function detectCustomThrottle(content: string, filePath: string): DebounceThrottlePatternInfo[] {
  return detectPatterns(content, filePath, CUSTOM_THROTTLE_PATTERNS, 'custom-throttle');
}

export function detectUseDebounce(content: string, filePath: string): DebounceThrottlePatternInfo[] {
  return detectPatterns(content, filePath, USE_DEBOUNCE_PATTERNS, 'use-debounce');
}

export function detectUseThrottle(content: string, filePath: string): DebounceThrottlePatternInfo[] {
  return detectPatterns(content, filePath, USE_THROTTLE_PATTERNS, 'use-throttle');
}

export function detectRequestAnimationFrame(content: string, filePath: string): DebounceThrottlePatternInfo[] {
  return detectPatterns(content, filePath, REQUEST_ANIMATION_FRAME_PATTERNS, 'request-animation-frame');
}

export function detectSetTimeoutDebounce(content: string, filePath: string): DebounceThrottlePatternInfo[] {
  return detectPatterns(content, filePath, SET_TIMEOUT_DEBOUNCE_PATTERNS, 'set-timeout-debounce');
}

export function detectMissingDebounceViolations(
  content: string,
  filePath: string
): DebounceThrottleViolationInfo[] {
  const results: DebounceThrottleViolationInfo[] = [];
  const lines = content.split('\n');

  // Check if file already uses debounce/throttle
  const hasDebounce = /debounce|throttle/i.test(content);
  if (hasDebounce) {return results;}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of MISSING_DEBOUNCE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'missing-debounce',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'High-frequency event handler without debounce/throttle',
          suggestedFix: 'Add debounce or throttle to prevent performance issues',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeDebounceThrottle(
  content: string,
  filePath: string
): DebounceThrottleAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      debounceCount: 0,
      throttleCount: 0,
      usesRAF: false,
      confidence: 1.0,
    };
  }

  const patterns: DebounceThrottlePatternInfo[] = [
    ...detectLodashDebounce(content, filePath),
    ...detectLodashThrottle(content, filePath),
    ...detectCustomDebounce(content, filePath),
    ...detectCustomThrottle(content, filePath),
    ...detectUseDebounce(content, filePath),
    ...detectUseThrottle(content, filePath),
    ...detectRequestAnimationFrame(content, filePath),
    ...detectSetTimeoutDebounce(content, filePath),
  ];

  const violations: DebounceThrottleViolationInfo[] = [
    ...detectMissingDebounceViolations(content, filePath),
  ];

  const debounceCount = patterns.filter(
    (p) => p.type.includes('debounce')
  ).length;
  const throttleCount = patterns.filter(
    (p) => p.type.includes('throttle')
  ).length;
  const usesRAF = patterns.some((p) => p.type === 'request-animation-frame');

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (violations.length === 0) {confidence += 0.1;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    debounceCount,
    throttleCount,
    usesRAF,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class DebounceThrottleDetector extends RegexDetector {
  readonly id = 'performance/debounce-throttle';
  readonly name = 'Debounce Throttle Detector';
  readonly description = 'Detects debounce and throttle patterns for event optimization';
  readonly category: PatternCategory = 'performance';
  readonly subcategory = 'debounce-throttle';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeDebounceThrottle(context.content, context.file);

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
        debounceCount: analysis.debounceCount,
        throttleCount: analysis.throttleCount,
        usesRAF: analysis.usesRAF,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createDebounceThrottleDetector(): DebounceThrottleDetector {
  return new DebounceThrottleDetector();
}
