/**
 * Spacing Scale Detector - LEARNING VERSION
 *
 * Learns spacing scale patterns from the user's codebase:
 * - Spacing scale type (4px, 8px, rem-based)
 * - Spacing method (Tailwind classes, CSS vars, theme object)
 * - Common spacing values used
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
 * Spacing scale types
 */
export type SpacingScaleType = '4px' | '8px' | 'rem' | 'custom';

/**
 * Spacing method types
 */
export type SpacingMethod = 'tailwind' | 'css-vars' | 'theme-object' | 'inline';

/**
 * Conventions this detector learns
 */
export interface SpacingScaleConventions {
  [key: string]: unknown;
  /** Spacing scale type */
  scaleType: SpacingScaleType;
  /** Primary spacing method */
  method: SpacingMethod;
  /** Common spacing values (in pixels) */
  commonValues: number[];
  /** Spacing unit preference */
  unitPreference: 'px' | 'rem' | 'em';
}

/**
 * Spacing pattern info extracted from code
 */
interface SpacingPatternInfo {
  method: SpacingMethod;
  value: number;
  unit: 'px' | 'rem' | 'em';
  rawValue: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract Tailwind spacing classes from content
 */
function extractTailwindSpacing(content: string, file: string): SpacingPatternInfo[] {
  const results: SpacingPatternInfo[] = [];
  const patterns = [
    /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-[xy]|space-[xy])-(\d+(?:\.\d+)?)\b/g,
  ];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      const tailwindValue = parseFloat(match[1] || '0');
      // Tailwind uses 0.25rem per unit, so value 4 = 1rem = 16px
      const pxValue = tailwindValue * 4;

      results.push({
        method: 'tailwind',
        value: pxValue,
        unit: 'rem',
        rawValue: match[0],
        line,
        column,
        file,
      });
    }
  }

  return results;
}

/**
 * Extract CSS spacing values from content
 */
function extractCSSSpacing(content: string, file: string): SpacingPatternInfo[] {
  const results: SpacingPatternInfo[] = [];
  const spacingProperties = ['margin', 'padding', 'gap', 'top', 'right', 'bottom', 'left'];
  const propertyPattern = new RegExp(
    `(?:${spacingProperties.join('|')})(?:-(?:top|right|bottom|left))?\\s*:\\s*(\\d+(?:\\.\\d+)?)(px|rem|em)`,
    'gi'
  );

  let match;
  while ((match = propertyPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const value = parseFloat(match[1] || '0');
    const unit = (match[2] || 'px').toLowerCase() as 'px' | 'rem' | 'em';
    const pxValue = unit === 'px' ? value : value * 16;

    // Skip 0 and 1px values
    if (pxValue <= 1) {continue;}

    results.push({
      method: 'inline',
      value: pxValue,
      unit,
      rawValue: `${value}${unit}`,
      line,
      column,
      file,
    });
  }

  return results;
}

/**
 * Extract CSS custom property spacing from content
 */
function extractCSSVarSpacing(content: string, file: string): SpacingPatternInfo[] {
  const results: SpacingPatternInfo[] = [];
  const pattern = /var\(\s*--(?:spacing|space|gap)[-_]?([a-zA-Z0-9_-]*)\s*\)/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      method: 'css-vars',
      value: 0, // Can't determine actual value from var reference
      unit: 'px',
      rawValue: match[0],
      line,
      column,
      file,
    });
  }

  return results;
}

/**
 * Determine scale type from values
 */
function determineScaleType(values: number[]): SpacingScaleType {
  if (values.length === 0) {return 'custom';}

  const on4pxScale = values.filter(v => v % 4 === 0).length;
  const on8pxScale = values.filter(v => v % 8 === 0).length;

  const ratio4px = on4pxScale / values.length;
  const ratio8px = on8pxScale / values.length;

  if (ratio8px > 0.8) {return '8px';}
  if (ratio4px > 0.8) {return '4px';}
  return 'custom';
}

/**
 * Find nearest value on scale
 */
function findNearestOnScale(value: number, scaleType: SpacingScaleType): number {
  const base = scaleType === '8px' ? 8 : 4;
  return Math.round(value / base) * base;
}

// ============================================================================
// Learning Spacing Scale Detector
// ============================================================================

