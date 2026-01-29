/**
 * Z-Index Scale Detector - LEARNING VERSION
 *
 * Learns z-index patterns from the user's codebase:
 * - Z-index scale values used
 * - Z-index naming conventions (CSS vars, theme tokens)
 * - Z-index layering patterns
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
 * Z-index method types
 */
export type ZIndexMethod = 'tailwind' | 'css-vars' | 'theme-object' | 'inline';

/**
 * Conventions this detector learns
 */
export interface ZIndexConventions {
  [key: string]: unknown;
  /** Primary z-index method */
  method: ZIndexMethod;
  /** Z-index scale values used */
  scaleValues: number[];
  /** Whether project uses semantic z-index names */
  usesSemanticNames: boolean;
  /** Maximum z-index value used */
  maxZIndex: number;
}

/**
 * Z-index pattern info extracted from code
 */
interface ZIndexPatternInfo {
  method: ZIndexMethod;
  value: number;
  rawValue: string;
  isSemanticName: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract Tailwind z-index classes from content
 */
function extractTailwindZIndex(content: string, file: string): ZIndexPatternInfo[] {
  const results: ZIndexPatternInfo[] = [];
  const pattern = /\bz-(\d+|auto)\b/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const rawValue = match[1] || '0';
    const value = rawValue === 'auto' ? 0 : parseInt(rawValue, 10);

    results.push({
      method: 'tailwind',
      value,
      rawValue: match[0],
      isSemanticName: false,
      line,
      column,
      file,
    });
  }

  return results;
}

/**
 * Extract CSS z-index values from content
 */
function extractCSSZIndex(content: string, file: string): ZIndexPatternInfo[] {
  const results: ZIndexPatternInfo[] = [];

  // Inline z-index values
  const inlinePattern = /z-index\s*:\s*(-?\d+)/gi;
  let match;
  while ((match = inlinePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      method: 'inline',
      value: parseInt(match[1] || '0', 10),
      rawValue: match[0],
      isSemanticName: false,
      line,
      column,
      file,
    });
  }

  // CSS custom property z-index
  const cssVarPattern = /z-index\s*:\s*var\(\s*--([a-zA-Z0-9_-]+)\s*\)/gi;
  while ((match = cssVarPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      method: 'css-vars',
      value: 0, // Can't determine actual value
      rawValue: match[0],
      isSemanticName: true,
      line,
      column,
      file,
    });
  }

  return results;
}

/**
 * Extract theme z-index usage from content
 */
function extractThemeZIndex(content: string, file: string): ZIndexPatternInfo[] {
  const results: ZIndexPatternInfo[] = [];
  const pattern = /theme\.zIndex\.([a-zA-Z0-9_]+)/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      method: 'theme-object',
      value: 0, // Can't determine actual value
      rawValue: match[0],
      isSemanticName: true,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Z-Index Scale Detector
// ============================================================================

export class ZIndexScaleLearningDetector extends LearningDetector<ZIndexConventions> {
  readonly id = 'styling/z-index-scale';
  readonly category = 'styling' as const;
  readonly subcategory = 'z-index-scale';
  readonly name = 'Z-Index Scale Detector (Learning)';
  readonly description = 'Learns z-index patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof ZIndexConventions> {
    return ['method', 'scaleValues', 'usesSemanticNames', 'maxZIndex'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ZIndexConventions, ValueDistribution>
  ): void {
    const tailwindZIndex = extractTailwindZIndex(context.content, context.file);
    const cssZIndex = extractCSSZIndex(context.content, context.file);
    const themeZIndex = extractThemeZIndex(context.content, context.file);
    const allPatterns = [...tailwindZIndex, ...cssZIndex, ...themeZIndex];

    if (allPatterns.length === 0) {return;}

    const methodDist = distributions.get('method')!;
    const scaleValuesDist = distributions.get('scaleValues')!;
    const semanticNamesDist = distributions.get('usesSemanticNames')!;
    const maxZIndexDist = distributions.get('maxZIndex')!;

    for (const pattern of allPatterns) {
      methodDist.add(pattern.method, context.file);
      semanticNamesDist.add(pattern.isSemanticName, context.file);

      if (pattern.value > 0) {
        scaleValuesDist.add(pattern.value, context.file);
        maxZIndexDist.add(pattern.value, context.file);
      }
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ZIndexConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const tailwindZIndex = extractTailwindZIndex(context.content, context.file);
    const cssZIndex = extractCSSZIndex(context.content, context.file);
    const themeZIndex = extractThemeZIndex(context.content, context.file);
    const allPatterns = [...tailwindZIndex, ...cssZIndex, ...themeZIndex];

    if (allPatterns.length === 0) {
      return this.createEmptyResult();
    }

    // Get learned conventions
    const learnedMethod = conventions.conventions.method?.value;
    const learnedUsesSemanticNames = conventions.conventions.usesSemanticNames?.value;
    const learnedMaxZIndex = conventions.conventions.maxZIndex?.value;

    // Check method consistency
    if (learnedMethod) {
      for (const pattern of allPatterns) {
        if (pattern.method !== learnedMethod) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'z-index method',
            pattern.method,
            learnedMethod,
            `Using ${pattern.method} z-index but project primarily uses ${learnedMethod}`
          ));
        }
      }
    }

    // Check semantic names usage
    if (learnedUsesSemanticNames === true) {
      for (const pattern of allPatterns) {
        if (!pattern.isSemanticName && pattern.method === 'inline') {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'z-index naming',
            'inline value',
            'semantic name (CSS var or theme token)',
            `Use semantic z-index name instead of inline value '${pattern.value}'`
          ));
        }
      }
    }

    // Check max z-index
    if (learnedMaxZIndex !== undefined) {
      for (const pattern of allPatterns) {
        if (pattern.value > learnedMaxZIndex * 1.5) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'z-index value',
            String(pattern.value),
            `<= ${learnedMaxZIndex}`,
            `Z-index ${pattern.value} exceeds project's typical max of ${learnedMaxZIndex}`
          ));
        }
      }
    }

    // Create pattern matches
    if (allPatterns.length > 0) {
      const firstPattern = allPatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/z-index`,
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

export function createZIndexScaleLearningDetector(): ZIndexScaleLearningDetector {
  return new ZIndexScaleLearningDetector();
}
