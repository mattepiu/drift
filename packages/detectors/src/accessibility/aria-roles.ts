/**
 * ARIA Roles Detector - ARIA role pattern detection
 * @requirements 20.2 - ARIA role patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

export type AriaRolesPatternType = 'aria-role' | 'aria-label' | 'aria-describedby' | 'aria-hidden' | 'aria-live' | 'aria-expanded' | 'aria-controls';
export type AriaRolesViolationType = 'redundant-role' | 'missing-aria-label' | 'invalid-role';

export interface AriaRolesPatternInfo { type: AriaRolesPatternType; file: string; line: number; column: number; matchedText: string; role?: string | undefined; context?: string | undefined; }
export interface AriaRolesViolationInfo { type: AriaRolesViolationType; file: string; line: number; column: number; matchedText: string; issue: string; suggestedFix?: string | undefined; severity: 'high' | 'medium' | 'low'; }
export interface AriaRolesAnalysis { patterns: AriaRolesPatternInfo[]; violations: AriaRolesViolationInfo[]; ariaRoleCount: number; ariaLabelCount: number; confidence: number; }

export const ARIA_ROLE_PATTERNS = [/role\s*=\s*['"`](\w+)['"`]/gi] as const;
export const ARIA_LABEL_PATTERNS = [/aria-label\s*=\s*['"`][^'"`]+['"`]/gi, /aria-labelledby\s*=\s*['"`][^'"`]+['"`]/gi] as const;
export const ARIA_DESCRIBEDBY_PATTERNS = [/aria-describedby\s*=\s*['"`][^'"`]+['"`]/gi] as const;
export const ARIA_HIDDEN_PATTERNS = [/aria-hidden\s*=\s*['"`](?:true|false)['"`]/gi] as const;
export const ARIA_LIVE_PATTERNS = [/aria-live\s*=\s*['"`](?:polite|assertive|off)['"`]/gi] as const;
export const ARIA_EXPANDED_PATTERNS = [/aria-expanded\s*=\s*['"`]?(?:true|false|\{[^}]+\})['"`]?/gi] as const;
export const ARIA_CONTROLS_PATTERNS = [/aria-controls\s*=\s*['"`][^'"`]+['"`]/gi] as const;
export const REDUNDANT_ROLE_PATTERNS = [/<button[^>]*role\s*=\s*['"`]button['"`]/gi, /<a[^>]*role\s*=\s*['"`]link['"`]/gi, /<nav[^>]*role\s*=\s*['"`]navigation['"`]/gi] as const;

export function shouldExcludeFile(filePath: string): boolean {
  return [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//, /node_modules\//, /\.min\.[jt]s$/].some((p) => p.test(filePath));
}

function detectPatterns(content: string, filePath: string, patterns: readonly RegExp[], type: AriaRolesPatternType): AriaRolesPatternInfo[] {
  const results: AriaRolesPatternInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type, file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], role: match[1], context: line.trim() });
      }
    }
  }
  return results;
}

export function detectAriaRole(content: string, filePath: string): AriaRolesPatternInfo[] { return detectPatterns(content, filePath, ARIA_ROLE_PATTERNS, 'aria-role'); }
export function detectAriaLabel(content: string, filePath: string): AriaRolesPatternInfo[] { return detectPatterns(content, filePath, ARIA_LABEL_PATTERNS, 'aria-label'); }
export function detectAriaDescribedby(content: string, filePath: string): AriaRolesPatternInfo[] { return detectPatterns(content, filePath, ARIA_DESCRIBEDBY_PATTERNS, 'aria-describedby'); }
export function detectAriaHidden(content: string, filePath: string): AriaRolesPatternInfo[] { return detectPatterns(content, filePath, ARIA_HIDDEN_PATTERNS, 'aria-hidden'); }
export function detectAriaLive(content: string, filePath: string): AriaRolesPatternInfo[] { return detectPatterns(content, filePath, ARIA_LIVE_PATTERNS, 'aria-live'); }
export function detectAriaExpanded(content: string, filePath: string): AriaRolesPatternInfo[] { return detectPatterns(content, filePath, ARIA_EXPANDED_PATTERNS, 'aria-expanded'); }
export function detectAriaControls(content: string, filePath: string): AriaRolesPatternInfo[] { return detectPatterns(content, filePath, ARIA_CONTROLS_PATTERNS, 'aria-controls'); }

export function detectRedundantRoleViolations(content: string, filePath: string): AriaRolesViolationInfo[] {
  const results: AriaRolesViolationInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REDUNDANT_ROLE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type: 'redundant-role', file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], issue: 'Redundant ARIA role on semantic element', suggestedFix: 'Remove redundant role attribute', severity: 'low' });
      }
    }
  }
  return results;
}

export function analyzeAriaRoles(content: string, filePath: string): AriaRolesAnalysis {
  if (shouldExcludeFile(filePath)) {return { patterns: [], violations: [], ariaRoleCount: 0, ariaLabelCount: 0, confidence: 1.0 };}
  const patterns: AriaRolesPatternInfo[] = [...detectAriaRole(content, filePath), ...detectAriaLabel(content, filePath), ...detectAriaDescribedby(content, filePath), ...detectAriaHidden(content, filePath), ...detectAriaLive(content, filePath), ...detectAriaExpanded(content, filePath), ...detectAriaControls(content, filePath)];
  const violations: AriaRolesViolationInfo[] = [...detectRedundantRoleViolations(content, filePath)];
  const ariaRoleCount = patterns.filter((p) => p.type === 'aria-role').length;
  const ariaLabelCount = patterns.filter((p) => p.type === 'aria-label').length;
  let confidence = 0.7; if (patterns.length > 0) {confidence += 0.15;} if (violations.length === 0) {confidence += 0.1;} confidence = Math.min(confidence, 0.95);
  return { patterns, violations, ariaRoleCount, ariaLabelCount, confidence };
}

export class AriaRolesDetector extends RegexDetector {
  readonly id = 'accessibility/aria-roles';
  readonly name = 'ARIA Roles Detector';
  readonly description = 'Detects ARIA role and attribute patterns';
  readonly category: PatternCategory = 'accessibility';
  readonly subcategory = 'aria-roles';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {return this.createEmptyResult();}
    const analysis = analyzeAriaRoles(context.content, context.file);
    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {return this.createEmptyResult();}
    
    // Convert internal violations to standard Violation format
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      file: v.file,
      line: v.line,
      column: v.column,
      type: v.type,
      value: v.matchedText,
      issue: v.issue,
      suggestedFix: v.suggestedFix,
      severity: v.severity === 'high' ? 'error' : v.severity === 'medium' ? 'warning' : 'info',
    }));
    
    return this.createResult([], violations, analysis.confidence, { custom: { patterns: analysis.patterns, ariaRoleCount: analysis.ariaRoleCount, ariaLabelCount: analysis.ariaLabelCount } });
  }

  generateQuickFix(_violation: Violation): QuickFix | null { return null; }
}

export function createAriaRolesDetector(): AriaRolesDetector { return new AriaRolesDetector(); }
