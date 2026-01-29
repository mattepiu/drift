/**
 * Alt Text Detector - Alt text pattern detection
 * @requirements 20.6 - Alt text patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

export type AltTextPatternType = 'img-alt' | 'decorative-alt' | 'svg-title' | 'icon-label' | 'figure-caption';
export type AltTextViolationType = 'missing-alt' | 'empty-alt-non-decorative' | 'redundant-alt';

export interface AltTextPatternInfo { type: AltTextPatternType; file: string; line: number; column: number; matchedText: string; altText?: string | undefined; context?: string | undefined; }
export interface AltTextViolationInfo { type: AltTextViolationType; file: string; line: number; column: number; matchedText: string; issue: string; suggestedFix?: string | undefined; severity: 'high' | 'medium' | 'low'; }
export interface AltTextAnalysis { patterns: AltTextPatternInfo[]; violations: AltTextViolationInfo[]; imgWithAltCount: number; decorativeCount: number; confidence: number; }

export const IMG_ALT_PATTERNS = [/<img[^>]*alt\s*=\s*['"`][^'"`]+['"`]/gi, /alt\s*=\s*\{[^}]+\}/g] as const;
export const DECORATIVE_ALT_PATTERNS = [/<img[^>]*alt\s*=\s*['"`]['"`]/gi, /alt\s*=\s*['"`]['"`]/g, /role\s*=\s*['"`]presentation['"`]/gi] as const;
export const SVG_TITLE_PATTERNS = [/<title>[^<]+<\/title>/gi, /<svg[^>]*aria-label/gi] as const;
export const ICON_LABEL_PATTERNS = [/aria-label\s*=\s*['"`][^'"`]+['"`]/gi, /sr-only/g, /visually-hidden/g] as const;
export const FIGURE_CAPTION_PATTERNS = [/<figcaption>/gi, /<figcaption[^>]*>/gi] as const;
export const MISSING_ALT_PATTERNS = [/<img(?![^>]*alt\s*=)[^>]*>/gi] as const;
export const REDUNDANT_ALT_PATTERNS = [/alt\s*=\s*['"`](?:image|picture|photo|icon|logo)\s*(?:of)?\s*['"`]/gi] as const;

export function shouldExcludeFile(filePath: string): boolean {
  return [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//, /node_modules\//, /\.min\.[jt]s$/].some((p) => p.test(filePath));
}

function detectPatterns(content: string, filePath: string, patterns: readonly RegExp[], type: AltTextPatternType): AltTextPatternInfo[] {
  const results: AltTextPatternInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const altMatch = match[0].match(/alt\s*=\s*['"`]([^'"`]*)['"`]/i);
        results.push({ type, file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], altText: altMatch ? altMatch[1] : undefined, context: line.trim() });
      }
    }
  }
  return results;
}

export function detectImgAlt(content: string, filePath: string): AltTextPatternInfo[] { return detectPatterns(content, filePath, IMG_ALT_PATTERNS, 'img-alt'); }
export function detectDecorativeAlt(content: string, filePath: string): AltTextPatternInfo[] { return detectPatterns(content, filePath, DECORATIVE_ALT_PATTERNS, 'decorative-alt'); }
export function detectSvgTitle(content: string, filePath: string): AltTextPatternInfo[] { return detectPatterns(content, filePath, SVG_TITLE_PATTERNS, 'svg-title'); }
export function detectIconLabel(content: string, filePath: string): AltTextPatternInfo[] { return detectPatterns(content, filePath, ICON_LABEL_PATTERNS, 'icon-label'); }
export function detectFigureCaption(content: string, filePath: string): AltTextPatternInfo[] { return detectPatterns(content, filePath, FIGURE_CAPTION_PATTERNS, 'figure-caption'); }

export function detectMissingAltViolations(content: string, filePath: string): AltTextViolationInfo[] {
  const results: AltTextViolationInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of MISSING_ALT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type: 'missing-alt', file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], issue: 'Image missing alt attribute', suggestedFix: 'Add alt="" for decorative or descriptive alt for meaningful images', severity: 'high' });
      }
    }
  }
  return results;
}

export function detectRedundantAltViolations(content: string, filePath: string): AltTextViolationInfo[] {
  const results: AltTextViolationInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REDUNDANT_ALT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type: 'redundant-alt', file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], issue: 'Redundant alt text (image/photo/icon)', suggestedFix: 'Describe the image content, not that it is an image', severity: 'low' });
      }
    }
  }
  return results;
}

export function analyzeAltText(content: string, filePath: string): AltTextAnalysis {
  if (shouldExcludeFile(filePath)) {return { patterns: [], violations: [], imgWithAltCount: 0, decorativeCount: 0, confidence: 1.0 };}
  const patterns: AltTextPatternInfo[] = [...detectImgAlt(content, filePath), ...detectDecorativeAlt(content, filePath), ...detectSvgTitle(content, filePath), ...detectIconLabel(content, filePath), ...detectFigureCaption(content, filePath)];
  const violations: AltTextViolationInfo[] = [...detectMissingAltViolations(content, filePath), ...detectRedundantAltViolations(content, filePath)];
  const imgWithAltCount = patterns.filter((p) => p.type === 'img-alt').length;
  const decorativeCount = patterns.filter((p) => p.type === 'decorative-alt').length;
  let confidence = 0.7; if (patterns.length > 0) {confidence += 0.15;} if (violations.length === 0) {confidence += 0.1;} confidence = Math.min(confidence, 0.95);
  return { patterns, violations, imgWithAltCount, decorativeCount, confidence };
}

export class AltTextDetector extends RegexDetector {
  readonly id = 'accessibility/alt-text';
  readonly name = 'Alt Text Detector';
  readonly description = 'Detects alt text patterns for images and icons';
  readonly category: PatternCategory = 'accessibility';
  readonly subcategory = 'alt-text';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {return this.createEmptyResult();}
    const analysis = analyzeAltText(context.content, context.file);
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
    
    return this.createResult([], violations, analysis.confidence, { custom: { patterns: analysis.patterns, imgWithAltCount: analysis.imgWithAltCount, decorativeCount: analysis.decorativeCount } });
  }

  generateQuickFix(_violation: Violation): QuickFix | null { return null; }
}

export function createAltTextDetector(): AltTextDetector { return new AltTextDetector(); }
