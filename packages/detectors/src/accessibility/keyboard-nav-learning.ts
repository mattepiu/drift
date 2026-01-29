/**
 * Keyboard Navigation Detector - LEARNING VERSION
 *
 * Learns keyboard navigation patterns from the user's codebase:
 * - Focus management patterns
 * - Keyboard event handling
 * - Tab index usage
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

export type KeyboardHandlingStyle = 'onKeyDown' | 'onKeyUp' | 'onKeyPress' | 'mixed';

export interface KeyboardNavConventions {
  [key: string]: unknown;
  handlingStyle: KeyboardHandlingStyle;
  usesTabIndex: boolean;
  usesFocusTrap: boolean;
}

interface KeyboardPatternInfo {
  type: 'handler' | 'tabindex' | 'focus-trap';
  style: KeyboardHandlingStyle | null;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractKeyboardPatterns(content: string, file: string): KeyboardPatternInfo[] {
  const results: KeyboardPatternInfo[] = [];

  // Keyboard event handlers
  const handlerPatterns: Array<{ regex: RegExp; style: KeyboardHandlingStyle }> = [
    { regex: /onKeyDown\s*=|addEventListener\s*\(\s*['"]keydown['"]/g, style: 'onKeyDown' },
    { regex: /onKeyUp\s*=|addEventListener\s*\(\s*['"]keyup['"]/g, style: 'onKeyUp' },
    { regex: /onKeyPress\s*=|addEventListener\s*\(\s*['"]keypress['"]/g, style: 'onKeyPress' },
  ];

  for (const { regex, style } of handlerPatterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'handler',
        style,
        line,
        column,
        file,
      });
    }
  }

  // tabIndex patterns
  const tabIndexPattern = /tabIndex\s*=\s*[{"]?(-?\d+)/g;
  let match;
  while ((match = tabIndexPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'tabindex',
      style: null,
      line,
      column,
      file,
    });
  }

  // Focus trap patterns
  const focusTrapPattern = /FocusTrap|useFocusTrap|focus-trap|trapFocus/g;
  while ((match = focusTrapPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'focus-trap',
      style: null,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Keyboard Navigation Detector
// ============================================================================

export class KeyboardNavLearningDetector extends LearningDetector<KeyboardNavConventions> {
  readonly id = 'accessibility/keyboard-nav';
  readonly category = 'accessibility' as const;
  readonly subcategory = 'keyboard-nav';
  readonly name = 'Keyboard Navigation Detector (Learning)';
  readonly description = 'Learns keyboard navigation patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof KeyboardNavConventions> {
    return ['handlingStyle', 'usesTabIndex', 'usesFocusTrap'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof KeyboardNavConventions, ValueDistribution>
  ): void {
    const patterns = extractKeyboardPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('handlingStyle')!;
    const tabIndexDist = distributions.get('usesTabIndex')!;
    const focusTrapDist = distributions.get('usesFocusTrap')!;

    let hasTabIndex = false;
    let hasFocusTrap = false;
    const styles = new Set<KeyboardHandlingStyle>();

    for (const pattern of patterns) {
      if (pattern.type === 'handler' && pattern.style) {
        styles.add(pattern.style);
        styleDist.add(pattern.style, context.file);
      }
      if (pattern.type === 'tabindex') {hasTabIndex = true;}
      if (pattern.type === 'focus-trap') {hasFocusTrap = true;}
    }

    if (styles.size > 1) {
      styleDist.add('mixed', context.file);
    }

    tabIndexDist.add(hasTabIndex, context.file);
    focusTrapDist.add(hasFocusTrap, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<KeyboardNavConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const keyboardPatterns = extractKeyboardPatterns(context.content, context.file);
    if (keyboardPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.handlingStyle?.value;

    // Check handler style consistency
    if (learnedStyle && learnedStyle !== 'mixed') {
      for (const pattern of keyboardPatterns) {
        if (pattern.type === 'handler' && pattern.style && pattern.style !== learnedStyle) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'keyboard handler', pattern.style, learnedStyle,
            `Using ${pattern.style} but project uses ${learnedStyle}`
          ));
        }
      }
    }

    if (keyboardPatterns.length > 0) {
      const first = keyboardPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/keyboard`,
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

export function createKeyboardNavLearningDetector(): KeyboardNavLearningDetector {
  return new KeyboardNavLearningDetector();
}
