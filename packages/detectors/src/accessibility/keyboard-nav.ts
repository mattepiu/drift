/**
 * Keyboard Navigation Detector - Keyboard navigation pattern detection
 * @requirements 20.3 - Keyboard navigation patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

export type KeyboardNavPatternType = 'tabindex' | 'onkeydown' | 'onkeyup' | 'onkeypress' | 'focus-trap' | 'skip-link';
export type KeyboardNavViolationType = 'positive-tabindex' | 'missing-keyboard-handler' | 'mouse-only-handler';

export interface KeyboardNavPatternInfo { type: KeyboardNavPatternType; file: string; line: number; column: number; matchedText: string; context?: string | undefined; }
export interface KeyboardNavViolationInfo { type: KeyboardNavViolationType; file: string; line: number; column: number; matchedText: string; issue: string; suggestedFix?: string | undefined; severity: 'high' | 'medium' | 'low'; }
export interface KeyboardNavAnalysis { patterns: KeyboardNavPatternInfo[]; violations: KeyboardNavViolationInfo[]; tabindexCount: number; keyboardHandlerCount: number; confidence: number; }

export const TABINDEX_PATTERNS = [/tabIndex\s*=\s*['"`]?-?\d+['"`]?/gi, /tabindex\s*=\s*['"`]?-?\d+['"`]?/gi] as const;
export const ONKEYDOWN_PATTERNS = [/onKeyDown\s*=\s*\{/gi, /onkeydown\s*=/gi] as const;
export const ONKEYUP_PATTERNS = [/onKeyUp\s*=\s*\{/gi, /onkeyup\s*=/gi] as const;
export const ONKEYPRESS_PATTERNS = [/onKeyPress\s*=\s*\{/gi, /onkeypress\s*=/gi] as const;
export const FOCUS_TRAP_PATTERNS = [/focus-trap/gi, /FocusTrap/g, /useFocusTrap/g] as const;
export const SKIP_LINK_PATTERNS = [/skip-link/gi, /skipLink/g, /#main-content/g, /#content/g] as const;
export const POSITIVE_TABINDEX_PATTERNS = [/tabIndex\s*=\s*['"`]?[1-9]\d*['"`]?/gi, /tabindex\s*=\s*['"`]?[1-9]\d*['"`]?/gi] as const;
export const MOUSE_ONLY_HANDLER_PATTERNS = [/onClick\s*=\s*\{[^}]+\}(?![^<]*onKey)/gi] as const;

export function shouldExcludeFile(filePath: string): boolean {
  return [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//, /node_modules\//, /\.min\.[jt]s$/].some((p) => p.test(filePath));
}

function detectPatterns(content: string, filePath: string, patterns: readonly RegExp[], type: KeyboardNavPatternType): KeyboardNavPatternInfo[] {
  const results: KeyboardNavPatternInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type, file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], context: line.trim() });
      }
    }
  }
  return results;
}

export function detectTabindex(content: string, filePath: string): KeyboardNavPatternInfo[] { return detectPatterns(content, filePath, TABINDEX_PATTERNS, 'tabindex'); }
export function detectOnKeyDown(content: string, filePath: string): KeyboardNavPatternInfo[] { return detectPatterns(content, filePath, ONKEYDOWN_PATTERNS, 'onkeydown'); }
export function detectOnKeyUp(content: string, filePath: string): KeyboardNavPatternInfo[] { return detectPatterns(content, filePath, ONKEYUP_PATTERNS, 'onkeyup'); }
export function detectOnKeyPress(content: string, filePath: string): KeyboardNavPatternInfo[] { return detectPatterns(content, filePath, ONKEYPRESS_PATTERNS, 'onkeypress'); }
export function detectFocusTrap(content: string, filePath: string): KeyboardNavPatternInfo[] { return detectPatterns(content, filePath, FOCUS_TRAP_PATTERNS, 'focus-trap'); }
export function detectSkipLink(content: string, filePath: string): KeyboardNavPatternInfo[] { return detectPatterns(content, filePath, SKIP_LINK_PATTERNS, 'skip-link'); }

export function detectPositiveTabindexViolations(content: string, filePath: string): KeyboardNavViolationInfo[] {
  const results: KeyboardNavViolationInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of POSITIVE_TABINDEX_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type: 'positive-tabindex', file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], issue: 'Positive tabindex disrupts natural tab order', suggestedFix: 'Use tabIndex={0} or tabIndex={-1} instead', severity: 'high' });
      }
    }
  }
  return results;
}

export function analyzeKeyboardNav(content: string, filePath: string): KeyboardNavAnalysis {
  if (shouldExcludeFile(filePath)) {return { patterns: [], violations: [], tabindexCount: 0, keyboardHandlerCount: 0, confidence: 1.0 };}
  const patterns: KeyboardNavPatternInfo[] = [...detectTabindex(content, filePath), ...detectOnKeyDown(content, filePath), ...detectOnKeyUp(content, filePath), ...detectOnKeyPress(content, filePath), ...detectFocusTrap(content, filePath), ...detectSkipLink(content, filePath)];
  const violations: KeyboardNavViolationInfo[] = [...detectPositiveTabindexViolations(content, filePath)];
  const tabindexCount = patterns.filter((p) => p.type === 'tabindex').length;
  const keyboardHandlerCount = patterns.filter((p) => p.type.startsWith('onkey')).length;
  let confidence = 0.7; if (patterns.length > 0) {confidence += 0.15;} if (violations.length === 0) {confidence += 0.1;} confidence = Math.min(confidence, 0.95);
  return { patterns, violations, tabindexCount, keyboardHandlerCount, confidence };
}

export class KeyboardNavDetector extends RegexDetector {
  readonly id = 'accessibility/keyboard-nav';
  readonly name = 'Keyboard Navigation Detector';
  readonly description = 'Detects keyboard navigation patterns';
  readonly category: PatternCategory = 'accessibility';
  readonly subcategory = 'keyboard-nav';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {return this.createEmptyResult();}
    const analysis = analyzeKeyboardNav(context.content, context.file);
    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {return this.createEmptyResult();}
    
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
    
    return this.createResult([], violations, analysis.confidence, { custom: { patterns: analysis.patterns, tabindexCount: analysis.tabindexCount, keyboardHandlerCount: analysis.keyboardHandlerCount } });
  }

  generateQuickFix(_violation: Violation): QuickFix | null { return null; }
}

export function createKeyboardNavDetector(): KeyboardNavDetector { return new KeyboardNavDetector(); }
