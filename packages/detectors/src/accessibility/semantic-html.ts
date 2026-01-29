/**
 * Semantic HTML Detector - Semantic HTML pattern detection
 *
 * Detects semantic HTML patterns including:
 * - Semantic elements (header, nav, main, footer, article, section)
 * - Landmark roles
 * - Non-semantic div/span usage
 *
 * @requirements 20.1 - Semantic HTML patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type SemanticHtmlPatternType =
  | 'header-element'
  | 'nav-element'
  | 'main-element'
  | 'footer-element'
  | 'article-element'
  | 'section-element'
  | 'aside-element'
  | 'figure-element'
  | 'landmark-role';

export type SemanticHtmlViolationType =
  | 'div-soup'
  | 'missing-main'
  | 'missing-nav'
  | 'non-semantic-button';

export interface SemanticHtmlPatternInfo {
  type: SemanticHtmlPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  context?: string | undefined;
}

export interface SemanticHtmlViolationInfo {
  type: SemanticHtmlViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface SemanticHtmlAnalysis {
  patterns: SemanticHtmlPatternInfo[];
  violations: SemanticHtmlViolationInfo[];
  semanticElementCount: number;
  hasMain: boolean;
  hasNav: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const HEADER_ELEMENT_PATTERNS = [/<header[\s>]/gi, /<Header[\s>]/g] as const;
export const NAV_ELEMENT_PATTERNS = [/<nav[\s>]/gi, /<Nav[\s>]/g] as const;
export const MAIN_ELEMENT_PATTERNS = [/<main[\s>]/gi, /<Main[\s>]/g] as const;
export const FOOTER_ELEMENT_PATTERNS = [/<footer[\s>]/gi, /<Footer[\s>]/g] as const;
export const ARTICLE_ELEMENT_PATTERNS = [/<article[\s>]/gi, /<Article[\s>]/g] as const;
export const SECTION_ELEMENT_PATTERNS = [/<section[\s>]/gi, /<Section[\s>]/g] as const;
export const ASIDE_ELEMENT_PATTERNS = [/<aside[\s>]/gi, /<Aside[\s>]/g] as const;
export const FIGURE_ELEMENT_PATTERNS = [/<figure[\s>]/gi, /<Figure[\s>]/g] as const;

export const LANDMARK_ROLE_PATTERNS = [
  /role\s*=\s*['"`]banner['"`]/gi,
  /role\s*=\s*['"`]navigation['"`]/gi,
  /role\s*=\s*['"`]main['"`]/gi,
  /role\s*=\s*['"`]contentinfo['"`]/gi,
  /role\s*=\s*['"`]complementary['"`]/gi,
  /role\s*=\s*['"`]region['"`]/gi,
] as const;

export const DIV_SOUP_PATTERNS = [
  /<div[^>]*onClick/gi,
  /<div[^>]*role\s*=\s*['"`]button['"`]/gi,
  /<span[^>]*onClick/gi,
] as const;

export const NON_SEMANTIC_BUTTON_PATTERNS = [
  /<div[^>]*onClick[^>]*>[^<]*(?:click|submit|button)/gi,
  /<span[^>]*onClick[^>]*>[^<]*(?:click|submit|button)/gi,
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
  type: SemanticHtmlPatternType
): SemanticHtmlPatternInfo[] {
  const results: SemanticHtmlPatternInfo[] = [];
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

export function detectHeaderElement(content: string, filePath: string): SemanticHtmlPatternInfo[] {
  return detectPatterns(content, filePath, HEADER_ELEMENT_PATTERNS, 'header-element');
}

export function detectNavElement(content: string, filePath: string): SemanticHtmlPatternInfo[] {
  return detectPatterns(content, filePath, NAV_ELEMENT_PATTERNS, 'nav-element');
}

export function detectMainElement(content: string, filePath: string): SemanticHtmlPatternInfo[] {
  return detectPatterns(content, filePath, MAIN_ELEMENT_PATTERNS, 'main-element');
}

export function detectFooterElement(content: string, filePath: string): SemanticHtmlPatternInfo[] {
  return detectPatterns(content, filePath, FOOTER_ELEMENT_PATTERNS, 'footer-element');
}

export function detectArticleElement(content: string, filePath: string): SemanticHtmlPatternInfo[] {
  return detectPatterns(content, filePath, ARTICLE_ELEMENT_PATTERNS, 'article-element');
}

export function detectSectionElement(content: string, filePath: string): SemanticHtmlPatternInfo[] {
  return detectPatterns(content, filePath, SECTION_ELEMENT_PATTERNS, 'section-element');
}

export function detectAsideElement(content: string, filePath: string): SemanticHtmlPatternInfo[] {
  return detectPatterns(content, filePath, ASIDE_ELEMENT_PATTERNS, 'aside-element');
}

export function detectFigureElement(content: string, filePath: string): SemanticHtmlPatternInfo[] {
  return detectPatterns(content, filePath, FIGURE_ELEMENT_PATTERNS, 'figure-element');
}

export function detectLandmarkRole(content: string, filePath: string): SemanticHtmlPatternInfo[] {
  return detectPatterns(content, filePath, LANDMARK_ROLE_PATTERNS, 'landmark-role');
}

export function detectDivSoupViolations(
  content: string,
  filePath: string
): SemanticHtmlViolationInfo[] {
  const results: SemanticHtmlViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DIV_SOUP_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'div-soup',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Interactive div/span should use semantic elements',
          suggestedFix: 'Use <button> for clickable elements',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeSemanticHtml(
  content: string,
  filePath: string
): SemanticHtmlAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      semanticElementCount: 0,
      hasMain: false,
      hasNav: false,
      confidence: 1.0,
    };
  }

  const patterns: SemanticHtmlPatternInfo[] = [
    ...detectHeaderElement(content, filePath),
    ...detectNavElement(content, filePath),
    ...detectMainElement(content, filePath),
    ...detectFooterElement(content, filePath),
    ...detectArticleElement(content, filePath),
    ...detectSectionElement(content, filePath),
    ...detectAsideElement(content, filePath),
    ...detectFigureElement(content, filePath),
    ...detectLandmarkRole(content, filePath),
  ];

  const violations: SemanticHtmlViolationInfo[] = [
    ...detectDivSoupViolations(content, filePath),
  ];

  const semanticElementCount = patterns.length;
  const hasMain = patterns.some((p) => p.type === 'main-element');
  const hasNav = patterns.some((p) => p.type === 'nav-element');

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (violations.length === 0) {confidence += 0.1;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    semanticElementCount,
    hasMain,
    hasNav,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class SemanticHtmlDetector extends RegexDetector {
  readonly id = 'accessibility/semantic-html';
  readonly name = 'Semantic HTML Detector';
  readonly description = 'Detects semantic HTML element usage patterns';
  readonly category: PatternCategory = 'accessibility';
  readonly subcategory = 'semantic-html';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeSemanticHtml(context.content, context.file);

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
        semanticElementCount: analysis.semanticElementCount,
        hasMain: analysis.hasMain,
        hasNav: analysis.hasNav,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createSemanticHtmlDetector(): SemanticHtmlDetector {
  return new SemanticHtmlDetector();
}
