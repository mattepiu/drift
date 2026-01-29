/**
 * Debounce/Throttle Detector - LEARNING VERSION
 *
 * Learns debounce/throttle patterns from the user's codebase:
 * - Library preferences (lodash, custom hooks)
 * - Timing conventions
 * - Usage patterns
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

export type DebounceThrottleMethod = 'lodash' | 'useDebounce' | 'useThrottle' | 'custom';

export interface DebounceThrottleConventions {
  [key: string]: unknown;
  preferredMethod: DebounceThrottleMethod;
  defaultDebounceMs: number | null;
  defaultThrottleMs: number | null;
}

interface DebounceThrottleInfo {
  type: 'debounce' | 'throttle';
  method: DebounceThrottleMethod;
  delayMs: number | null;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractDebounceThrottlePatterns(content: string, file: string): DebounceThrottleInfo[] {
  const results: DebounceThrottleInfo[] = [];

  // Lodash debounce/throttle
  const lodashPattern = /(?:_\.|lodash\.)(debounce|throttle)\s*\([^,]+,\s*(\d+)/g;
  let match;
  while ((match = lodashPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: match[1] as 'debounce' | 'throttle',
      method: 'lodash',
      delayMs: parseInt(match[2] || '0', 10),
      line,
      column,
      file,
    });
  }

  // Hook patterns
  const hookPattern = /use(Debounce|Throttle)\s*\([^,]+,\s*(\d+)/g;
  while ((match = hookPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: (match[1] || '').toLowerCase() as 'debounce' | 'throttle',
      method: `use${match[1]}` as DebounceThrottleMethod,
      delayMs: parseInt(match[2] || '0', 10),
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Debounce/Throttle Detector
// ============================================================================

export class DebounceThrottleLearningDetector extends LearningDetector<DebounceThrottleConventions> {
  readonly id = 'performance/debounce-throttle';
  readonly category = 'performance' as const;
  readonly subcategory = 'debounce-throttle';
  readonly name = 'Debounce/Throttle Detector (Learning)';
  readonly description = 'Learns debounce/throttle patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof DebounceThrottleConventions> {
    return ['preferredMethod', 'defaultDebounceMs', 'defaultThrottleMs'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof DebounceThrottleConventions, ValueDistribution>
  ): void {
    const patterns = extractDebounceThrottlePatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const methodDist = distributions.get('preferredMethod')!;
    const debounceMsDist = distributions.get('defaultDebounceMs')!;
    const throttleMsDist = distributions.get('defaultThrottleMs')!;

    for (const pattern of patterns) {
      methodDist.add(pattern.method, context.file);
      if (pattern.delayMs !== null) {
        if (pattern.type === 'debounce') {
          debounceMsDist.add(pattern.delayMs, context.file);
        } else {
          throttleMsDist.add(pattern.delayMs, context.file);
        }
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<DebounceThrottleConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const dtPatterns = extractDebounceThrottlePatterns(context.content, context.file);
    if (dtPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedMethod = conventions.conventions.preferredMethod?.value;

    // Check method consistency
    if (learnedMethod) {
      for (const pattern of dtPatterns) {
        if (pattern.method !== learnedMethod) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'debounce/throttle method', pattern.method, learnedMethod,
            `Using ${pattern.method} but project uses ${learnedMethod}`
          ));
        }
      }
    }

    if (dtPatterns.length > 0) {
      const first = dtPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/debounce-throttle`,
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

export function createDebounceThrottleLearningDetector(): DebounceThrottleLearningDetector {
  return new DebounceThrottleLearningDetector();
}
