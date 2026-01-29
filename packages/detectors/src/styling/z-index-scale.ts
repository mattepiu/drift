/**
 * Z-Index Scale Detector - Z-index pattern consistency detection
 *
 * Detects z-index patterns including:
 * - Standard z-index scale values (0, 10, 20, 30, 40, 50, auto)
 * - Tailwind z-index classes (z-0, z-10, z-20, z-30, z-40, z-50, z-auto)
 * - CSS z-index properties
 * - Theme z-index usage
 * - Arbitrary z-index values that don't follow a scale
 * - Magic number z-index values (e.g., z-index: 9999, z-index: 999999)
 *
 * Flags inconsistent z-index usage:
 * - Hardcoded arbitrary z-index values not on a standard scale
 * - Magic number z-index values (very high values like 9999)
 * - Tailwind arbitrary z-index values (z-[100])
 *
 * @requirements 9.7 - THE Styling_Detector SHALL detect z-index scale adherence
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of z-index patterns detected
 */
export type ZIndexPatternType =
  | 'tailwind-z-index'         // Tailwind z-index classes (z-0, z-10, z-20, etc.)
  | 'css-z-index-property'     // CSS custom property for z-index (--z-index-*)
  | 'theme-z-index'            // Theme object z-index (theme.zIndex.*)
  | 'css-z-index-value'        // Standard CSS z-index property
  | 'z-index-scale-10';        // 10-based scale (0, 10, 20, 30, 40, 50)

/**
 * Types of arbitrary z-index values detected
 */
export type ArbitraryZIndexType =
  | 'arbitrary-value'          // Arbitrary z-index value not on scale
  | 'magic-number'             // Magic number z-index (9999, 999999, etc.)
  | 'tailwind-arbitrary'       // Tailwind arbitrary value (z-[100])
  | 'negative-arbitrary';      // Arbitrary negative z-index value

/**
 * Information about a detected z-index pattern
 */
export interface ZIndexPatternInfo {
  /** Type of z-index pattern */
  type: ZIndexPatternType;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Z-index value or class name */
  zIndexValue?: string;
  /** Additional context */
  context?: string;
}


/**
 * Information about a detected arbitrary z-index value
 */
export interface ArbitraryZIndexInfo {
  /** Type of arbitrary z-index */
  type: ArbitraryZIndexType;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** End line number (1-indexed) */
  endLine: number;
  /** End column number (1-indexed) */
  endColumn: number;
  /** The arbitrary value */
  value: string;
  /** Numeric value (if applicable) */
  numericValue?: number;
  /** Suggested scale value */
  suggestedValue?: string;
  /** The full line content */
  lineContent: string;
}

/**
 * Analysis of z-index patterns in a file
 */
export interface ZIndexScaleAnalysis {
  /** Z-index patterns found */
  zIndexPatterns: ZIndexPatternInfo[];
  /** Arbitrary z-index values found */
  arbitraryValues: ArbitraryZIndexInfo[];
  /** Whether file uses Tailwind z-index classes */
  usesTailwindZIndex: boolean;
  /** Whether file uses CSS custom properties for z-index */
  usesCSSZIndexProperties: boolean;
  /** Whether file uses theme z-index object */
  usesThemeZIndex: boolean;
  /** Whether file uses standard CSS z-index */
  usesCSSZIndex: boolean;
  /** Confidence score for z-index scale adherence */
  scaleAdherenceConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Standard z-index scale values (Tailwind-like 10-based scale)
 */
export const Z_INDEX_SCALE = [0, 10, 20, 30, 40, 50] as const;

/**
 * Extended z-index scale values (common additional values)
 */
export const Z_INDEX_SCALE_EXTENDED = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

/**
 * Common semantic z-index values
 */
export const SEMANTIC_Z_INDEX_VALUES = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modalBackdrop: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
} as const;

/**
 * Magic number threshold - values above this are considered magic numbers
 */
export const MAGIC_NUMBER_THRESHOLD = 100;

/**
 * Very high magic number threshold - values above this are definitely problematic
 */
export const HIGH_MAGIC_NUMBER_THRESHOLD = 999;

