/**
 * Spacing Scale Detector - Spacing consistency detection
 *
 * Detects spacing scale patterns including:
 * - Consistent spacing values (4px increments, rem-based scales, etc.)
 * - Tailwind spacing classes (p-4, m-2, gap-8, etc.)
 * - CSS custom properties for spacing (--spacing-*)
 *
 * Flags arbitrary spacing values:
 * - Values that don't fit the detected scale (e.g., 13px, 17px)
 * - Inconsistent units (mixing px and rem)
 *
 * @requirements 9.2 - THE Styling_Detector SHALL detect spacing scale adherence (p-4 vs arbitrary values)
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of spacing patterns detected
 */
export type SpacingPatternType =
  | 'tailwind-spacing'         // Tailwind spacing classes (p-4, m-2, gap-8)
  | 'css-spacing-property'     // CSS custom property for spacing (--spacing-*)
  | 'theme-spacing'            // Theme object spacing (theme.spacing.*)
  | 'spacing-scale-4px'        // 4px-based scale (4, 8, 12, 16, 20, 24, etc.)
  | 'spacing-scale-8px';       // 8px-based scale (8, 16, 24, 32, etc.)

/**
 * Types of arbitrary spacing values detected
 */
export type ArbitrarySpacingType =
  | 'arbitrary-px'             // Arbitrary pixel value (13px, 17px, etc.)
  | 'arbitrary-rem'            // Arbitrary rem value (0.7rem, 1.3rem, etc.)
  | 'arbitrary-em'             // Arbitrary em value
  | 'tailwind-arbitrary'       // Tailwind arbitrary value (p-[13px])
  | 'mixed-units';             // Mixed spacing units in same context

/**
 * Information about a detected spacing pattern
 */
export interface SpacingPatternInfo {
  /** Type of spacing pattern */
  type: SpacingPatternType;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Spacing value or class name */
  spacingValue?: string;
  /** Additional context */
  context?: string;
}


/**
 * Information about a detected arbitrary spacing value
 */
export interface ArbitrarySpacingInfo {
  /** Type of arbitrary spacing */
  type: ArbitrarySpacingType;
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
  /** CSS property name (if applicable) */
  property?: string;
  /** Suggested scale value */
  suggestedValue?: string;
  /** The full line content */
  lineContent: string;
}

/**
 * Analysis of spacing patterns in a file
 */
export interface SpacingScaleAnalysis {
  /** Spacing patterns found */
  spacingPatterns: SpacingPatternInfo[];
  /** Arbitrary spacing values found */
  arbitraryValues: ArbitrarySpacingInfo[];
  /** Whether file uses Tailwind spacing classes */
  usesTailwindSpacing: boolean;
  /** Whether file uses CSS custom properties for spacing */
  usesCSSSpacingProperties: boolean;
  /** Whether file uses theme spacing object */
  usesThemeSpacing: boolean;
  /** Detected spacing scale (4px, 8px, or null if mixed) */
  detectedScale: '4px' | '8px' | 'rem' | null;
  /** Confidence score for spacing scale adherence */
  scaleAdherenceConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Standard 4px-based spacing scale values
 */
export const SPACING_SCALE_4PX = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96] as const;

/**
 * Standard 8px-based spacing scale values
 */
export const SPACING_SCALE_8PX = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 96, 112, 128] as const;

/**
 * Standard rem-based spacing scale values (Tailwind-like)
 */
export const SPACING_SCALE_REM = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16] as const;


/**
 * Tailwind spacing class patterns
 */
