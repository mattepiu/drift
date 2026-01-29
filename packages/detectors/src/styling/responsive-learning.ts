/**
 * Responsive Detector - LEARNING VERSION
 *
 * Learns responsive breakpoint patterns from the user's codebase:
 * - Breakpoint approach (mobile-first vs desktop-first)
 * - Breakpoint values used
 * - Responsive class ordering conventions
 * - Media query vs Tailwind prefixes
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
 * Responsive approach types
 */
export type ResponsiveApproach = 'mobile-first' | 'desktop-first' | 'mixed';

/**
 * Responsive method types
 */
export type ResponsiveMethod = 'tailwind-prefixes' | 'css-media-queries' | 'container-queries' | 'theme-breakpoints';

/**
 * Conventions this detector learns
 */
export interface ResponsiveConventions {
  [key: string]: unknown;
  /** Mobile-first or desktop-first approach */
  approach: ResponsiveApproach;
  /** Primary responsive method */
  method: ResponsiveMethod;
  /** Breakpoint values used (in pixels) */
  breakpointValues: number[];
  /** Tailwind breakpoint order */
  breakpointOrder: string[];
}

/**
 * Responsive pattern info extracted from code
 */
interface ResponsivePatternInfo {
  type: ResponsiveMethod;
  approach: 'mobile-first' | 'desktop-first';
  breakpoint: string;
  breakpointValue?: number | undefined;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Constants
// ============================================================================

const TAILWIND_BREAKPOINT_ORDER = ['sm', 'md', 'lg', 'xl', '2xl'];
const TAILWIND_BREAKPOINTS: Record<string, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract Tailwind responsive prefixes from content
 */
function extractTailwindResponsive(content: string, file: string): ResponsivePatternInfo[] {
  const results: ResponsivePatternInfo[] = [];
  const pattern = /\b(sm|md|lg|xl|2xl):([a-z][a-z0-9-]*(?:-[a-z0-9]+)*)/gi;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const breakpoint = match[1]?.toLowerCase() || '';

    results.push({
      type: 'tailwind-prefixes',
      approach: 'mobile-first', // Tailwind is always mobile-first
      breakpoint,
      breakpointValue: TAILWIND_BREAKPOINTS[breakpoint],
      line,
      column,
      file,
    });
  }

  return results;
}

/**
 * Extract CSS media queries from content
 */
function extractMediaQueries(content: string, file: string): ResponsivePatternInfo[] {
  const results: ResponsivePatternInfo[] = [];

  // min-width (mobile-first)
  const minWidthPattern = /@media\s+(?:screen\s+and\s+)?\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)\s*\)/gi;
  let match;
  while ((match = minWidthPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const value = parseFloat(match[1] || '0');
    const unit = match[2] || 'px';
    const breakpointValue = unit === 'px' ? value : value * 16;

    results.push({
      type: 'css-media-queries',
      approach: 'mobile-first',
      breakpoint: `${value}${unit}`,
      breakpointValue,
      line,
      column,
      file,
    });
  }

  // max-width (desktop-first)
  const maxWidthPattern = /@media\s+(?:screen\s+and\s+)?\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)\s*\)/gi;
  while ((match = maxWidthPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const value = parseFloat(match[1] || '0');
    const unit = match[2] || 'px';
    const breakpointValue = unit === 'px' ? value : value * 16;

    results.push({
      type: 'css-media-queries',
      approach: 'desktop-first',
      breakpoint: `${value}${unit}`,
      breakpointValue,
      line,
      column,
      file,
    });
  }

  return results;
}

/**
 * Get breakpoint order index
 */
function getBreakpointOrderIndex(breakpoint: string): number {
  return TAILWIND_BREAKPOINT_ORDER.indexOf(breakpoint.toLowerCase());
}

// ============================================================================
// Learning Responsive Detector
// ============================================================================

export class ResponsiveLearningDetector extends LearningDetector<ResponsiveConventions> {
  readonly id = 'styling/responsive';
  readonly category = 'styling' as const;
  readonly subcategory = 'responsive';
  readonly name = 'Responsive Detector (Learning)';
  readonly description = 'Learns responsive breakpoint patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof ResponsiveConventions> {
    return ['approach', 'method', 'breakpointValues', 'breakpointOrder'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ResponsiveConventions, ValueDistribution>
  ): void {
    const tailwindPatterns = extractTailwindResponsive(context.content, context.file);
    const mediaQueryPatterns = extractMediaQueries(context.content, context.file);
    const allPatterns = [...tailwindPatterns, ...mediaQueryPatterns];

    if (allPatterns.length === 0) {return;}

    const approachDist = distributions.get('approach')!;
    const methodDist = distributions.get('method')!;
    const breakpointValuesDist = distributions.get('breakpointValues')!;
    const breakpointOrderDist = distributions.get('breakpointOrder')!;

    for (const pattern of allPatterns) {
      approachDist.add(pattern.approach, context.file);
      methodDist.add(pattern.type, context.file);

      if (pattern.breakpointValue) {
        breakpointValuesDist.add(pattern.breakpointValue, context.file);
      }

      if (pattern.type === 'tailwind-prefixes') {
        breakpointOrderDist.add(pattern.breakpoint, context.file);
      }
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ResponsiveConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const tailwindPatterns = extractTailwindResponsive(context.content, context.file);
    const mediaQueryPatterns = extractMediaQueries(context.content, context.file);
    const allPatterns = [...tailwindPatterns, ...mediaQueryPatterns];

    if (allPatterns.length === 0) {
      return this.createEmptyResult();
    }

    // Get learned conventions
    const learnedApproach = conventions.conventions.approach?.value;
    const learnedMethod = conventions.conventions.method?.value;

    // Check approach consistency
    if (learnedApproach && learnedApproach !== 'mixed') {
      for (const pattern of allPatterns) {
        if (pattern.approach !== learnedApproach) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'responsive approach',
            pattern.approach,
            learnedApproach,
            `Using ${pattern.approach} but project uses ${learnedApproach} approach`
          ));
        }
      }
    }

    // Check method consistency
    if (learnedMethod) {
      for (const pattern of allPatterns) {
        if (pattern.type !== learnedMethod) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'responsive method',
            pattern.type,
            learnedMethod,
            `Using ${pattern.type} but project primarily uses ${learnedMethod}`
          ));
        }
      }
    }

    // Check Tailwind breakpoint ordering within same line
    const lines = context.content.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const linePatterns = tailwindPatterns.filter(p => p.line === lineIndex + 1);

      if (linePatterns.length >= 2) {
        // Check ordering
        for (let i = 0; i < linePatterns.length - 1; i++) {
          const current = linePatterns[i]!;
          const next = linePatterns[i + 1]!;
          const currentOrder = getBreakpointOrderIndex(current.breakpoint);
          const nextOrder = getBreakpointOrderIndex(next.breakpoint);

          if (currentOrder > nextOrder) {
            violations.push(this.createConventionViolation(
              context.file,
              current.line,
              current.column,
              'breakpoint order',
              `${current.breakpoint} before ${next.breakpoint}`,
              `${next.breakpoint} before ${current.breakpoint}`,
              `Breakpoint '${current.breakpoint}:' should come after '${next.breakpoint}:' (mobile-first order)`
            ));
          }
        }
      }
    }

    // Create pattern matches
    if (allPatterns.length > 0) {
      const firstPattern = allPatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/responsive`,
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

export function createResponsiveLearningDetector(): ResponsiveLearningDetector {
  return new ResponsiveLearningDetector();
}