/**
 * Tailwind z-index class patterns
 * Matches: z-0, z-10, z-20, z-30, z-40, z-50, z-auto
 */
export const TAILWIND_Z_INDEX_PATTERN = /\bz-(\d+|auto)\b/g;

/**
 * Tailwind arbitrary z-index value patterns (e.g., z-[100], z-[9999])
 */
export const TAILWIND_ARBITRARY_Z_INDEX_PATTERN = /\bz-\[(-?\d+)\]/g;

/**
 * CSS custom property patterns for z-index
 */
export const CSS_Z_INDEX_PROPERTY_PATTERN = /var\(\s*--(?:z-index|zindex|z)[-_]?([a-zA-Z0-9_-]*)\s*(?:,\s*[^)]+)?\)/g;

/**
 * Theme z-index object patterns
 */
export const THEME_Z_INDEX_PATTERNS = [
  // theme.zIndex.*, theme.z.*
  /theme\.(?:zIndex|z)\.([a-zA-Z0-9_.[\]]+)/g,
  // ${theme.zIndex.*} in template literals
  /\$\{theme\.(?:zIndex|z)\.([a-zA-Z0-9_.[\]]+)\}/g,
  // props.theme.zIndex.*
  /props\.theme\.(?:zIndex|z)\.([a-zA-Z0-9_.[\]]+)/g,
] as const;

/**
 * CSS z-index property pattern
 * Matches: z-index: 10, zIndex: 10
 */
export const CSS_Z_INDEX_VALUE_PATTERN = /(?:z-index|zIndex)\s*:\s*(-?\d+|auto|inherit|initial|unset|revert)/gi;

/**
 * Hardcoded z-index value pattern (in CSS or JS)
 */
export const HARDCODED_Z_INDEX_PATTERN = /(?:z-index|zIndex)\s*:\s*(-?\d+)\b/gi;

/**
 * Allowed z-index values (common exceptions)
 */
export const ALLOWED_Z_INDEX_VALUES = new Set([
  'auto',
  'inherit',
  'initial',
  'unset',
  'revert',
  '-1',
  '0',
  '1',
]);

/**
 * File patterns to exclude from arbitrary z-index detection
 */
export const EXCLUDED_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
  /design-tokens?\//,
  /tokens?\//,
  /theme\//,
  /\.config\.[jt]s$/,
  /tailwind\.config/,
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file should be excluded from arbitrary z-index detection
 */
export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if a value is in the allowed z-index values list
 */
export function isAllowedZIndexValue(value: string): boolean {
  return ALLOWED_Z_INDEX_VALUES.has(value.toLowerCase().trim());
}

/**
 * Check if a z-index value is on the standard scale
 */
export function isOnZIndexScale(value: number): boolean {
  return Z_INDEX_SCALE.includes(value as typeof Z_INDEX_SCALE[number]);
}

/**
 * Check if a z-index value is on the extended scale
 */
export function isOnExtendedZIndexScale(value: number): boolean {
  return Z_INDEX_SCALE_EXTENDED.includes(value as typeof Z_INDEX_SCALE_EXTENDED[number]);
}

/**
 * Check if a z-index value is a magic number
 */
export function isMagicNumber(value: number): boolean {
  const absValue = Math.abs(value);
  return absValue > MAGIC_NUMBER_THRESHOLD && !isOnExtendedZIndexScale(absValue);
}

/**
 * Check if a z-index value is a very high magic number
 */
export function isHighMagicNumber(value: number): boolean {
  return Math.abs(value) > HIGH_MAGIC_NUMBER_THRESHOLD;
}

/**
 * Find the nearest value on the z-index scale
 */
export function findNearestZIndexValue(value: number): number {
  const absValue = Math.abs(value);
  let nearest: number = Z_INDEX_SCALE[0];
  let minDiff = Math.abs(absValue - nearest);

  for (const scaleValue of Z_INDEX_SCALE) {
    const diff = Math.abs(absValue - scaleValue);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = scaleValue;
    }
  }

  // Handle the case where nearest is 0 - always return positive 0
  if (nearest === 0) {
    return 0;
  }

  return value < 0 ? -nearest : nearest;
}

