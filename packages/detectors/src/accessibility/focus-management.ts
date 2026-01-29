/**
 * Focus Management Detector - Focus management pattern detection
 * @requirements 20.4 - Focus management patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

export type FocusManagementPatternType = 'focus-visible' | 'focus-within' | 'use-focus' | 'auto-focus' | 'focus-ref' | 'focus-ring';
export type FocusManagementViolationType = 'outline-none' | 'missing-focus-indicator';

export interface FocusManagementPatternInfo { type: FocusManagementPatternType; file: string; line: number; column: number; matchedText: string; context?: string | undefined; }
export interface FocusManagementViolationInfo { type: FocusManagementViolationType; file: string; line: number; column: number; matchedText: string; issue: string; suggestedFix?: string | undefined; severity: 'high' | 'medium' | 'low'; }
export interface FocusManagementAnalysis { patterns: FocusManagementPatternInfo[]; violations: FocusManagementViolationInfo[]; focusPatternCount: number; hasFocusVisible: boolean; confidence: number; }

export const FOCUS_VISIBLE_PATTERNS = [/:focus-visible/g, /focus-visible:/g, /focusVisible/g] as const;
export const FOCUS_WITHIN_PATTERNS = [/:focus-within/g, /focus-within:/g] as const;
export const USE_FOCUS_PATTERNS = [/useFocus\s*\(/g, /useFocusRing/g, /useFocusWithin/g] as const;
export const AUTO_FOCUS_PATTERNS = [/autoFocus/g, /autofocus/g] as const;
export const FOCUS_REF_PATTERNS = [/\.focus\s*\(\)/g, /ref\.current\.focus/g, /focusRef/g] as const;
export const FOCUS_RING_PATTERNS = [/ring-/g, /focus:ring/g, /focus-ring/g] as const;
export const OUTLINE_NONE_PATTERNS = [/outline:\s*none/gi, /outline:\s*0/gi, /outline-none/g] as const;

export function shouldExcludeFile(filePath: string): boolean {
  return [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//, /node_modules\//, /\.min\.[jt]s$/].some((p) => p.test(filePath));
}

function detectPatterns(content: string, filePath: string, patterns: readonly RegExp[], type: FocusManagementPatternType): FocusManagementPatternInfo[] {
  const results: FocusManagementPatternInfo[] = [];
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

export function detectFocusVisible(content: string, filePath: string): FocusManagementPatternInfo[] { return detectPatterns(content, filePath, FOCUS_VISIBLE_PATTERNS, 'focus-visible'); }
export function detectFocusWithin(content: string, filePath: string): FocusManagementPatternInfo[] { return detectPatterns(content, filePath, FOCUS_WITHIN_PATTERNS, 'focus-within'); }
export function detectUseFocus(content: string, filePath: string): FocusManagementPatternInfo[] { return detectPatterns(content, filePath, USE_FOCUS_PATTERNS, 'use-focus'); }
export function detectAutoFocus(content: string, filePath: string): FocusManagementPatternInfo[] { return detectPatterns(content, filePath, AUTO_FOCUS_PATTERNS, 'auto-focus'); }
export function detectFocusRef(content: string, filePath: string): FocusManagementPatternInfo[] { return detectPatterns(content, filePath, FOCUS_REF_PATTERNS, 'focus-ref'); }
export function detectFocusRing(content: string, filePath: string): FocusManagementPatternInfo[] { return detectPatterns(content, filePath, FOCUS_RING_PATTERNS, 'focus-ring'); }

export function detectOutlineNoneViolations(content: string, filePath: string): FocusManagementViolationInfo[] {
  const results: FocusManagementViolationInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip if line has focus-visible replacement
    if (/focus-visible|focus:ring/.test(line)) {continue;}
    for (const pattern of OUTLINE_NONE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type: 'outline-none', file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], issue: 'Removing outline without alternative focus indicator', suggestedFix: 'Use focus-visible or custom focus ring instead', severity: 'high' });
      }
    }
  }
  return results;
}

export function analyzeFocusManagement(content: string, filePath: string): FocusManagementAnalysis {
  if (shouldExcludeFile(filePath)) {return { patterns: [], violations: [], focusPatternCount: 0, hasFocusVisible: false, confidence: 1.0 };}
  const patterns: FocusManagementPatternInfo[] = [...detectFocusVisible(content, filePath), ...detectFocusWithin(content, filePath), ...detectUseFocus(content, filePath), ...detectAutoFocus(content, filePath), ...detectFocusRef(content, filePath), ...detectFocusRing(content, filePath)];
  const violations: FocusManagementViolationInfo[] = [...detectOutlineNoneViolations(content, filePath)];
  const focusPatternCount = patterns.length;
  const hasFocusVisible = patterns.some((p) => p.type === 'focus-visible');
  let confidence = 0.7; if (patterns.length > 0) {confidence += 0.15;} if (violations.length === 0) {confidence += 0.1;} confidence = Math.min(confidence, 0.95);
  return { patterns, violations, focusPatternCount, hasFocusVisible, confidence };
}

export class FocusManagementDetector extends RegexDetector {
  readonly id = 'accessibility/focus-management';
  readonly name = 'Focus Management Detector';
  readonly description = 'Detects focus management patterns';
  readonly category: PatternCategory = 'accessibility';
  readonly subcategory = 'focus-management';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {return this.createEmptyResult();}
    const analysis = analyzeFocusManagement(context.content, context.file);
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
    
    return this.createResult([], violations, analysis.confidence, { custom: { patterns: analysis.patterns, focusPatternCount: analysis.focusPatternCount, hasFocusVisible: analysis.hasFocusVisible } });
  }

  generateQuickFix(_violation: Violation): QuickFix | null { return null; }
}

export function createFocusManagementDetector(): FocusManagementDetector { return new FocusManagementDetector(); }
