/**
 * Tailwind Patterns Detector - LEARNING VERSION
 *
 * Learns Tailwind CSS usage patterns from the user's codebase:
 * - Class ordering conventions
 * - Utility class grouping patterns
 * - Custom class naming patterns
 * - Arbitrary value usage patterns
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
 * Tailwind class category types
 */
export type TailwindCategory =
  | 'layout'
  | 'flexbox'
  | 'grid'
  | 'spacing'
  | 'sizing'
  | 'typography'
  | 'backgrounds'
  | 'borders'
  | 'effects'
  | 'filters'
  | 'transitions'
  | 'transforms'
  | 'interactivity'
  | 'other';

/**
 * Conventions this detector learns
 */
export interface TailwindConventions {
  [key: string]: unknown;
  /** Class ordering pattern (category order) */
  categoryOrder: TailwindCategory[];
  /** Whether arbitrary values are used */
  usesArbitraryValues: boolean;
  /** Common arbitrary value patterns */
  arbitraryPatterns: string[];
  /** Whether responsive prefixes come first or last */
  responsivePrefixPosition: 'first' | 'last';
}

/**
 * Tailwind class info extracted from code
 */
interface TailwindClassInfo {
  className: string;
  category: TailwindCategory;
  hasResponsivePrefix: boolean;
  hasStatePrefix: boolean;
  isArbitrary: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_PATTERNS: Record<TailwindCategory, RegExp[]> = {
  layout: [/^(?:block|inline|flex|grid|hidden|container|box-)/],
  flexbox: [/^(?:flex-|justify-|items-|content-|self-|order-)/],
  grid: [/^(?:grid-|col-|row-|gap-|auto-)/],
  spacing: [/^(?:p[xytblr]?-|m[xytblr]?-|space-)/],
  sizing: [/^(?:w-|h-|min-|max-|size-)/],
  typography: [/^(?:text-|font-|leading-|tracking-|line-clamp)/],
  backgrounds: [/^(?:bg-|from-|via-|to-|gradient-)/],
  borders: [/^(?:border|rounded|ring|outline|divide)/],
  effects: [/^(?:shadow|opacity|mix-blend|bg-blend)/],
  filters: [/^(?:blur|brightness|contrast|grayscale|hue-rotate|invert|saturate|sepia|backdrop)/],
  transitions: [/^(?:transition|duration|ease|delay|animate)/],
  transforms: [/^(?:scale|rotate|translate|skew|origin|transform)/],
  interactivity: [/^(?:cursor|pointer-events|resize|scroll|touch|select|will-change)/],
  other: [/.*/],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Categorize a Tailwind class
 */
function categorizeClass(className: string): TailwindCategory {
  // Remove responsive/state prefixes for categorization
  const baseClass = className.replace(/^(?:sm:|md:|lg:|xl:|2xl:|hover:|focus:|active:|disabled:|group-hover:)+/, '');

  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (category === 'other') {continue;}
    for (const pattern of patterns) {
      if (pattern.test(baseClass)) {
        return category as TailwindCategory;
      }
    }
  }

  return 'other';
}

/**
 * Extract Tailwind classes from content
 */
function extractTailwindClasses(content: string, file: string): TailwindClassInfo[] {
  const results: TailwindClassInfo[] = [];

  // Match className="..." or class="..."
  const classAttrPattern = /(?:className|class)=["']([^"']+)["']/g;
  let attrMatch;

  while ((attrMatch = classAttrPattern.exec(content)) !== null) {
    const classString = attrMatch[1] || '';
    const classes = classString.split(/\s+/).filter(Boolean);

    const beforeMatch = content.slice(0, attrMatch.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const baseColumn = attrMatch.index - lastNewline;

    for (const className of classes) {
      const hasResponsivePrefix = /^(?:sm:|md:|lg:|xl:|2xl:)/.test(className);
      const hasStatePrefix = /^(?:hover:|focus:|active:|disabled:|group-hover:)/.test(className);
      const isArbitrary = /\[[^\]]+\]/.test(className);

      results.push({
        className,
        category: categorizeClass(className),
        hasResponsivePrefix,
        hasStatePrefix,
        isArbitrary,
        line,
        column: baseColumn,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Tailwind Patterns Detector
// ============================================================================

export class TailwindPatternsLearningDetector extends LearningDetector<TailwindConventions> {
  readonly id = 'styling/tailwind-patterns';
  readonly category = 'styling' as const;
  readonly subcategory = 'tailwind-patterns';
  readonly name = 'Tailwind Patterns Detector (Learning)';
  readonly description = 'Learns Tailwind CSS patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof TailwindConventions> {
    return ['categoryOrder', 'usesArbitraryValues', 'arbitraryPatterns', 'responsivePrefixPosition'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TailwindConventions, ValueDistribution>
  ): void {
    const classes = extractTailwindClasses(context.content, context.file);

    if (classes.length === 0) {return;}

    const arbitraryDist = distributions.get('usesArbitraryValues')!;
    const arbitraryPatternsDist = distributions.get('arbitraryPatterns')!;
    const responsivePosDist = distributions.get('responsivePrefixPosition')!;

    // Track arbitrary value usage
    const hasArbitrary = classes.some(c => c.isArbitrary);
    arbitraryDist.add(hasArbitrary, context.file);

    // Track arbitrary patterns
    for (const cls of classes) {
      if (cls.isArbitrary) {
        const pattern = cls.className.replace(/\[[^\]]+\]/, '[*]');
        arbitraryPatternsDist.add(pattern, context.file);
      }
    }

    // Track responsive prefix position
    const responsiveClasses = classes.filter(c => c.hasResponsivePrefix);
    const nonResponsiveClasses = classes.filter(c => !c.hasResponsivePrefix);

    if (responsiveClasses.length > 0 && nonResponsiveClasses.length > 0) {
      // Check if responsive classes tend to come first or last
      const firstResponsiveIndex = classes.findIndex(c => c.hasResponsivePrefix);
      const lastNonResponsiveIndex = classes.length - 1 - [...classes].reverse().findIndex(c => !c.hasResponsivePrefix);

      if (firstResponsiveIndex < lastNonResponsiveIndex) {
        responsivePosDist.add('first', context.file);
      } else {
        responsivePosDist.add('last', context.file);
      }
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TailwindConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const classes = extractTailwindClasses(context.content, context.file);

    if (classes.length === 0) {
      return this.createEmptyResult();
    }

    // Get learned conventions
    const learnedUsesArbitrary = conventions.conventions.usesArbitraryValues?.value;
    const learnedResponsivePos = conventions.conventions.responsivePrefixPosition?.value;

    // Check arbitrary value usage consistency
    if (learnedUsesArbitrary === false) {
      for (const cls of classes) {
        if (cls.isArbitrary) {
          violations.push(this.createConventionViolation(
            cls.file,
            cls.line,
            cls.column,
            'arbitrary values',
            cls.className,
            'standard Tailwind class',
            `Arbitrary value '${cls.className}' used but project avoids arbitrary values`
          ));
        }
      }
    }

    // Check responsive prefix position consistency
    if (learnedResponsivePos) {
      const responsiveClasses = classes.filter(c => c.hasResponsivePrefix);
      const nonResponsiveClasses = classes.filter(c => !c.hasResponsivePrefix);

      if (responsiveClasses.length > 0 && nonResponsiveClasses.length > 0) {
        const firstResponsiveIndex = classes.findIndex(c => c.hasResponsivePrefix);
        const lastNonResponsiveIndex = classes.length - 1 - [...classes].reverse().findIndex(c => !c.hasResponsivePrefix);

        const actualPosition = firstResponsiveIndex < lastNonResponsiveIndex ? 'first' : 'last';

        if (actualPosition !== learnedResponsivePos) {
          const firstResponsive = responsiveClasses[0];
          if (firstResponsive) {
            violations.push(this.createConventionViolation(
              firstResponsive.file,
              firstResponsive.line,
              firstResponsive.column,
              'responsive prefix position',
              actualPosition,
              learnedResponsivePos,
              `Responsive classes should come ${learnedResponsivePos} in class list`
            ));
          }
        }
      }
    }

    // Create pattern matches
    if (classes.length > 0) {
      const firstClass = classes[0];
      if (firstClass) {
        patterns.push({
          patternId: `${this.id}/tailwind`,
          location: {
            file: context.file,
            line: firstClass.line,
            column: firstClass.column,
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

export function createTailwindPatternsLearningDetector(): TailwindPatternsLearningDetector {
  return new TailwindPatternsLearningDetector();
}