export const TAILWIND_SPACING_PATTERNS = [
  // Padding classes: p-4, px-2, py-8, pt-4, pr-2, pb-6, pl-3
  /\b(?:p|px|py|pt|pr|pb|pl)-(\d+(?:\.\d+)?)\b/g,
  // Margin classes: m-4, mx-2, my-8, mt-4, mr-2, mb-6, ml-3
  /\b(?:m|mx|my|mt|mr|mb|ml)-(\d+(?:\.\d+)?)\b/g,
  // Gap classes: gap-4, gap-x-2, gap-y-8
  /\bgap(?:-[xy])?-(\d+(?:\.\d+)?)\b/g,
  // Space classes: space-x-4, space-y-2
  /\bspace-[xy]-(\d+(?:\.\d+)?)\b/g,
  // Width/height spacing: w-4, h-8, size-4
  /\b(?:w|h|size)-(\d+(?:\.\d+)?)\b/g,
  // Inset classes: inset-4, inset-x-2, top-4, right-2, bottom-6, left-3
  /\b(?:inset|inset-[xy]|top|right|bottom|left)-(\d+(?:\.\d+)?)\b/g,
] as const;

/**
 * Tailwind arbitrary spacing value patterns (e.g., p-[13px], m-[1.5rem])
 */
export const TAILWIND_ARBITRARY_SPACING_PATTERN = /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-[xy]|space-[xy]|w|h|size|inset|inset-[xy]|top|right|bottom|left)-\[([^\]]+)\]/g;

/**
 * CSS custom property patterns for spacing
 */
export const CSS_SPACING_PROPERTY_PATTERN = /var\(\s*--(?:spacing|space|gap|margin|padding)[-_]?([a-zA-Z0-9_-]*)\s*(?:,\s*[^)]+)?\)/g;

/**
 * Theme spacing object patterns
 */
export const THEME_SPACING_PATTERNS = [
  // theme.spacing.*, theme.space.*
  /theme\.(?:spacing|space)\.([a-zA-Z0-9_.[\]]+)/g,
  // ${theme.spacing.*} in template literals
  /\$\{theme\.(?:spacing|space)\.([a-zA-Z0-9_.[\]]+)\}/g,
  // props.theme.spacing.*
  /props\.theme\.(?:spacing|space)\.([a-zA-Z0-9_.[\]]+)/g,
] as const;

/**
 * Hardcoded spacing value patterns
 */
export const HARDCODED_SPACING_PATTERNS = {
  // Pixel values: 10px, 20px (excluding 0px and 1px)
  px: /(?<![a-zA-Z0-9_-])(\d+)px\b/g,
  // Rem values: 1rem, 2rem
  rem: /(?<![a-zA-Z0-9_-])(\d+(?:\.\d+)?)rem\b/g,
  // Em values: 1em, 2em
  em: /(?<![a-zA-Z0-9_-])(\d+(?:\.\d+)?)em\b/g,
} as const;


/**
 * CSS properties that commonly use spacing values
 */
export const SPACING_PROPERTIES = [
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'gap',
  'row-gap',
  'column-gap',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
] as const;

/**
 * Allowed spacing values (common exceptions)
 */
export const ALLOWED_SPACING_VALUES = new Set([
  '0',
  '0px',
  '1px',
  '100%',
  'auto',
  'inherit',
  'initial',
  'unset',
  'none',
]);

/**
 * File patterns to exclude from arbitrary spacing detection
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
 * Check if a file should be excluded from arbitrary spacing detection
 */
export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if a value is in the allowed spacing values list
 */
export function isAllowedSpacingValue(value: string): boolean {
  return ALLOWED_SPACING_VALUES.has(value.toLowerCase().trim());
}


/**
 * Check if a pixel value is on the 4px scale
 */
export function isOn4pxScale(value: number): boolean {
  return SPACING_SCALE_4PX.includes(value as typeof SPACING_SCALE_4PX[number]);
}

/**
 * Check if a pixel value is on the 8px scale
 */
export function isOn8pxScale(value: number): boolean {
  return SPACING_SCALE_8PX.includes(value as typeof SPACING_SCALE_8PX[number]);
}

/**
 * Check if a rem value is on the standard rem scale
 */
export function isOnRemScale(value: number): boolean {
  return SPACING_SCALE_REM.includes(value as typeof SPACING_SCALE_REM[number]);
}

/**
 * Find the nearest value on the 4px scale
 */
