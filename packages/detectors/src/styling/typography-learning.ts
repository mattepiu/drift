/**
 * Typography Detector - LEARNING VERSION
 *
 * Learns typography patterns from the user's codebase:
 * - Font family conventions
 * - Font size scale
 * - Line height patterns
 * - Font weight usage
 *
 * Flags violations only when code deviates from the PROJECT'S established patterns.
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

/**
 * Typography method types
 */
export type TypographyMethod = 'tailwind' | 'css-vars' | 'theme-object' | 'inline';

/**
 * Conventions this detector learns
 */
export interface TypographyConventions {
  [key: string]: unknown;
  /** Primary typography method */
  method: TypographyMethod;
  /** Font families used */
  fontFamilies: string[];
  /** Font size scale (in pixels) */
  fontSizeScale: number[];
  /** Line height values */
  lineHeights: number[];
  /** Font weights used */
  fontWeights: number[];
}

/**
 * Typography pattern info extracted from code
 */
interface TypographyPatternInfo {
  method: TypographyMethod;
  property: 'font-family' | 'font-size' | 'line-height' | 'font-weight';
  value: string | number;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract Tailwind typography classes from content
 */
function extractTailwindTypography(content: string, file: string): TypographyPatternInfo[] {
  const results: TypographyPatternInfo[] = [];

  // Font size classes
  const fontSizePattern = /\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/g;
  let match;
  while ((match = fontSizePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      method: 'tailwind',
      property: 'font-size',
      value: match[1] || '',
      line,
      column,
      file,
    });
  }

  // Font weight classes
  const fontWeightPattern = /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g;
  while ((match = fontWeightPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      method: 'tailwind',
      property: 'font-weight',
      value: match[1] || '',
      line,
      column,
      file,
    });
  }

  // Line height classes
  const lineHeightPattern = /\bleading-(none|tight|snug|normal|relaxed|loose|\d+)\b/g;
  while ((match = lineHeightPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      method: 'tailwind',
      property: 'line-height',
      value: match[1] || '',
      line,
      column,
      file,
    });
  }

  // Font family classes
  const fontFamilyPattern = /\bfont-(sans|serif|mono)\b/g;
  while ((match = fontFamilyPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      method: 'tailwind',
      property: 'font-family',
      value: match[1] || '',
      line,
      column,
      file,
    });
  }

  return results;
}

/**
 * Extract CSS typography values from content
 */
function extractCSSTypography(content: string, file: string): TypographyPatternInfo[] {
  const results: TypographyPatternInfo[] = [];

  // Font size
  const fontSizePattern = /font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)/gi;
  let match;
  while ((match = fontSizePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const value = parseFloat(match[1] || '0');
    const unit = match[2] || 'px';
    const pxValue = unit === 'px' ? value : value * 16;

    results.push({
      method: 'inline',
      property: 'font-size',
      value: pxValue,
      line,
      column,
      file,
    });
  }

  // Font weight
  const fontWeightPattern = /font-weight\s*:\s*(\d+|normal|bold|lighter|bolder)/gi;
  while ((match = fontWeightPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    let weight: number;
    const rawValue = match[1] || '';
    if (rawValue === 'normal') {weight = 400;}
    else if (rawValue === 'bold') {weight = 700;}
    else {weight = parseInt(rawValue, 10) || 400;}

    results.push({
      method: 'inline',
      property: 'font-weight',
      value: weight,
      line,
      column,
      file,
    });
  }

  // Line height
  const lineHeightPattern = /line-height\s*:\s*(\d+(?:\.\d+)?)(px|rem|em|%)?/gi;
  while ((match = lineHeightPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      method: 'inline',
      property: 'line-height',
      value: parseFloat(match[1] || '0'),
      line,
      column,
      file,
    });
  }

  // Font family
  const fontFamilyPattern = /font-family\s*:\s*['"]?([^;'"]+)['"]?/gi;
  while ((match = fontFamilyPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      method: 'inline',
      property: 'font-family',
      value: (match[1] || '').trim(),
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Typography Detector
// ============================================================================

export class TypographyLearningDetector extends LearningDetector<TypographyConventions> {
  readonly id = 'styling/typography';
  readonly category = 'styling' as const;
  readonly subcategory = 'typography';
  readonly name = 'Typography Detector (Learning)';
  readonly description = 'Learns typography patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof TypographyConventions> {
    return ['method', 'fontFamilies', 'fontSizeScale', 'lineHeights', 'fontWeights'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TypographyConventions, ValueDistribution>
  ): void {
    const tailwindTypo = extractTailwindTypography(context.content, context.file);
    const cssTypo = extractCSSTypography(context.content, context.file);
    const allPatterns = [...tailwindTypo, ...cssTypo];

    if (allPatterns.length === 0) {return;}

    const methodDist = distributions.get('method')!;
    const fontFamiliesDist = distributions.get('fontFamilies')!;
    const fontSizesDist = distributions.get('fontSizeScale')!;
    const lineHeightsDist = distributions.get('lineHeights')!;
    const fontWeightsDist = distributions.get('fontWeights')!;

    for (const pattern of allPatterns) {
      methodDist.add(pattern.method, context.file);

      switch (pattern.property) {
        case 'font-family':
          fontFamiliesDist.add(String(pattern.value), context.file);
          break;
        case 'font-size':
          if (typeof pattern.value === 'number') {
            fontSizesDist.add(pattern.value, context.file);
          }
          break;
        case 'line-height':
          if (typeof pattern.value === 'number') {
            lineHeightsDist.add(pattern.value, context.file);
          }
          break;
        case 'font-weight':
          if (typeof pattern.value === 'number') {
            fontWeightsDist.add(pattern.value, context.file);
          }
          break;
      }
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TypographyConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const tailwindTypo = extractTailwindTypography(context.content, context.file);
    const cssTypo = extractCSSTypography(context.content, context.file);
    const allPatterns = [...tailwindTypo, ...cssTypo];

    if (allPatterns.length === 0) {
      return this.createEmptyResult();
    }

    // Get learned conventions
    const learnedMethod = conventions.conventions.method?.value;

    // Check method consistency
    if (learnedMethod) {
      for (const pattern of allPatterns) {
        if (pattern.method !== learnedMethod) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'typography method',
            pattern.method,
            learnedMethod,
            `Using ${pattern.method} typography but project primarily uses ${learnedMethod}`
          ));
        }
      }
    }

    // Create pattern matches
    if (allPatterns.length > 0) {
      const firstPattern = allPatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/typography`,
          location: {
            file: context.file,
            line: firstPattern.line,
            column: firstPattern.column,
          },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  // ============================================================================
  // Quick Fix
  // ============================================================================

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTypographyLearningDetector(): TypographyLearningDetector {
  return new TypographyLearningDetector();
}
