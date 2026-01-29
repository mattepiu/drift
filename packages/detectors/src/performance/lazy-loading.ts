/**
 * Lazy Loading Detector - Lazy loading pattern detection
 *
 * Detects lazy loading patterns including:
 * - Image lazy loading
 * - Component lazy loading
 * - Intersection Observer usage
 * - Virtual scrolling
 * - Infinite scroll patterns
 *
 * @requirements 19.2 - Lazy loading patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type LazyLoadingPatternType =
  | 'image-lazy'
  | 'native-lazy'
  | 'intersection-observer'
  | 'virtual-scroll'
  | 'infinite-scroll'
  | 'lazy-component'
  | 'placeholder-loading'
  | 'skeleton-loading';

export type LazyLoadingViolationType =
  | 'missing-lazy-image'
  | 'missing-placeholder'
  | 'eager-above-fold';

export interface LazyLoadingPatternInfo {
  type: LazyLoadingPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  context?: string | undefined;
}

export interface LazyLoadingViolationInfo {
  type: LazyLoadingViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface LazyLoadingAnalysis {
  patterns: LazyLoadingPatternInfo[];
  violations: LazyLoadingViolationInfo[];
  lazyImageCount: number;
  usesIntersectionObserver: boolean;
  usesVirtualScroll: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const IMAGE_LAZY_PATTERNS = [
  /loading\s*=\s*['"`]lazy['"`]/g,
  /data-src\s*=/g,
  /lazyload/gi,
  /lazy-load/gi,
] as const;

export const NATIVE_LAZY_PATTERNS = [
  /<img[^>]*loading\s*=\s*['"`]lazy['"`]/gi,
  /<iframe[^>]*loading\s*=\s*['"`]lazy['"`]/gi,
] as const;

export const INTERSECTION_OBSERVER_PATTERNS = [
  /new\s+IntersectionObserver/g,
  /IntersectionObserver\s*\(/g,
  /useIntersectionObserver/g,
  /useInView/g,
  /react-intersection-observer/g,
] as const;

export const VIRTUAL_SCROLL_PATTERNS = [
  /react-window/g,
  /react-virtualized/g,
  /react-virtual/g,
  /VirtualList/g,
  /FixedSizeList/g,
  /VariableSizeList/g,
  /useVirtualizer/g,
  /@tanstack\/react-virtual/g,
] as const;

export const INFINITE_SCROLL_PATTERNS = [
  /react-infinite-scroll/g,
  /InfiniteScroll/g,
  /useInfiniteQuery/g,
  /fetchNextPage/g,
  /hasNextPage/g,
  /isFetchingNextPage/g,
] as const;

export const LAZY_COMPONENT_PATTERNS = [
  /React\.lazy/g,
  /lazy\s*\(\s*\(\)\s*=>/g,
  /dynamic\s*\(\s*\(\)\s*=>/g,
  /Loadable\s*\(/g,
] as const;

export const PLACEHOLDER_LOADING_PATTERNS = [
  /placeholder\s*=/g,
  /blurDataURL/g,
  /placeholderSrc/g,
  /lowQualityPlaceholder/g,
] as const;

export const SKELETON_LOADING_PATTERNS = [
  /Skeleton/g,
  /skeleton/g,
  /ContentLoader/g,
  /react-content-loader/g,
  /shimmer/gi,
] as const;

export const MISSING_LAZY_IMAGE_PATTERNS = [
  /<img[^>]*src\s*=\s*['"`][^'"`]+['"`][^>]*(?!loading)/gi,
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
  type: LazyLoadingPatternType
): LazyLoadingPatternInfo[] {
  const results: LazyLoadingPatternInfo[] = [];
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

export function detectImageLazy(content: string, filePath: string): LazyLoadingPatternInfo[] {
  return detectPatterns(content, filePath, IMAGE_LAZY_PATTERNS, 'image-lazy');
}

export function detectNativeLazy(content: string, filePath: string): LazyLoadingPatternInfo[] {
  return detectPatterns(content, filePath, NATIVE_LAZY_PATTERNS, 'native-lazy');
}

export function detectIntersectionObserver(content: string, filePath: string): LazyLoadingPatternInfo[] {
  return detectPatterns(content, filePath, INTERSECTION_OBSERVER_PATTERNS, 'intersection-observer');
}

export function detectVirtualScroll(content: string, filePath: string): LazyLoadingPatternInfo[] {
  return detectPatterns(content, filePath, VIRTUAL_SCROLL_PATTERNS, 'virtual-scroll');
}

export function detectInfiniteScroll(content: string, filePath: string): LazyLoadingPatternInfo[] {
  return detectPatterns(content, filePath, INFINITE_SCROLL_PATTERNS, 'infinite-scroll');
}

export function detectLazyComponent(content: string, filePath: string): LazyLoadingPatternInfo[] {
  return detectPatterns(content, filePath, LAZY_COMPONENT_PATTERNS, 'lazy-component');
}

export function detectPlaceholderLoading(content: string, filePath: string): LazyLoadingPatternInfo[] {
  return detectPatterns(content, filePath, PLACEHOLDER_LOADING_PATTERNS, 'placeholder-loading');
}

export function detectSkeletonLoading(content: string, filePath: string): LazyLoadingPatternInfo[] {
  return detectPatterns(content, filePath, SKELETON_LOADING_PATTERNS, 'skeleton-loading');
}

export function detectMissingLazyImageViolations(
  content: string,
  filePath: string
): LazyLoadingViolationInfo[] {
  const results: LazyLoadingViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Check for img tags without loading attribute
    if (/<img[^>]*src\s*=/.test(line) && !/loading\s*=/.test(line)) {
      results.push({
        type: 'missing-lazy-image',
        file: filePath,
        line: i + 1,
        column: 1,
        matchedText: line.trim(),
        issue: 'Image without lazy loading attribute',
        suggestedFix: 'Add loading="lazy" to defer off-screen images',
        severity: 'low',
      });
    }
  }

  return results;
}

export function analyzeLazyLoading(
  content: string,
  filePath: string
): LazyLoadingAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      lazyImageCount: 0,
      usesIntersectionObserver: false,
      usesVirtualScroll: false,
      confidence: 1.0,
    };
  }

  const patterns: LazyLoadingPatternInfo[] = [
    ...detectImageLazy(content, filePath),
    ...detectNativeLazy(content, filePath),
    ...detectIntersectionObserver(content, filePath),
    ...detectVirtualScroll(content, filePath),
    ...detectInfiniteScroll(content, filePath),
    ...detectLazyComponent(content, filePath),
    ...detectPlaceholderLoading(content, filePath),
    ...detectSkeletonLoading(content, filePath),
  ];

  const violations: LazyLoadingViolationInfo[] = [
    ...detectMissingLazyImageViolations(content, filePath),
  ];

  const lazyImageCount = patterns.filter(
    (p) => p.type === 'image-lazy' || p.type === 'native-lazy'
  ).length;
  const usesIntersectionObserver = patterns.some((p) => p.type === 'intersection-observer');
  const usesVirtualScroll = patterns.some((p) => p.type === 'virtual-scroll');

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (usesIntersectionObserver) {confidence += 0.05;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    lazyImageCount,
    usesIntersectionObserver,
    usesVirtualScroll,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class LazyLoadingDetector extends RegexDetector {
  readonly id = 'performance/lazy-loading';
  readonly name = 'Lazy Loading Detector';
  readonly description = 'Detects lazy loading patterns for images and components';
  readonly category: PatternCategory = 'performance';
  readonly subcategory = 'lazy-loading';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeLazyLoading(context.content, context.file);

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
        lazyImageCount: analysis.lazyImageCount,
        usesIntersectionObserver: analysis.usesIntersectionObserver,
        usesVirtualScroll: analysis.usesVirtualScroll,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createLazyLoadingDetector(): LazyLoadingDetector {
  return new LazyLoadingDetector();
}