export function findNearest4pxValue(value: number): number {
  let nearest: number = SPACING_SCALE_4PX[0];
  let minDiff = Math.abs(value - nearest);

  for (const scaleValue of SPACING_SCALE_4PX) {
    const diff = Math.abs(value - scaleValue);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = scaleValue;
    }
  }

  return nearest;
}

/**
 * Find the nearest value on the 8px scale
 */
export function findNearest8pxValue(value: number): number {
  let nearest: number = SPACING_SCALE_8PX[0];
  let minDiff = Math.abs(value - nearest);

  for (const scaleValue of SPACING_SCALE_8PX) {
    const diff = Math.abs(value - scaleValue);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = scaleValue;
    }
  }

  return nearest;
}

/**
 * Find the nearest value on the rem scale
 */
export function findNearestRemValue(value: number): number {
  let nearest: number = SPACING_SCALE_REM[0];
  let minDiff = Math.abs(value - nearest);

  for (const scaleValue of SPACING_SCALE_REM) {
    const diff = Math.abs(value - scaleValue);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = scaleValue;
    }
  }

  return nearest;
}


/**
 * Detect Tailwind spacing classes in content
 */
export function detectTailwindSpacing(content: string, file: string): SpacingPatternInfo[] {
  const results: SpacingPatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of TAILWIND_SPACING_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'tailwind-spacing',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        spacingValue: match[1] || match[0],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Detect Tailwind arbitrary spacing values
 */
export function detectTailwindArbitrarySpacing(content: string, file: string): ArbitrarySpacingInfo[] {
  const results: ArbitrarySpacingInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(TAILWIND_ARBITRARY_SPACING_PATTERN.source, TAILWIND_ARBITRARY_SPACING_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const value = match[1] || '';
    
    // Skip allowed values
    if (isAllowedSpacingValue(value)) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const endColumn = column + match[0].length;

    results.push({
      type: 'tailwind-arbitrary',
      file,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      value: match[0],
      suggestedValue: suggestTailwindSpacingClass(value),
      lineContent: lines[lineNumber - 1] || '',
    });
  }

  return results;
}


/**
 * Detect CSS custom property usage for spacing
 */
export function detectCSSSpacingProperties(content: string, file: string): SpacingPatternInfo[] {
  const results: SpacingPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(CSS_SPACING_PROPERTY_PATTERN.source, CSS_SPACING_PROPERTY_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'css-spacing-property',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      spacingValue: match[1] || '',
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect theme spacing object usage
 */
export function detectThemeSpacing(content: string, file: string): SpacingPatternInfo[] {
  const results: SpacingPatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of THEME_SPACING_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'theme-spacing',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        spacingValue: match[1] || match[0],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
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
 * Extract CSS property name from a line
 */
function extractCSSProperty(line: string): string | undefined {
  // Match CSS property: property-name: value
  const cssMatch = line.match(/([a-zA-Z-]+)\s*:/);
  if (cssMatch?.[1]) {
    return cssMatch[1];
  }

  // Match JS object property: propertyName: value
  const jsMatch = line.match(/([a-zA-Z]+)\s*:/);
  if (jsMatch?.[1]) {
    // Convert camelCase to kebab-case
    return jsMatch[1].replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  return undefined;
}

/**
 * Detect arbitrary pixel spacing values
 */
export function detectArbitraryPxSpacing(content: string, file: string): ArbitrarySpacingInfo[] {
  const results: ArbitrarySpacingInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(HARDCODED_SPACING_PATTERNS.px.source, HARDCODED_SPACING_PATTERNS.px.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const numValue = parseInt(match[1] || '0', 10);
    const value = `${numValue}px`;

    // Skip allowed values (0px, 1px)
    if (isAllowedSpacingValue(value) || numValue <= 1) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lineContent = lines[lineNumber - 1] || '';

    // Skip CSS custom property definitions
    if (/^\s*--[a-zA-Z0-9_-]+\s*:/.test(lineContent)) {
      continue;
    }

    // Skip if inside a comment
    if (isInsideComment(content, match.index)) {
      continue;
    }

    // Skip if it's part of a media query breakpoint
    if (/@media.*\(.*\d+px/.test(lineContent)) {
      continue;
    }

    // Check if value is on a standard scale
    const isOnScale = isOn4pxScale(numValue) || isOn8pxScale(numValue);
    if (isOnScale) {
      continue; // Value is on scale, not arbitrary
    }

    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const endColumn = column + value.length;

    const property = extractCSSProperty(lineContent);
    const arbitraryInfo: ArbitrarySpacingInfo = {
      type: 'arbitrary-px',
      file,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      value,
      suggestedValue: suggestPxSpacingValue(numValue),
      lineContent,
    };
    if (property !== undefined) {
      arbitraryInfo.property = property;
    }
    results.push(arbitraryInfo);
  }

  return results;
}


/**
 * Detect arbitrary rem spacing values
 */
export function detectArbitraryRemSpacing(content: string, file: string): ArbitrarySpacingInfo[] {
  const results: ArbitrarySpacingInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(HARDCODED_SPACING_PATTERNS.rem.source, HARDCODED_SPACING_PATTERNS.rem.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const numValue = parseFloat(match[1] || '0');
    const value = `${numValue}rem`;

    // Skip allowed values
    if (isAllowedSpacingValue(value)) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lineContent = lines[lineNumber - 1] || '';

    // Skip CSS custom property definitions
    if (/^\s*--[a-zA-Z0-9_-]+\s*:/.test(lineContent)) {
      continue;
    }

    // Skip if inside a comment
    if (isInsideComment(content, match.index)) {
      continue;
    }

    // Check if value is on the standard rem scale
    if (isOnRemScale(numValue)) {
      continue; // Value is on scale, not arbitrary
    }

    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const endColumn = column + value.length;

    const property = extractCSSProperty(lineContent);
    const arbitraryInfo: ArbitrarySpacingInfo = {
      type: 'arbitrary-rem',
      file,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      value,
      suggestedValue: suggestRemSpacingValue(numValue),
      lineContent,
    };
    if (property !== undefined) {
      arbitraryInfo.property = property;
    }
    results.push(arbitraryInfo);
  }

  return results;
}

/**
 * Detect arbitrary em spacing values
 */
export function detectArbitraryEmSpacing(content: string, file: string): ArbitrarySpacingInfo[] {
  const results: ArbitrarySpacingInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(HARDCODED_SPACING_PATTERNS.em.source, HARDCODED_SPACING_PATTERNS.em.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const numValue = parseFloat(match[1] || '0');
    const value = `${numValue}em`;

    // Skip allowed values
    if (isAllowedSpacingValue(value)) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lineContent = lines[lineNumber - 1] || '';

    // Skip CSS custom property definitions
    if (/^\s*--[a-zA-Z0-9_-]+\s*:/.test(lineContent)) {
      continue;
    }

    // Skip if inside a comment
    if (isInsideComment(content, match.index)) {
      continue;
    }

    // Check if value is on the standard rem scale (em uses same scale)
    if (isOnRemScale(numValue)) {
      continue; // Value is on scale, not arbitrary
    }

    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const endColumn = column + value.length;

    const property = extractCSSProperty(lineContent);
    const arbitraryInfo: ArbitrarySpacingInfo = {
      type: 'arbitrary-em',
      file,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      value,
      suggestedValue: suggestRemSpacingValue(numValue).replace('rem', 'em'),
      lineContent,
    };
    if (property !== undefined) {
      arbitraryInfo.property = property;
    }
    results.push(arbitraryInfo);
  }

  return results;
}


/**
 * Suggest a Tailwind spacing class for an arbitrary value
 */
function suggestTailwindSpacingClass(value: string): string {
  // Extract numeric value and unit
  const match = value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
  if (!match) {
    return 'Use a standard Tailwind spacing class (e.g., p-4, m-2)';
  }

  const num = parseFloat(match[1] || '0');
  const unit = match[2] || 'px';

  if (unit === 'px') {
    // Convert px to Tailwind scale (1 unit = 0.25rem = 4px)
    const tailwindUnit = Math.round(num / 4);
    return `Use spacing class with value ${tailwindUnit} (e.g., p-${tailwindUnit})`;
  }

  if (unit === 'rem') {
    // Convert rem to Tailwind scale (1 unit = 0.25rem)
    const tailwindUnit = Math.round(num / 0.25);
    return `Use spacing class with value ${tailwindUnit} (e.g., p-${tailwindUnit})`;
  }

  return 'Use a standard Tailwind spacing class (e.g., p-4, m-2)';
}

/**
 * Suggest a pixel spacing value on the scale
 */
function suggestPxSpacingValue(value: number): string {
  const nearest4px = findNearest4pxValue(value);
  const nearest8px = findNearest8pxValue(value);

  // Prefer 4px scale as it's more common
  const diff4px = Math.abs(value - nearest4px);
  const diff8px = Math.abs(value - nearest8px);

  if (diff4px <= diff8px) {
    return `${nearest4px}px (4px scale) or use --spacing-${nearest4px / 4}`;
  }
  return `${nearest8px}px (8px scale) or use --spacing-${nearest8px / 8}`;
}

/**
 * Suggest a rem spacing value on the scale
 */
function suggestRemSpacingValue(value: number): string {
  const nearest = findNearestRemValue(value);
  return `${nearest}rem or use theme.spacing.${nearest * 4}`;
}

/**
 * Analyze spacing scale patterns in a file
 */
export function analyzeSpacingScale(content: string, file: string): SpacingScaleAnalysis {
  // Skip excluded files for arbitrary value detection
  const skipArbitraryDetection = shouldExcludeFile(file);

  // Detect spacing patterns
  const tailwindSpacing = detectTailwindSpacing(content, file);
  const cssSpacingProperties = detectCSSSpacingProperties(content, file);
  const themeSpacing = detectThemeSpacing(content, file);

  const spacingPatterns = [
    ...tailwindSpacing,
    ...cssSpacingProperties,
    ...themeSpacing,
  ];

  // Detect arbitrary values (unless file is excluded)
  let arbitraryValues: ArbitrarySpacingInfo[] = [];
  if (!skipArbitraryDetection) {
    const tailwindArbitrary = detectTailwindArbitrarySpacing(content, file);
    const arbitraryPx = detectArbitraryPxSpacing(content, file);
    const arbitraryRem = detectArbitraryRemSpacing(content, file);
    const arbitraryEm = detectArbitraryEmSpacing(content, file);
    arbitraryValues = [...tailwindArbitrary, ...arbitraryPx, ...arbitraryRem, ...arbitraryEm];
  }

  // Determine detected scale
  let detectedScale: '4px' | '8px' | 'rem' | null = null;
  if (tailwindSpacing.length > 0) {
    detectedScale = 'rem'; // Tailwind uses rem-based scale
  } else if (cssSpacingProperties.length > 0 || themeSpacing.length > 0) {
    // Could be either, default to 4px
    detectedScale = '4px';
  }

  // Calculate confidence
  const hasSpacingPatterns = spacingPatterns.length > 0;
  const hasArbitraryValues = arbitraryValues.length > 0;

  let scaleAdherenceConfidence = 0;
  if (hasSpacingPatterns && !hasArbitraryValues) {
    scaleAdherenceConfidence = 1.0;
  } else if (hasSpacingPatterns && hasArbitraryValues) {
    const ratio = spacingPatterns.length / (spacingPatterns.length + arbitraryValues.length);
    scaleAdherenceConfidence = ratio;
  } else if (!hasSpacingPatterns && hasArbitraryValues) {
    scaleAdherenceConfidence = 0;
  } else {
    scaleAdherenceConfidence = 0.5; // No spacing detected
  }

  return {
    spacingPatterns,
    arbitraryValues,
    usesTailwindSpacing: tailwindSpacing.length > 0,
    usesCSSSpacingProperties: cssSpacingProperties.length > 0,
    usesThemeSpacing: themeSpacing.length > 0,
    detectedScale,
    scaleAdherenceConfidence,
  };
}


// ============================================================================
// Spacing Scale Detector Class
// ============================================================================

/**
 * Detector for spacing scale adherence patterns
 *
 * Identifies consistent spacing patterns and flags arbitrary values
 * that don't follow the established scale.
 *
 * @requirements 9.2 - THE Styling_Detector SHALL detect spacing scale adherence (p-4 vs arbitrary values)
 */
export class SpacingScaleDetector extends RegexDetector {
  readonly id = 'styling/spacing-scale';
  readonly category = 'styling' as const;
  readonly subcategory = 'spacing-scale';
  readonly name = 'Spacing Scale Detector';
  readonly description = 'Detects spacing scale adherence and flags arbitrary spacing values';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  /**
   * Detect spacing scale patterns and violations
   * 
   * NOTE: This detector focuses on PATTERN detection only.
   * Hardcoded spacing violations are handled by the Design Tokens Detector
   * to avoid duplicate violations.
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    // NOTE: We don't create violations here - Design Tokens Detector handles hardcoded values
    // This prevents duplicate violations for the same hardcoded spacing

    // Analyze the file
    const analysis = analyzeSpacingScale(context.content, context.file);

    // Create pattern matches for spacing patterns
    if (analysis.usesTailwindSpacing) {
      patterns.push(this.createTailwindSpacingPattern(context.file, analysis));
    }

    if (analysis.usesCSSSpacingProperties) {
      patterns.push(this.createCSSSpacingPropertyPattern(context.file, analysis));
    }

    if (analysis.usesThemeSpacing) {
      patterns.push(this.createThemeSpacingPattern(context.file, analysis));
    }

    // NOTE: Arbitrary spacing violations are NOT created here to avoid duplication
    // with the Design Tokens Detector which handles all hardcoded values

    return this.createResult(patterns, [], analysis.scaleAdherenceConfidence);
  }

  /**
   * Create a pattern match for Tailwind spacing usage
   */
  private createTailwindSpacingPattern(
    file: string,
    analysis: SpacingScaleAnalysis
  ): PatternMatch {
    const tailwindPatterns = analysis.spacingPatterns.filter(
      p => p.type === 'tailwind-spacing'
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
   * Create a pattern match for CSS spacing property usage
   */
  private createCSSSpacingPropertyPattern(
    file: string,
    analysis: SpacingScaleAnalysis
  ): PatternMatch {
    const cssPatterns = analysis.spacingPatterns.filter(
      p => p.type === 'css-spacing-property'
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
   * Create a pattern match for theme spacing usage
   */
  private createThemeSpacingPattern(
    file: string,
    analysis: SpacingScaleAnalysis
  ): PatternMatch {
    const themePatterns = analysis.spacingPatterns.filter(
      p => p.type === 'theme-spacing'
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
   * Generate a quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Check if this is an arbitrary spacing violation
    if (!violation.message.includes('spacing')) {
      return null;
    }

    // Extract the value from the message
    const valueMatch = violation.message.match(/['"]([^'"]+)['"]/);
    if (!valueMatch?.[1]) {
      return null;
    }

    const value = valueMatch[1];
    
    // Determine the type and suggest replacement
    let suggestedValue: string;
    if (value.endsWith('px')) {
      const numValue = parseInt(value, 10);
      suggestedValue = suggestPxSpacingValue(numValue);
    } else if (value.endsWith('rem')) {
      const numValue = parseFloat(value);
      suggestedValue = suggestRemSpacingValue(numValue);
    } else if (value.includes('[')) {
      // Tailwind arbitrary value
      suggestedValue = 'Use a standard Tailwind spacing class';
    } else {
      return null;
    }

    const firstSuggestion = suggestedValue.split(' or ')[0] || suggestedValue;
    const replacement = firstSuggestion.match(/^[\d.]+(?:px|rem|em)/)?.[0] || firstSuggestion;

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
 * Create a new SpacingScaleDetector instance
 */
export function createSpacingScaleDetector(): SpacingScaleDetector {
  return new SpacingScaleDetector();
}