/**
 * Suggest a z-index scale value for an arbitrary value
 */
export function suggestZIndexValue(value: number): string {
  if (isHighMagicNumber(value)) {
    return `Use a semantic z-index value (e.g., z-50 for modals) instead of ${value}`;
  }

  const nearest = findNearestZIndexValue(value);
  
  if (value < 0) {
    return `Use z-index: -1 or a CSS custom property like var(--z-index-below)`;
  }

  if (nearest === 0) {
    return `Use z-0 or z-index: 0`;
  }

  return `Use z-${nearest} or z-index: ${nearest}`;
}

/**
 * Check if a position is inside a comment
 */
function isInsideComment(content: string, index: number): boolean {
  const beforeIndex = content.slice(0, index);

  // Check for single-line comment
  const lastNewline = beforeIndex.lastIndexOf('\n');
  const currentLine = beforeIndex.slice(lastNewline + 1);
  if (currentLine.includes('//')) {
    const commentStart = currentLine.indexOf('//');
    const positionInLine = index - lastNewline - 1;
    if (positionInLine > commentStart) {
      return true;
    }
  }

  // Check for multi-line comment
  const lastBlockCommentStart = beforeIndex.lastIndexOf('/*');
  const lastBlockCommentEnd = beforeIndex.lastIndexOf('*/');
  if (lastBlockCommentStart > lastBlockCommentEnd) {
    return true;
  }

  return false;
}


/**
 * Detect Tailwind z-index classes in content
 */