export class SpacingScaleLearningDetector extends LearningDetector<SpacingScaleConventions> {
  readonly id = 'styling/spacing-scale';
  readonly category = 'styling' as const;
  readonly subcategory = 'spacing-scale';
  readonly name = 'Spacing Scale Detector (Learning)';
  readonly description = 'Learns spacing scale patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof SpacingScaleConventions> {
    return ['scaleType', 'method', 'commonValues', 'unitPreference'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpacingScaleConventions, ValueDistribution>
  ): void {
    const tailwindSpacing = extractTailwindSpacing(context.content, context.file);
    const cssSpacing = extractCSSSpacing(context.content, context.file);
    const cssVarSpacing = extractCSSVarSpacing(context.content, context.file);
    const allPatterns = [...tailwindSpacing, ...cssSpacing, ...cssVarSpacing];

    if (allPatterns.length === 0) {return;}

    const methodDist = distributions.get('method')!;
    const commonValuesDist = distributions.get('commonValues')!;
    const unitDist = distributions.get('unitPreference')!;

    for (const pattern of allPatterns) {
      methodDist.add(pattern.method, context.file);
      unitDist.add(pattern.unit, context.file);

      if (pattern.value > 0) {
        commonValuesDist.add(pattern.value, context.file);
      }
    }

    // Determine scale type from collected values
    const values = allPatterns.filter(p => p.value > 0).map(p => p.value);
    if (values.length > 0) {
      const scaleType = determineScaleType(values);
      const scaleTypeDist = distributions.get('scaleType')!;
      scaleTypeDist.add(scaleType, context.file);
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpacingScaleConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const tailwindSpacing = extractTailwindSpacing(context.content, context.file);
    const cssSpacing = extractCSSSpacing(context.content, context.file);
    const cssVarSpacing = extractCSSVarSpacing(context.content, context.file);
    const allPatterns = [...tailwindSpacing, ...cssSpacing, ...cssVarSpacing];

    if (allPatterns.length === 0) {
      return this.createEmptyResult();
    }

    // Get learned conventions
    const learnedScaleType = conventions.conventions.scaleType?.value;
    const learnedMethod = conventions.conventions.method?.value;
    const learnedUnit = conventions.conventions.unitPreference?.value;

    // Check method consistency
    if (learnedMethod) {
      for (const pattern of allPatterns) {
        if (pattern.method !== learnedMethod && pattern.method !== 'css-vars') {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'spacing method',
            pattern.method,
            learnedMethod,
            `Using ${pattern.method} spacing but project primarily uses ${learnedMethod}`
          ));
        }
      }
    }

    // Check scale adherence
    if (learnedScaleType && learnedScaleType !== 'custom') {
      for (const pattern of allPatterns) {
        if (pattern.value > 0 && pattern.method === 'inline') {
          const base = learnedScaleType === '8px' ? 8 : 4;
          if (pattern.value % base !== 0) {
            const nearest = findNearestOnScale(pattern.value, learnedScaleType);
            violations.push(this.createConventionViolation(
              pattern.file,
              pattern.line,
              pattern.column,
              'spacing scale',
              `${pattern.value}px`,
              `${nearest}px`,
              `Value ${pattern.value}px is not on the ${learnedScaleType} scale. Nearest: ${nearest}px`
            ));
          }
        }
      }
    }

    // Check unit consistency
    if (learnedUnit) {
      for (const pattern of allPatterns) {
        if (pattern.method === 'inline' && pattern.unit !== learnedUnit) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'spacing unit',
            pattern.unit,
            learnedUnit,
            `Using ${pattern.unit} but project prefers ${learnedUnit}`
          ));
        }
      }
    }

    // Create pattern matches
    if (allPatterns.length > 0) {
      const firstPattern = allPatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/spacing`,
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

  override generateQuickFix(violation: Violation): QuickFix | null {
    if (!violation.expected || violation.expected === violation.actual) {
      return null;
    }

    return {
      title: `Change to '${violation.expected}'`,
      kind: 'quickfix',
      edit: {
        changes: {
          [violation.file]: [
            {
              range: violation.range,
              newText: violation.expected,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.8,
      preview: `Replace '${violation.actual}' with '${violation.expected}'`,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createSpacingScaleLearningDetector(): SpacingScaleLearningDetector {
  return new SpacingScaleLearningDetector();
}
