/**
 * Lazy Loading Detector - LEARNING VERSION
 *
 * Learns lazy loading patterns from the user's codebase:
 * - Dynamic import patterns
 * - React.lazy usage
 * - Suspense boundaries
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type LazyLoadMethod = 'React.lazy' | 'dynamic-import' | 'next/dynamic' | 'loadable';

export interface LazyLoadingConventions {
  [key: string]: unknown;
  preferredMethod: LazyLoadMethod;
  usesSuspense: boolean;
  usesLoadingFallback: boolean;
}

interface LazyLoadInfo {
  method: LazyLoadMethod;
  hasSuspense: boolean;
  hasFallback: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractLazyLoadPatterns(content: string, file: string): LazyLoadInfo[] {
  const results: LazyLoadInfo[] = [];

  const patterns: Array<{ regex: RegExp; method: LazyLoadMethod }> = [
    { regex: /React\.lazy\s*\(|lazy\s*\(\s*\(\)\s*=>/g, method: 'React.lazy' },
    { regex: /import\s*\([^)]+\)/g, method: 'dynamic-import' },
    { regex: /dynamic\s*\(\s*\(\)\s*=>/g, method: 'next/dynamic' },
    { regex: /loadable\s*\(/g, method: 'loadable' },
  ];

  const hasSuspense = /<Suspense/.test(content);
  const hasFallback = /fallback\s*=/.test(content);

  for (const { regex, method } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        method,
        hasSuspense,
        hasFallback,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Lazy Loading Detector
// ============================================================================

export class LazyLoadingLearningDetector extends LearningDetector<LazyLoadingConventions> {
  readonly id = 'performance/lazy-loading';
  readonly category = 'performance' as const;
  readonly subcategory = 'lazy-loading';
  readonly name = 'Lazy Loading Detector (Learning)';
  readonly description = 'Learns lazy loading patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof LazyLoadingConventions> {
    return ['preferredMethod', 'usesSuspense', 'usesLoadingFallback'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof LazyLoadingConventions, ValueDistribution>
  ): void {
    const patterns = extractLazyLoadPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const methodDist = distributions.get('preferredMethod')!;
    const suspenseDist = distributions.get('usesSuspense')!;
    const fallbackDist = distributions.get('usesLoadingFallback')!;

    for (const pattern of patterns) {
      if (pattern.method !== 'dynamic-import') {
        methodDist.add(pattern.method, context.file);
      }
      suspenseDist.add(pattern.hasSuspense, context.file);
      fallbackDist.add(pattern.hasFallback, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<LazyLoadingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const lazyPatterns = extractLazyLoadPatterns(context.content, context.file);
    if (lazyPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedMethod = conventions.conventions.preferredMethod?.value;
    const learnedUsesSuspense = conventions.conventions.usesSuspense?.value;

    // Check method consistency
    if (learnedMethod) {
      for (const pattern of lazyPatterns) {
        if (pattern.method !== learnedMethod && pattern.method !== 'dynamic-import') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'lazy loading method', pattern.method, learnedMethod,
            `Using ${pattern.method} but project uses ${learnedMethod}`
          ));
        }
      }
    }

    // Check Suspense usage
    if (learnedUsesSuspense === true) {
      for (const pattern of lazyPatterns) {
        if (!pattern.hasSuspense && pattern.method === 'React.lazy') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'Suspense boundary', 'missing', 'with Suspense',
            `Lazy loaded component should be wrapped in Suspense (project convention)`
          ));
        }
      }
    }

    if (lazyPatterns.length > 0) {
      const first = lazyPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/lazy-load`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createLazyLoadingLearningDetector(): LazyLoadingLearningDetector {
  return new LazyLoadingLearningDetector();
}