export function detectTailwindZIndex(content: string, file: string): ZIndexPatternInfo[] {
  const results: ZIndexPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(TAILWIND_Z_INDEX_PATTERN.source, TAILWIND_Z_INDEX_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Skip if inside a comment
    if (isInsideComment(content, match.index)) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'tailwind-z-index',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      zIndexValue: match[1] || match[0],
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect Tailwind arbitrary z-index values
 */
export function detectTailwindArbitraryZIndex(content: string, file: string): ArbitraryZIndexInfo[] {
  const results: ArbitraryZIndexInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(TAILWIND_ARBITRARY_Z_INDEX_PATTERN.source, TAILWIND_ARBITRARY_Z_INDEX_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const value = match[1] || '';
    const numericValue = parseInt(value, 10);

    // Skip if inside a comment
    if (isInsideComment(content, match.index)) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const endColumn = column + match[0].length;

    const type: ArbitraryZIndexType = isHighMagicNumber(numericValue)
      ? 'magic-number'
      : numericValue < 0
        ? 'negative-arbitrary'
        : 'tailwind-arbitrary';

    results.push({
      type,
      file,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      value: match[0],
      numericValue,
      suggestedValue: suggestZIndexValue(numericValue),
      lineContent: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect CSS custom property usage for z-index
 */
export function detectCSSZIndexProperties(content: string, file: string): ZIndexPatternInfo[] {
  const results: ZIndexPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(CSS_Z_INDEX_PROPERTY_PATTERN.source, CSS_Z_INDEX_PROPERTY_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Skip if inside a comment
    if (isInsideComment(content, match.index)) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'css-z-index-property',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      zIndexValue: match[1] || '',
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect theme z-index object usage
 */
export function detectThemeZIndex(content: string, file: string): ZIndexPatternInfo[] {
  const results: ZIndexPatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of THEME_Z_INDEX_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Skip if inside a comment
      if (isInsideComment(content, match.index)) {
        continue;
      }

      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'theme-z-index',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        zIndexValue: match[1] || match[0],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Detect CSS z-index values (both valid and arbitrary)
 */
export function detectCSSZIndexValues(content: string, file: string): {
  patterns: ZIndexPatternInfo[];
  arbitrary: ArbitraryZIndexInfo[];
} {
  const patterns: ZIndexPatternInfo[] = [];
  const arbitrary: ArbitraryZIndexInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(HARDCODED_Z_INDEX_PATTERN.source, HARDCODED_Z_INDEX_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const value = match[1] || '';
    
    // Skip allowed values
    if (isAllowedZIndexValue(value)) {
      continue;
    }

    // Skip if inside a comment
    if (isInsideComment(content, match.index)) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const lineContent = lines[lineNumber - 1] || '';

    // Skip CSS custom property definitions
    if (/^\s*--[a-zA-Z0-9_-]+\s*:/.test(lineContent)) {
      continue;
    }

    const numericValue = parseInt(value, 10);

    // Check if value is on scale
    if (isOnExtendedZIndexScale(numericValue)) {
      patterns.push({
        type: 'css-z-index-value',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        zIndexValue: value,
        context: lineContent,
      });
    } else {
      // Arbitrary value
      const endColumn = column + match[0].length;
      const type: ArbitraryZIndexType = isHighMagicNumber(numericValue)
        ? 'magic-number'
        : numericValue < 0
          ? 'negative-arbitrary'
          : 'arbitrary-value';

      arbitrary.push({
        type,
        file,
        line: lineNumber,
        column,
        endLine: lineNumber,
        endColumn,
        value: match[0],
        numericValue,
        suggestedValue: suggestZIndexValue(numericValue),
        lineContent,
      });
    }
  }

  return { patterns, arbitrary };
}


/**
 * Analyze z-index scale patterns in a file
 */
export function analyzeZIndexScale(content: string, file: string): ZIndexScaleAnalysis {
  // Skip excluded files for arbitrary value detection
  const skipArbitraryDetection = shouldExcludeFile(file);

  // Detect z-index patterns
  const tailwindZIndex = detectTailwindZIndex(content, file);
  const cssZIndexProperties = detectCSSZIndexProperties(content, file);
  const themeZIndex = detectThemeZIndex(content, file);
  const cssZIndexResult = detectCSSZIndexValues(content, file);

  const zIndexPatterns = [
    ...tailwindZIndex,
    ...cssZIndexProperties,
    ...themeZIndex,
    ...cssZIndexResult.patterns,
  ];

  // Detect arbitrary values (unless file is excluded)
  let arbitraryValues: ArbitraryZIndexInfo[] = [];
  if (!skipArbitraryDetection) {
    const tailwindArbitrary = detectTailwindArbitraryZIndex(content, file);
    arbitraryValues = [...tailwindArbitrary, ...cssZIndexResult.arbitrary];
  }

  // Calculate confidence
  const hasZIndexPatterns = zIndexPatterns.length > 0;
  const hasArbitraryValues = arbitraryValues.length > 0;

  let scaleAdherenceConfidence = 0;
  if (hasZIndexPatterns && !hasArbitraryValues) {
    scaleAdherenceConfidence = 1.0;
  } else if (hasZIndexPatterns && hasArbitraryValues) {
    const ratio = zIndexPatterns.length / (zIndexPatterns.length + arbitraryValues.length);
    scaleAdherenceConfidence = ratio;
  } else if (!hasZIndexPatterns && hasArbitraryValues) {
    scaleAdherenceConfidence = 0;
  } else {
    scaleAdherenceConfidence = 0.5; // No z-index detected
  }

  return {
    zIndexPatterns,
    arbitraryValues,
    usesTailwindZIndex: tailwindZIndex.length > 0,
    usesCSSZIndexProperties: cssZIndexProperties.length > 0,
    usesThemeZIndex: themeZIndex.length > 0,
    usesCSSZIndex: cssZIndexResult.patterns.length > 0,
    scaleAdherenceConfidence,
  };
}

// ============================================================================
// Z-Index Scale Detector Class
// ============================================================================

/**
 * Detector for z-index scale adherence patterns
 *
 * Identifies consistent z-index patterns and flags arbitrary values
 * that don't follow the established scale.
 *
 * @requirements 9.7 - THE Styling_Detector SHALL detect z-index scale adherence
 */
export class ZIndexScaleDetector extends RegexDetector {
  readonly id = 'styling/z-index-scale';
  readonly category = 'styling' as const;
  readonly subcategory = 'z-index-scale';
  readonly name = 'Z-Index Scale Detector';
  readonly description = 'Detects z-index scale adherence and flags arbitrary z-index values and magic numbers';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  /**
   * Detect z-index scale patterns and violations
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Analyze the file
    const analysis = analyzeZIndexScale(context.content, context.file);

    // Create pattern matches for z-index patterns
    if (analysis.usesTailwindZIndex) {
      patterns.push(this.createTailwindZIndexPattern(context.file, analysis));
    }

    if (analysis.usesCSSZIndexProperties) {
      patterns.push(this.createCSSZIndexPropertyPattern(context.file, analysis));
    }

    if (analysis.usesThemeZIndex) {
      patterns.push(this.createThemeZIndexPattern(context.file, analysis));
    }

    if (analysis.usesCSSZIndex) {
      patterns.push(this.createCSSZIndexPattern(context.file, analysis));
    }

    // Create violations for arbitrary values
    for (const arbitrary of analysis.arbitraryValues) {
      violations.push(this.createArbitraryValueViolation(arbitrary));
    }

    return this.createResult(patterns, violations, analysis.scaleAdherenceConfidence);
  }

  /**
   * Create a pattern match for Tailwind z-index usage
   */
  private createTailwindZIndexPattern(
    file: string,
    analysis: ZIndexScaleAnalysis
  ): PatternMatch {
    const tailwindPatterns = analysis.zIndexPatterns.filter(
      p => p.type === 'tailwind-z-index'
    );
    const firstPattern = tailwindPatterns[0];

    return {
      patternId: `${this.id}/tailwind`,
      location: {
        file,
        line: firstPattern?.line || 1,
        column: firstPattern?.column || 1,
      },
      confidence: 1.0,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for CSS z-index property usage
   */
  private createCSSZIndexPropertyPattern(
    file: string,
    analysis: ZIndexScaleAnalysis
  ): PatternMatch {
    const cssPatterns = analysis.zIndexPatterns.filter(
      p => p.type === 'css-z-index-property'
    );
    const firstPattern = cssPatterns[0];

    return {
      patternId: `${this.id}/css-property`,
      location: {
        file,
        line: firstPattern?.line || 1,
        column: firstPattern?.column || 1,
      },
      confidence: 1.0,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for theme z-index usage
   */
  private createThemeZIndexPattern(
    file: string,
    analysis: ZIndexScaleAnalysis
  ): PatternMatch {
    const themePatterns = analysis.zIndexPatterns.filter(
      p => p.type === 'theme-z-index'
    );
    const firstPattern = themePatterns[0];

    return {
      patternId: `${this.id}/theme`,
      location: {
        file,
        line: firstPattern?.line || 1,
        column: firstPattern?.column || 1,
      },
      confidence: 1.0,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for CSS z-index value usage
   */
  private createCSSZIndexPattern(
    file: string,
    analysis: ZIndexScaleAnalysis
  ): PatternMatch {
    const cssPatterns = analysis.zIndexPatterns.filter(
      p => p.type === 'css-z-index-value'
    );
    const firstPattern = cssPatterns[0];

    return {
      patternId: `${this.id}/css-value`,
      location: {
        file,
        line: firstPattern?.line || 1,
        column: firstPattern?.column || 1,
      },
      confidence: 1.0,
      isOutlier: false,
    };
  }


  /**
   * Create a violation for an arbitrary z-index value
   */
  private createArbitraryValueViolation(arbitrary: ArbitraryZIndexInfo): Violation {
    const typeDescriptions: Record<ArbitraryZIndexType, string> = {
      'arbitrary-value': 'arbitrary z-index value',
      'magic-number': 'magic number z-index',
      'tailwind-arbitrary': 'Tailwind arbitrary z-index',
      'negative-arbitrary': 'arbitrary negative z-index',
    };

    const typeDescription = typeDescriptions[arbitrary.type] || 'arbitrary z-index';
    const severity = arbitrary.type === 'magic-number' ? 'error' : 'warning';

    const violation: Violation = {
      id: `${this.id}-${arbitrary.file}-${arbitrary.line}-${arbitrary.column}`,
      patternId: this.id,
      severity,
      file: arbitrary.file,
      range: {
        start: { line: arbitrary.line - 1, character: arbitrary.column - 1 },
        end: { line: arbitrary.endLine - 1, character: arbitrary.endColumn - 1 },
      },
      message: `${typeDescription.charAt(0).toUpperCase() + typeDescription.slice(1)} '${arbitrary.value}' doesn't follow the z-index scale`,
      explanation: this.getExplanation(arbitrary),
      expected: arbitrary.suggestedValue || 'A z-index scale value (0, 10, 20, 30, 40, 50)',
      actual: arbitrary.value,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };

    const quickFix = this.createQuickFixForArbitraryValue(arbitrary);
    if (quickFix !== undefined) {
      violation.quickFix = quickFix;
    }

    return violation;
  }

  /**
   * Get explanation for a z-index violation
   */
  private getExplanation(arbitrary: ArbitraryZIndexInfo): string {
    if (arbitrary.type === 'magic-number') {
      return `Using magic number z-index values like ${arbitrary.numericValue} creates maintenance problems and z-index wars. Use a semantic z-index scale (0, 10, 20, 30, 40, 50) or CSS custom properties to maintain consistent stacking contexts.`;
    }

    if (arbitrary.type === 'negative-arbitrary') {
      return `Arbitrary negative z-index values can cause unexpected stacking behavior. Use z-index: -1 for elements that should appear behind their parent, or use CSS custom properties for consistent negative z-index values.`;
    }

    if (arbitrary.type === 'tailwind-arbitrary') {
      return `Using Tailwind arbitrary z-index values (z-[${arbitrary.numericValue}]) bypasses the design system. Use standard Tailwind z-index classes (z-0, z-10, z-20, z-30, z-40, z-50, z-auto) for consistent stacking.`;
    }

    return `Using arbitrary z-index values instead of scale-based values makes it difficult to maintain consistent stacking contexts across the application. Use values from your z-index scale (0, 10, 20, 30, 40, 50) or CSS custom properties.`;
  }

  /**
   * Create a quick fix for replacing an arbitrary value with a scale value
   */
  private createQuickFixForArbitraryValue(arbitrary: ArbitraryZIndexInfo): QuickFix | undefined {
    // Only provide quick fix if we have a numeric value
    if (arbitrary.numericValue === undefined) {
      return undefined;
    }

    const nearest = findNearestZIndexValue(arbitrary.numericValue);
    let replacement: string;

    if (arbitrary.type === 'tailwind-arbitrary') {
      // For Tailwind arbitrary values, suggest the standard class
      replacement = nearest === 0 ? 'z-0' : `z-${nearest}`;
    } else {
      // For CSS values, use the nearest scale value
      replacement = `z-index: ${nearest}`;
    }

    return {
      title: `Replace with scale value: ${replacement}`,
      kind: 'quickfix',
      edit: {
        changes: {
          [arbitrary.file]: [
            {
              range: {
                start: { line: arbitrary.line - 1, character: arbitrary.column - 1 },
                end: { line: arbitrary.endLine - 1, character: arbitrary.endColumn - 1 },
              },
              newText: replacement,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Replace '${arbitrary.value}' with '${replacement}'`,
    };
  }

  /**
   * Generate a quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Check if this is a z-index violation
    if (!violation.message.includes('z-index')) {
      return null;
    }

    // Extract the value from the message
    const valueMatch = violation.message.match(/['"]([^'"]+)['"]/);
    if (!valueMatch?.[1]) {
      return null;
    }

    const value = valueMatch[1];
    
    // Try to extract numeric value
    const numMatch = value.match(/-?\d+/);
    if (!numMatch) {
      return null;
    }

    const numericValue = parseInt(numMatch[0], 10);
    const nearest = findNearestZIndexValue(numericValue);

    // Determine replacement based on context
    let replacement: string;
    if (value.startsWith('z-[')) {
      replacement = nearest === 0 ? 'z-0' : `z-${nearest}`;
    } else {
      replacement = `z-index: ${nearest}`;
    }

    return {
      title: `Replace with scale value: ${replacement}`,
      kind: 'quickfix',
      edit: {
        changes: {
          [violation.file]: [
            {
              range: violation.range,
              newText: replacement,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Replace '${value}' with '${replacement}'`,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ZIndexScaleDetector instance
 */
export function createZIndexScaleDetector(): ZIndexScaleDetector {
  return new ZIndexScaleDetector();
}
