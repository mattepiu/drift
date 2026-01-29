/**
 * Heading Hierarchy Detector - Heading hierarchy pattern detection
 * @requirements 20.5 - Heading hierarchy patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

export type HeadingHierarchyPatternType = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'heading-component';
export type HeadingHierarchyViolationType = 'skipped-heading' | 'multiple-h1' | 'empty-heading';

export interface HeadingHierarchyPatternInfo { type: HeadingHierarchyPatternType; file: string; line: number; column: number; matchedText: string; level?: number | undefined; context?: string | undefined; }
export interface HeadingHierarchyViolationInfo { type: HeadingHierarchyViolationType; file: string; line: number; column: number; matchedText: string; issue: string; suggestedFix?: string | undefined; severity: 'high' | 'medium' | 'low'; }
export interface HeadingHierarchyAnalysis { patterns: HeadingHierarchyPatternInfo[]; violations: HeadingHierarchyViolationInfo[]; headingCount: number; hasH1: boolean; confidence: number; }

export const H1_PATTERNS = [/<h1[\s>]/gi, /<H1[\s>]/g] as const;
export const H2_PATTERNS = [/<h2[\s>]/gi, /<H2[\s>]/g] as const;
export const H3_PATTERNS = [/<h3[\s>]/gi, /<H3[\s>]/g] as const;
export const H4_PATTERNS = [/<h4[\s>]/gi, /<H4[\s>]/g] as const;
export const H5_PATTERNS = [/<h5[\s>]/gi, /<H5[\s>]/g] as const;
export const H6_PATTERNS = [/<h6[\s>]/gi, /<H6[\s>]/g] as const;
export const HEADING_COMPONENT_PATTERNS = [/<Heading[\s>]/g, /<Typography[^>]*variant\s*=\s*['"`]h\d['"`]/gi] as const;
export const EMPTY_HEADING_PATTERNS = [/<h[1-6][^>]*>\s*<\/h[1-6]>/gi] as const;

export function shouldExcludeFile(filePath: string): boolean {
  return [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//, /node_modules\//, /\.min\.[jt]s$/].some((p) => p.test(filePath));
}

function detectPatterns(content: string, filePath: string, patterns: readonly RegExp[], type: HeadingHierarchyPatternType, level?: number): HeadingHierarchyPatternInfo[] {
  const results: HeadingHierarchyPatternInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type, file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], level, context: line.trim() });
      }
    }
  }
  return results;
}

export function detectH1(content: string, filePath: string): HeadingHierarchyPatternInfo[] { return detectPatterns(content, filePath, H1_PATTERNS, 'h1', 1); }
export function detectH2(content: string, filePath: string): HeadingHierarchyPatternInfo[] { return detectPatterns(content, filePath, H2_PATTERNS, 'h2', 2); }
export function detectH3(content: string, filePath: string): HeadingHierarchyPatternInfo[] { return detectPatterns(content, filePath, H3_PATTERNS, 'h3', 3); }
export function detectH4(content: string, filePath: string): HeadingHierarchyPatternInfo[] { return detectPatterns(content, filePath, H4_PATTERNS, 'h4', 4); }
export function detectH5(content: string, filePath: string): HeadingHierarchyPatternInfo[] { return detectPatterns(content, filePath, H5_PATTERNS, 'h5', 5); }
export function detectH6(content: string, filePath: string): HeadingHierarchyPatternInfo[] { return detectPatterns(content, filePath, H6_PATTERNS, 'h6', 6); }
export function detectHeadingComponent(content: string, filePath: string): HeadingHierarchyPatternInfo[] { return detectPatterns(content, filePath, HEADING_COMPONENT_PATTERNS, 'heading-component'); }

export function detectMultipleH1Violations(content: string, filePath: string): HeadingHierarchyViolationInfo[] {
  const h1Count = (content.match(/<h1[\s>]/gi) || []).length;
  if (h1Count > 1) {
    return [{ type: 'multiple-h1', file: filePath, line: 1, column: 1, matchedText: `${h1Count} h1 elements`, issue: 'Multiple h1 elements found', suggestedFix: 'Use only one h1 per page', severity: 'medium' }];
  }
  return [];
}

export function detectEmptyHeadingViolations(content: string, filePath: string): HeadingHierarchyViolationInfo[] {
  const results: HeadingHierarchyViolationInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of EMPTY_HEADING_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type: 'empty-heading', file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], issue: 'Empty heading element', suggestedFix: 'Add content to heading or remove it', severity: 'high' });
      }
    }
  }
  return results;
}

export function analyzeHeadingHierarchy(content: string, filePath: string): HeadingHierarchyAnalysis {
  if (shouldExcludeFile(filePath)) {return { patterns: [], violations: [], headingCount: 0, hasH1: false, confidence: 1.0 };}
  const patterns: HeadingHierarchyPatternInfo[] = [...detectH1(content, filePath), ...detectH2(content, filePath), ...detectH3(content, filePath), ...detectH4(content, filePath), ...detectH5(content, filePath), ...detectH6(content, filePath), ...detectHeadingComponent(content, filePath)];
  const violations: HeadingHierarchyViolationInfo[] = [...detectMultipleH1Violations(content, filePath), ...detectEmptyHeadingViolations(content, filePath)];
  const headingCount = patterns.length;
  const hasH1 = patterns.some((p) => p.type === 'h1');
  let confidence = 0.7; if (patterns.length > 0) {confidence += 0.15;} if (violations.length === 0) {confidence += 0.1;} confidence = Math.min(confidence, 0.95);
  return { patterns, violations, headingCount, hasH1, confidence };
}

export class HeadingHierarchyDetector extends RegexDetector {
  readonly id = 'accessibility/heading-hierarchy';
  readonly name = 'Heading Hierarchy Detector';
  readonly description = 'Detects heading hierarchy patterns';
  readonly category: PatternCategory = 'accessibility';
  readonly subcategory = 'heading-hierarchy';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {return this.createEmptyResult();}
    const analysis = analyzeHeadingHierarchy(context.content, context.file);
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
    
    return this.createResult([], violations, analysis.confidence, { custom: { patterns: analysis.patterns, headingCount: analysis.headingCount, hasH1: analysis.hasH1 } });
  }

  generateQuickFix(_violation: Violation): QuickFix | null { return null; }
}

export function createHeadingHierarchyDetector(): HeadingHierarchyDetector { return new HeadingHierarchyDetector(); }
