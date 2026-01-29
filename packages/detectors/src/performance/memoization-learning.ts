/**
 * Memoization Detector - LEARNING VERSION
 *
 * Learns memoization patterns from the user's codebase:
 * - Memoization library preferences
 * - Hook usage patterns (useMemo, useCallback)
 * - Custom memoization patterns
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

export type MemoizationMethod = 'useMemo' | 'useCallback' | 'React.memo' | 'lodash.memoize' | 'custom';

export interface MemoizationConventions {
  [key: string]: unknown;
  preferredMethod: MemoizationMethod;
  usesReactMemo: boolean;
  usesUseMemo: boolean;
  usesUseCallback: boolean;
}

interface MemoizationInfo {
  method: MemoizationMethod;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractMemoizationPatterns(content: string, file: string): MemoizationInfo[] {
  const results: MemoizationInfo[] = [];

  const patterns: Array<{ regex: RegExp; method: MemoizationMethod }> = [
    { regex: /useMemo\s*\(/g, method: 'useMemo' },
    { regex: /useCallback\s*\(/g, method: 'useCallback' },
    { regex: /React\.memo\s*\(|memo\s*\(/g, method: 'React.memo' },
    { regex: /(?:_\.memoize|memoize)\s*\(/g, method: 'lodash.memoize' },
  ];

  for (const { regex, method } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        method,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Memoization Detector
// ============================================================================

export class MemoizationLearningDetector extends LearningDetector<MemoizationConventions> {
  readonly id = 'performance/memoization';
  readonly category = 'performance' as const;
  readonly subcategory = 'memoization';
  readonly name = 'Memoization Detector (Learning)';
  readonly description = 'Learns memoization patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof MemoizationConventions> {
    return ['preferredMethod', 'usesReactMemo', 'usesUseMemo', 'usesUseCallback'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof MemoizationConventions, ValueDistribution>
  ): void {
    const patterns = extractMemoizationPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const methodDist = distributions.get('preferredMethod')!;
    const reactMemoDist = distributions.get('usesReactMemo')!;
    const useMemoDist = distributions.get('usesUseMemo')!;
    const useCallbackDist = distributions.get('usesUseCallback')!;

    let hasReactMemo = false;
    let hasUseMemo = false;
    let hasUseCallback = false;

    for (const pattern of patterns) {
      methodDist.add(pattern.method, context.file);
      if (pattern.method === 'React.memo') {hasReactMemo = true;}
      if (pattern.method === 'useMemo') {hasUseMemo = true;}
      if (pattern.method === 'useCallback') {hasUseCallback = true;}
    }

    if (patterns.length > 0) {
      reactMemoDist.add(hasReactMemo, context.file);
      useMemoDist.add(hasUseMemo, context.file);
      useCallbackDist.add(hasUseCallback, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    _conventions: LearningResult<MemoizationConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const memoPatterns = extractMemoizationPatterns(context.content, context.file);
    if (memoPatterns.length === 0) {
      return this.createEmptyResult();
    }

    // Record patterns found
    if (memoPatterns.length > 0) {
      const first = memoPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/memoization`,
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

export function createMemoizationLearningDetector(): MemoizationLearningDetector {
  return new MemoizationLearningDetector();
}
