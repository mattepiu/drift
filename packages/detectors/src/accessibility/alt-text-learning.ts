/**
 * Alt Text Detector - LEARNING VERSION
 *
 * Learns alt text patterns from the user's codebase:
 * - Alt text conventions
 * - Decorative image handling
 * - Icon labeling patterns
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

export type AltTextStyle = 'descriptive' | 'empty-decorative' | 'aria-label';

export interface AltTextConventions {
  [key: string]: unknown;
  style: AltTextStyle;
  usesEmptyAltForDecorative: boolean;
  usesAriaLabel: boolean;
}

interface AltTextPatternInfo {
  type: 'img-alt' | 'decorative' | 'aria-label' | 'svg-title';
  hasAlt: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractAltTextPatterns(content: string, file: string): AltTextPatternInfo[] {
  const results: AltTextPatternInfo[] = [];

  // img with alt
  const imgAltPattern = /<img[^>]+alt\s*=\s*['"]([^'"]*)['"]/gi;
  let match;
  while ((match = imgAltPattern.exec(content)) !== null) {
    const altValue = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: altValue === '' ? 'decorative' : 'img-alt',
      hasAlt: true,
      line,
      column,
      file,
    });
  }

  // aria-label on images/icons
  const ariaLabelPattern = /<(?:img|svg|Icon|i)[^>]+aria-label\s*=\s*['"]([^'"]+)['"]/gi;
  while ((match = ariaLabelPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'aria-label',
      hasAlt: true,
      line,
      column,
      file,
    });
  }

  // SVG with title
  const svgTitlePattern = /<svg[^>]*>[\s\S]*?<title>/gi;
  while ((match = svgTitlePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'svg-title',
      hasAlt: true,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Alt Text Detector
// ============================================================================

export class AltTextLearningDetector extends LearningDetector<AltTextConventions> {
  readonly id = 'accessibility/alt-text';
  readonly category = 'accessibility' as const;
  readonly subcategory = 'alt-text';
  readonly name = 'Alt Text Detector (Learning)';
  readonly description = 'Learns alt text patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof AltTextConventions> {
    return ['style', 'usesEmptyAltForDecorative', 'usesAriaLabel'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof AltTextConventions, ValueDistribution>
  ): void {
    const patterns = extractAltTextPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('style')!;
    const emptyAltDist = distributions.get('usesEmptyAltForDecorative')!;
    const ariaLabelDist = distributions.get('usesAriaLabel')!;

    let hasDecorative = false;
    let hasAriaLabel = false;

    for (const pattern of patterns) {
      if (pattern.type === 'decorative') {
        styleDist.add('empty-decorative', context.file);
        hasDecorative = true;
      } else if (pattern.type === 'aria-label') {
        styleDist.add('aria-label', context.file);
        hasAriaLabel = true;
      } else {
        styleDist.add('descriptive', context.file);
      }
    }

    emptyAltDist.add(hasDecorative, context.file);
    ariaLabelDist.add(hasAriaLabel, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    _conventions: LearningResult<AltTextConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const altPatterns = extractAltTextPatterns(context.content, context.file);
    if (altPatterns.length === 0) {
      return this.createEmptyResult();
    }

    if (altPatterns.length > 0) {
      const first = altPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/alt-text`,
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

export function createAltTextLearningDetector(): AltTextLearningDetector {
  return new AltTextLearningDetector();
}
