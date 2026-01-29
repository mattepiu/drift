/**
 * Typography Detector - Typography scale detection
 *
 * Detects typography scale patterns including:
 * - CSS custom properties for typography (--font-size-*, --line-height-*, --font-weight-*)
 * - Theme typography objects (theme.typography.*, theme.fontSizes.*, etc.)
 * - Tailwind typography classes (text-sm, text-lg, font-bold, leading-tight, etc.)
 * - Typography scale values (12px, 14px, 16px, 18px, 20px, 24px, etc.)
 *
 * Flags hardcoded typography values:
 * - Arbitrary font sizes (13px, 17px, etc.)
 * - Arbitrary line heights (1.3, 1.7, etc.)
 * - Arbitrary font weights (450, 550, etc.)
 * - Hardcoded font families
 *
 * @requirements 9.4 - THE Styling_Detector SHALL detect typography scale adherence
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of typography patterns detected
 */
export type TypographyPatternType =
  | 'css-typography-property'   // CSS custom property for typography (--font-size-*, --line-height-*)
  | 'theme-typography'          // Theme typography object (theme.typography.*, theme.fontSizes.*)
  | 'tailwind-typography';      // Tailwind typography class (text-sm, font-bold, leading-tight)

/**
 * Types of hardcoded typography values detected
 */
export type HardcodedTypographyType =
  | 'arbitrary-font-size'       // Arbitrary font size (13px, 17px, etc.)
  | 'arbitrary-line-height'     // Arbitrary line height (1.3, 1.7, etc.)
  | 'arbitrary-font-weight'     // Arbitrary font weight (450, 550, etc.)
  | 'arbitrary-letter-spacing'  // Arbitrary letter spacing (tracking-[0.4em])
  | 'hardcoded-font-family';    // Hardcoded font family

/**
 * Information about a detected typography pattern
 */
export interface TypographyPatternInfo {
  /** Type of typography pattern */
  type: TypographyPatternType;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Typography value or class name */
  typographyValue?: string;
  /** Additional context */
  context?: string;
}

/**
 * Information about a detected hardcoded typography value
 */
export interface HardcodedTypographyInfo {
  /** Type of hardcoded typography */
  type: HardcodedTypographyType;
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
  /** The hardcoded value */
  value: string;
  /** CSS property name (if applicable) */
  property?: string;
  /** Suggested typography token */
  suggestedToken?: string;
  /** The full line content */
  lineContent: string;
}

/**
 * Analysis of typography patterns in a file
 */
export interface TypographyAnalysis {
  /** Typography patterns found */
  typographyPatterns: TypographyPatternInfo[];
  /** Hardcoded typography values found */
  hardcodedValues: HardcodedTypographyInfo[];
  /** Whether file uses CSS custom properties for typography */
  usesCSSTypographyProperties: boolean;
  /** Whether file uses theme typography object */
  usesThemeTypography: boolean;
  /** Whether file uses Tailwind typography classes */
  usesTailwindTypography: boolean;
  /** Confidence score for typography token usage */
  typographyTokenConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Standard typography scale font sizes (in px)
 */
export const TYPOGRAPHY_SCALE_PX = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 30, 32, 36, 40, 48, 56, 64, 72, 80, 96] as const;

/**
 * Standard typography scale font sizes (in rem, based on 16px base)
 */
export const TYPOGRAPHY_SCALE_REM = [0.625, 0.6875, 0.75, 0.8125, 0.875, 1, 1.125, 1.25, 1.5, 1.75, 1.875, 2, 2.25, 2.5, 3, 3.5, 4, 4.5, 5, 6] as const;

/**
 * Standard line height values
 */
export const LINE_HEIGHT_SCALE = [1, 1.25, 1.375, 1.5, 1.625, 1.75, 2] as const;

/**
 * Standard font weight values
 */
export const FONT_WEIGHT_SCALE = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/**
 * Regex pattern for CSS custom properties for typography
 */
export const CSS_TYPOGRAPHY_PROPERTY_PATTERN = /var\(\s*--(?:font-size|fs|text|line-height|lh|font-weight|fw|font-family|ff|typography|type)[-_]?([a-zA-Z0-9_-]*)\s*(?:,\s*[^)]+)?\)/g;

/**
 * Regex patterns for theme typography object usage
 */
export const THEME_TYPOGRAPHY_PATTERNS = [
  // theme.typography.*, theme.fontSizes.*, theme.lineHeights.*, theme.fontWeights.*
  /theme\.(?:typography|fontSizes?|lineHeights?|fontWeights?|fonts?)\.([a-zA-Z0-9_.[\]]+)/g,
  // ${theme.typography.*} in template literals
  /\$\{theme\.(?:typography|fontSizes?|lineHeights?|fontWeights?|fonts?)\.([a-zA-Z0-9_.[\]]+)\}/g,
  // props.theme.typography.*
  /props\.theme\.(?:typography|fontSizes?|lineHeights?|fontWeights?|fonts?)\.([a-zA-Z0-9_.[\]]+)/g,
  // typography.*, fontSizes.* (standalone typography object)
  /\b(?:typography|fontSizes?|lineHeights?|fontWeights?)\.([a-zA-Z0-9_.[\]]+)/g,
] as const;

/**
 * Tailwind typography class patterns
 */
export const TAILWIND_TYPOGRAPHY_PATTERNS = [
  // Font size classes: text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, etc.
  /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/g,
  // Font weight classes: font-thin, font-light, font-normal, font-medium, font-semibold, font-bold, font-extrabold, font-black
  /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g,
  // Line height classes: leading-none, leading-tight, leading-snug, leading-normal, leading-relaxed, leading-loose
  /\bleading-(?:none|tight|snug|normal|relaxed|loose|\d+)\b/g,
  // Letter spacing classes: tracking-tighter, tracking-tight, tracking-normal, tracking-wide, tracking-wider, tracking-widest
  /\btracking-(?:tighter|tight|normal|wide|wider|widest)\b/g,
  // Font family classes: font-sans, font-serif, font-mono
  /\bfont-(?:sans|serif|mono)\b/g,
] as const;

/**
 * Tailwind arbitrary typography value patterns
 */
export const TAILWIND_ARBITRARY_TYPOGRAPHY_PATTERN = /\b(?:text|font|leading|tracking)-\[([^\]]+)\]/g;

/**
 * Hardcoded font size patterns
 */
export const HARDCODED_FONT_SIZE_PATTERNS = {
  // Pixel font sizes: 13px, 17px, etc.
  px: /(?<![a-zA-Z0-9_-])(\d+)px\b/g,
  // Rem font sizes: 0.9rem, 1.1rem, etc.
  rem: /(?<![a-zA-Z0-9_-])(\d+(?:\.\d+)?)rem\b/g,
  // Em font sizes: 0.9em, 1.1em, etc.
  em: /(?<![a-zA-Z0-9_-])(\d+(?:\.\d+)?)em\b/g,
} as const;

/**
 * Hardcoded line height pattern (unitless values like 1.3, 1.7)
 */
export const HARDCODED_LINE_HEIGHT_PATTERN = /line-height\s*:\s*(\d+(?:\.\d+)?)\s*[;}\n]/g;

/**
 * Hardcoded font weight pattern (non-standard values like 450, 550)
 */
export const HARDCODED_FONT_WEIGHT_PATTERN = /font-weight\s*:\s*(\d+)\s*[;}\n]/g;

/**
 * Hardcoded font family pattern
 */
export const HARDCODED_FONT_FAMILY_PATTERN = /font-family\s*:\s*(['"]?)([^;}\n'"]+)\1\s*[;}\n]/g;

/**
 * CSS properties that commonly use typography values
 */
export const TYPOGRAPHY_PROPERTIES = [
  'font-size',
  'line-height',
  'font-weight',
  'font-family',
  'letter-spacing',
  'text-transform',
] as const;

/**
 * Allowed hardcoded typography values (common exceptions)
 */
export const ALLOWED_TYPOGRAPHY_VALUES = new Set([
  'inherit',
  'initial',
  'unset',
  'normal',
  'none',
  '0',
  '100%',
]);

/**
 * Allowed font families (system fonts and common stacks)
 */
export const ALLOWED_FONT_FAMILIES = new Set([
  'inherit',
  'initial',
  'unset',
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
]);

/**
 * File patterns to exclude from hardcoded typography detection
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
  /typography\.[jt]s$/,
  /fonts?\.[jt]s$/,
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file should be excluded from hardcoded typography detection
 */
export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if a value is in the allowed typography values list
 */
export function isAllowedTypographyValue(value: string): boolean {
  return ALLOWED_TYPOGRAPHY_VALUES.has(value.toLowerCase().trim());
}

/**
 * Check if a font family is allowed
 */
export function isAllowedFontFamily(value: string): boolean {
  const normalized = value.toLowerCase().trim().replace(/['"]/g, '');
  // Check if any part of the font stack is a system font
  const parts = normalized.split(',').map(p => p.trim());
  return parts.some(part => ALLOWED_FONT_FAMILIES.has(part));
}

/**
 * Check if a font size is on the typography scale
 */
export function isOnTypographyScale(value: number, unit: 'px' | 'rem' | 'em'): boolean {
  if (unit === 'px') {
    return TYPOGRAPHY_SCALE_PX.includes(value as typeof TYPOGRAPHY_SCALE_PX[number]);
  }
  // For rem/em, check with some tolerance for floating point
  return TYPOGRAPHY_SCALE_REM.some(v => Math.abs(v - value) < 0.001);
}

/**
 * Check if a line height is on the standard scale
 */
export function isOnLineHeightScale(value: number): boolean {
  return LINE_HEIGHT_SCALE.some(v => Math.abs(v - value) < 0.001);
}

/**
 * Check if a font weight is on the standard scale
 */
export function isOnFontWeightScale(value: number): boolean {
  return FONT_WEIGHT_SCALE.includes(value as typeof FONT_WEIGHT_SCALE[number]);
}

/**
 * Find the nearest font size on the typography scale
 */
export function findNearestFontSize(value: number, unit: 'px' | 'rem' | 'em'): number {
  const scale = unit === 'px' ? TYPOGRAPHY_SCALE_PX : TYPOGRAPHY_SCALE_REM;
  let nearest: number = scale[0];
  let minDiff = Math.abs(value - nearest);

  for (const scaleValue of scale) {
    const diff = Math.abs(value - scaleValue);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = scaleValue;
    }
  }

  return nearest;
}

/**
 * Find the nearest line height on the scale
 */
export function findNearestLineHeight(value: number): number {
  let nearest: number = LINE_HEIGHT_SCALE[0];
  let minDiff = Math.abs(value - nearest);

  for (const scaleValue of LINE_HEIGHT_SCALE) {
    const diff = Math.abs(value - scaleValue);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = scaleValue;
    }
  }

  return nearest;
}

/**
 * Find the nearest font weight on the scale
 */
export function findNearestFontWeight(value: number): number {
  let nearest: number = FONT_WEIGHT_SCALE[0];
  let minDiff = Math.abs(value - nearest);

  for (const scaleValue of FONT_WEIGHT_SCALE) {
    const diff = Math.abs(value - scaleValue);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = scaleValue;
    }
  }

  return nearest;
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
 * Detect CSS custom property usage for typography
 */
export function detectCSSTypographyProperties(content: string, file: string): TypographyPatternInfo[] {
  const results: TypographyPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(CSS_TYPOGRAPHY_PROPERTY_PATTERN.source, CSS_TYPOGRAPHY_PROPERTY_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'css-typography-property',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      typographyValue: match[1] || '',
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect theme typography object usage
 */
export function detectThemeTypography(content: string, file: string): TypographyPatternInfo[] {
  const results: TypographyPatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of THEME_TYPOGRAPHY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'theme-typography',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        typographyValue: match[1] || match[0],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Detect Tailwind typography classes
 */
export function detectTailwindTypography(content: string, file: string): TypographyPatternInfo[] {
  const results: TypographyPatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of TAILWIND_TYPOGRAPHY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'tailwind-typography',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        typographyValue: match[0],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Detect Tailwind arbitrary typography values
 */
export function detectTailwindArbitraryTypography(content: string, file: string): HardcodedTypographyInfo[] {
  const results: HardcodedTypographyInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(TAILWIND_ARBITRARY_TYPOGRAPHY_PATTERN.source, TAILWIND_ARBITRARY_TYPOGRAPHY_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const value = match[1] || '';
    
    // Skip allowed values
    if (isAllowedTypographyValue(value)) {
      continue;
    }
    
    // Skip color values - text-[#color] is a text color, not font size
    // Colors: #hex, rgb(), rgba(), hsl(), hsla(), or named colors
    if (/^#[0-9a-fA-F]{3,8}$/.test(value) ||
        /^rgba?\s*\(/.test(value) ||
        /^hsla?\s*\(/.test(value)) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const endColumn = column + match[0].length;

    // Determine the type based on the prefix
    const prefix = match[0].split('-[')[0] || '';
    let type: HardcodedTypographyType = 'arbitrary-font-size';
    if (prefix === 'font') {
      type = 'arbitrary-font-weight';
    } else if (prefix === 'leading') {
      type = 'arbitrary-line-height';
    } else if (prefix === 'tracking') {
      type = 'arbitrary-letter-spacing';
    }

    results.push({
      type,
      file,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      value: match[0],
      suggestedToken: suggestTypographyToken(value, type),
      lineContent: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Non-typography Tailwind prefixes that use px values but aren't font sizes
 * These are width, height, spacing, positioning, etc.
 */
const NON_TYPOGRAPHY_TAILWIND_PREFIXES = [
  'w-', 'h-', 'min-w-', 'min-h-', 'max-w-', 'max-h-',  // dimensions
  'p-', 'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-',      // padding
  'm-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-',      // margin
  'gap-', 'gap-x-', 'gap-y-',                          // gap
  'space-x-', 'space-y-',                              // space
  'top-', 'right-', 'bottom-', 'left-',                // positioning
  'inset-', 'inset-x-', 'inset-y-',                    // inset
  'rounded-', 'border-', 'outline-',                   // borders
  'translate-x-', 'translate-y-',                      // transforms
  'blur-', 'backdrop-blur-',                           // filters
  'scroll-m-', 'scroll-p-',                            // scroll
  'size-',                                             // size (w + h)
  'text-',                                             // text-[*] arbitrary font sizes (intentional)
  'leading-',                                          // leading-[*] arbitrary line heights (intentional)
  'tracking-',                                         // tracking-[*] arbitrary letter spacing (intentional)
];

/**
 * Check if a match is inside a Tailwind arbitrary value for non-typography properties
 */
function isNonTypographyTailwindValue(lineContent: string, _matchIndex: number, value: string): boolean {
  // Find the position of the value in the line
  const valueInLine = lineContent.indexOf(value);
  if (valueInLine === -1) {return false;}
  
  // Look backwards from the value to find if it's inside a Tailwind class
  const beforeValue = lineContent.slice(0, valueInLine);
  
  // Check for Tailwind arbitrary value syntax: prefix-[value]
  for (const prefix of NON_TYPOGRAPHY_TAILWIND_PREFIXES) {
    // Check if there's a pattern like "w-[" before our value
    const arbitraryPattern = new RegExp(`${prefix.replace('-', '-')}\\[$`);
    if (arbitraryPattern.test(beforeValue)) {
      return true;
    }
    // Also check for the pattern without the final bracket (in case value includes it)
    if (beforeValue.endsWith(`${prefix}[`)) {
      return true;
    }
  }
  
  // Check if the value is inside any Tailwind arbitrary value bracket
  // This catches cases like shadow-[0_0_0_1px_...] where 1px is inside a complex value
  const lastOpenBracket = beforeValue.lastIndexOf('[');
  const lastCloseBracket = beforeValue.lastIndexOf(']');
  if (lastOpenBracket > lastCloseBracket) {
    // We're inside a bracket - check if it's a Tailwind class
    const beforeBracket = beforeValue.slice(0, lastOpenBracket);
    // If there's a Tailwind-like prefix before the bracket, skip it
    if (/[a-z]+-$/.test(beforeBracket) || /[a-z]+:$/.test(beforeBracket)) {
      return true;
    }
  }
  
  // Also check for common non-typography CSS properties in the same line
  const nonTypographyProperties = [
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'padding', 'margin', 'gap', 'top', 'right', 'bottom', 'left',
    'border-radius', 'border-width', 'outline-width',
    'transform', 'translate', 'inset',
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'box-shadow', 'shadow',
  ];
  
  for (const prop of nonTypographyProperties) {
    if (lineContent.includes(`${prop}:`) || lineContent.includes(`${prop} :`)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detect arbitrary font size values
 */
export function detectArbitraryFontSizes(content: string, file: string): HardcodedTypographyInfo[] {
  const results: HardcodedTypographyInfo[] = [];
  const lines = content.split('\n');

  // Check each font size pattern type
  const fontSizePatterns: Array<{ pattern: RegExp; unit: 'px' | 'rem' | 'em' }> = [
    { pattern: HARDCODED_FONT_SIZE_PATTERNS.px, unit: 'px' },
    { pattern: HARDCODED_FONT_SIZE_PATTERNS.rem, unit: 'rem' },
    { pattern: HARDCODED_FONT_SIZE_PATTERNS.em, unit: 'em' },
  ];

  for (const { pattern, unit } of fontSizePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const numValue = parseFloat(match[1] || '0');
      const value = `${numValue}${unit}`;

      // Skip allowed values
      if (isAllowedTypographyValue(value)) {
        continue;
      }

      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lineContent = lines[lineNumber - 1] || '';

      // Skip if this is a Tailwind arbitrary value for non-typography properties
      // (e.g., w-[280px], h-[400px], p-[20px], etc.)
      if (isNonTypographyTailwindValue(lineContent, match.index, value)) {
        continue;
      }

      // Only flag if this is a font-size property (for CSS)
      const property = extractCSSProperty(lineContent);
      if (property && !['font-size', 'font'].includes(property)) {
        continue;
      }

      // Skip CSS custom property definitions
      if (/^\s*--[a-zA-Z0-9_-]+\s*:/.test(lineContent)) {
        continue;
      }

      // Skip if inside a comment
      if (isInsideComment(content, match.index)) {
        continue;
      }

      // Check if value is on the typography scale
      if (isOnTypographyScale(numValue, unit)) {
        continue;
      }

      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      const endColumn = column + value.length;

      const hardcodedInfo: HardcodedTypographyInfo = {
        type: 'arbitrary-font-size',
        file,
        line: lineNumber,
        column,
        endLine: lineNumber,
        endColumn,
        value,
        suggestedToken: suggestFontSizeToken(numValue, unit),
        lineContent,
      };
      if (property !== undefined) {
        hardcodedInfo.property = property;
      }
      results.push(hardcodedInfo);
    }
  }

  return results;
}

/**
 * Detect arbitrary line height values
 */
export function detectArbitraryLineHeights(content: string, file: string): HardcodedTypographyInfo[] {
  const results: HardcodedTypographyInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(HARDCODED_LINE_HEIGHT_PATTERN.source, HARDCODED_LINE_HEIGHT_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const numValue = parseFloat(match[1] || '0');

    // Skip allowed values
    if (isAllowedTypographyValue(match[1] || '')) {
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

    // Check if value is on the line height scale
    if (isOnLineHeightScale(numValue)) {
      continue;
    }

    const lastNewline = beforeMatch.lastIndexOf('\n');
    const valueStart = lineContent.indexOf(match[1] || '');
    const column = valueStart >= 0 ? valueStart + 1 : match.index - lastNewline;
    const endColumn = column + (match[1] || '').length;

    results.push({
      type: 'arbitrary-line-height',
      file,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      value: match[1] || '',
      property: 'line-height',
      suggestedToken: suggestLineHeightToken(numValue),
      lineContent,
    });
  }

  return results;
}

/**
 * Detect arbitrary font weight values
 */
export function detectArbitraryFontWeights(content: string, file: string): HardcodedTypographyInfo[] {
  const results: HardcodedTypographyInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(HARDCODED_FONT_WEIGHT_PATTERN.source, HARDCODED_FONT_WEIGHT_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const numValue = parseInt(match[1] || '0', 10);

    // Skip allowed values
    if (isAllowedTypographyValue(match[1] || '')) {
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

    // Check if value is on the font weight scale
    if (isOnFontWeightScale(numValue)) {
      continue;
    }

    const lastNewline = beforeMatch.lastIndexOf('\n');
    const valueStart = lineContent.indexOf(match[1] || '');
    const column = valueStart >= 0 ? valueStart + 1 : match.index - lastNewline;
    const endColumn = column + (match[1] || '').length;

    results.push({
      type: 'arbitrary-font-weight',
      file,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      value: match[1] || '',
      property: 'font-weight',
      suggestedToken: suggestFontWeightToken(numValue),
      lineContent,
    });
  }

  return results;
}

/**
 * Detect hardcoded font family values
 */
export function detectHardcodedFontFamilies(content: string, file: string): HardcodedTypographyInfo[] {
  const results: HardcodedTypographyInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(HARDCODED_FONT_FAMILY_PATTERN.source, HARDCODED_FONT_FAMILY_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const fontFamily = match[2] || '';

    // Skip allowed font families
    if (isAllowedFontFamily(fontFamily)) {
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

    const lastNewline = beforeMatch.lastIndexOf('\n');
    const valueStart = lineContent.indexOf(fontFamily);
    const column = valueStart >= 0 ? valueStart + 1 : match.index - lastNewline;
    const endColumn = column + fontFamily.length;

    results.push({
      type: 'hardcoded-font-family',
      file,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      value: fontFamily,
      property: 'font-family',
      suggestedToken: 'Use a font token from your design system (e.g., --font-family-sans, theme.fonts.body)',
      lineContent,
    });
  }

  return results;
}

/**
 * Suggest a typography token for a hardcoded value
 */
export function suggestTypographyToken(value: string, type: HardcodedTypographyType): string {
  switch (type) {
    case 'arbitrary-font-size': {
      const match = value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
      if (match) {
        const num = parseFloat(match[1] || '0');
        const unit = (match[2] || 'px') as 'px' | 'rem' | 'em';
        return suggestFontSizeToken(num, unit);
      }
      return 'Use a font size token (e.g., text-base, --font-size-md)';
    }
    case 'arbitrary-line-height': {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return suggestLineHeightToken(num);
      }
      return 'Use a line height token (e.g., leading-normal, --line-height-base)';
    }
    case 'arbitrary-font-weight': {
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        return suggestFontWeightToken(num);
      }
      return 'Use a font weight token (e.g., font-medium, --font-weight-medium)';
    }
    case 'arbitrary-letter-spacing':
      return 'Use a letter spacing token (e.g., tracking-tight, tracking-wide, --letter-spacing-wide)';
    case 'hardcoded-font-family':
      return 'Use a font family token (e.g., font-sans, --font-family-sans)';
    default:
      return 'Use a typography token from your design system';
  }
}

/**
 * Suggest a font size token
 */
function suggestFontSizeToken(value: number, unit: 'px' | 'rem' | 'em'): string {
  const nearest = findNearestFontSize(value, unit);
  const tailwindSizes: Record<number, string> = {
    10: 'text-[10px]',
    12: 'text-xs',
    14: 'text-sm',
    16: 'text-base',
    18: 'text-lg',
    20: 'text-xl',
    24: 'text-2xl',
    30: 'text-3xl',
    36: 'text-4xl',
    48: 'text-5xl',
    64: 'text-6xl',
  };
  
  if (unit === 'px' && tailwindSizes[nearest]) {
    return `${tailwindSizes[nearest]} or --font-size-${nearest}`;
  }
  return `${nearest}${unit} or use --font-size-* token`;
}

/**
 * Suggest a line height token
 */
function suggestLineHeightToken(value: number): string {
  const nearest = findNearestLineHeight(value);
  const tailwindLineHeights: Record<number, string> = {
    1: 'leading-none',
    1.25: 'leading-tight',
    1.375: 'leading-snug',
    1.5: 'leading-normal',
    1.625: 'leading-relaxed',
    1.75: 'leading-relaxed',
    2: 'leading-loose',
  };
  
  if (tailwindLineHeights[nearest]) {
    return `${tailwindLineHeights[nearest]} or --line-height-${nearest}`;
  }
  return `${nearest} or use --line-height-* token`;
}

/**
 * Suggest a font weight token
 */
function suggestFontWeightToken(value: number): string {
  const nearest = findNearestFontWeight(value);
  const tailwindWeights: Record<number, string> = {
    100: 'font-thin',
    200: 'font-extralight',
    300: 'font-light',
    400: 'font-normal',
    500: 'font-medium',
    600: 'font-semibold',
    700: 'font-bold',
    800: 'font-extrabold',
    900: 'font-black',
  };
  
  if (tailwindWeights[nearest]) {
    return `${tailwindWeights[nearest]} or --font-weight-${nearest}`;
  }
  return `${nearest} or use --font-weight-* token`;
}

/**
 * Analyze typography patterns in a file
 */
export function analyzeTypography(content: string, file: string): TypographyAnalysis {
  // Skip excluded files for hardcoded typography detection
  const skipHardcodedDetection = shouldExcludeFile(file);

  // Detect typography patterns
  const cssTypographyProperties = detectCSSTypographyProperties(content, file);
  const themeTypography = detectThemeTypography(content, file);
  const tailwindTypography = detectTailwindTypography(content, file);

  const typographyPatterns = [
    ...cssTypographyProperties,
    ...themeTypography,
    ...tailwindTypography,
  ];

  // Detect hardcoded values (unless file is excluded)
  // NOTE: We intentionally skip Tailwind arbitrary values (text-[10px], leading-[1.2], etc.)
  // because these are deliberate choices, not violations. Tailwind's arbitrary value syntax
  // is a feature, not a bug. The detector should focus on inline styles and CSS that
  // bypass the design system entirely, not Tailwind classes which are still part of
  // a utility-first approach.
  let hardcodedValues: HardcodedTypographyInfo[] = [];
  if (!skipHardcodedDetection) {
    // Skip tailwindArbitrary - these are intentional choices
    // const tailwindArbitrary = detectTailwindArbitraryTypography(content, file);
    const arbitraryFontSizes = detectArbitraryFontSizes(content, file);
    const arbitraryLineHeights = detectArbitraryLineHeights(content, file);
    const arbitraryFontWeights = detectArbitraryFontWeights(content, file);
    const hardcodedFontFamilies = detectHardcodedFontFamilies(content, file);
    hardcodedValues = [
      // ...tailwindArbitrary, // Disabled - Tailwind arbitrary values are intentional
      ...arbitraryFontSizes,
      ...arbitraryLineHeights,
      ...arbitraryFontWeights,
      ...hardcodedFontFamilies,
    ];
  }

  // Calculate confidence
  const hasTypographyPatterns = typographyPatterns.length > 0;
  const hasHardcodedValues = hardcodedValues.length > 0;

  let typographyTokenConfidence = 0;
  if (hasTypographyPatterns && !hasHardcodedValues) {
    typographyTokenConfidence = 1.0;
  } else if (hasTypographyPatterns && hasHardcodedValues) {
    const ratio = typographyPatterns.length / (typographyPatterns.length + hardcodedValues.length);
    typographyTokenConfidence = ratio;
  } else if (!hasTypographyPatterns && hasHardcodedValues) {
    typographyTokenConfidence = 0;
  } else {
    typographyTokenConfidence = 0.5; // No typography styling detected
  }

  return {
    typographyPatterns,
    hardcodedValues,
    usesCSSTypographyProperties: cssTypographyProperties.length > 0,
    usesThemeTypography: themeTypography.length > 0,
    usesTailwindTypography: tailwindTypography.length > 0,
    typographyTokenConfidence,
  };
}

// ============================================================================
// Typography Detector Class
// ============================================================================

/**
 * Detector for typography scale adherence patterns
 *
 * Identifies typography token usage and flags hardcoded typography values
 * that should use design tokens instead.
 *
 * @requirements 9.4 - THE Styling_Detector SHALL detect typography scale adherence
 */
export class TypographyDetector extends RegexDetector {
  readonly id = 'styling/typography';
  readonly category = 'styling' as const;
  readonly subcategory = 'typography';
  readonly name = 'Typography Detector';
  readonly description = 'Detects typography scale adherence and flags hardcoded typography values';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  /**
   * Detect typography patterns and violations
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Analyze the file
    const analysis = analyzeTypography(context.content, context.file);

    // Create pattern matches for typography patterns
    if (analysis.usesCSSTypographyProperties) {
      patterns.push(this.createCSSTypographyPropertyPattern(context.file, analysis));
    }

    if (analysis.usesThemeTypography) {
      patterns.push(this.createThemeTypographyPattern(context.file, analysis));
    }

    if (analysis.usesTailwindTypography) {
      patterns.push(this.createTailwindTypographyPattern(context.file, analysis));
    }

    // NOTE: Violations are intentionally not generated.
    // Drift is a pattern-learning tool, not a linter.
    // Hardcoded values are detected as patterns, not violations.
    // for (const hardcoded of analysis.hardcodedValues) {
    //   violations.push(this.createHardcodedTypographyViolation(hardcoded));
    // }

    return this.createResult(patterns, violations, analysis.typographyTokenConfidence);
  }

  /**
   * Create a pattern match for CSS typography property usage
   */
  private createCSSTypographyPropertyPattern(
    file: string,
    analysis: TypographyAnalysis
  ): PatternMatch {
    const cssPatterns = analysis.typographyPatterns.filter(
      p => p.type === 'css-typography-property'
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
   * Create a pattern match for theme typography usage
   */
  private createThemeTypographyPattern(
    file: string,
    analysis: TypographyAnalysis
  ): PatternMatch {
    const themePatterns = analysis.typographyPatterns.filter(
      p => p.type === 'theme-typography'
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
   * Create a pattern match for Tailwind typography usage
   */
  private createTailwindTypographyPattern(
    file: string,
    analysis: TypographyAnalysis
  ): PatternMatch {
    const tailwindPatterns = analysis.typographyPatterns.filter(
      p => p.type === 'tailwind-typography'
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
   * Create a violation for a hardcoded typography value
   * NOTE: This method is currently unused as drift is a pattern-learning tool,
   * not a linter. Violations are intentionally not generated.
   */
  // @ts-expect-error - Intentionally unused, kept for potential future use
  private _createHardcodedTypographyViolation(hardcoded: HardcodedTypographyInfo): Violation {
    const typeDescriptions: Record<HardcodedTypographyType, string> = {
      'arbitrary-font-size': 'arbitrary font size',
      'arbitrary-line-height': 'arbitrary line height',
      'arbitrary-font-weight': 'arbitrary font weight',
      'arbitrary-letter-spacing': 'arbitrary letter spacing',
      'hardcoded-font-family': 'hardcoded font family',
    };

    const typeDescription = typeDescriptions[hardcoded.type] || 'hardcoded typography';
    const propertyInfo = hardcoded.property ? ` in '${hardcoded.property}'` : '';

    const violation: Violation = {
      id: `${this.id}-${hardcoded.file}-${hardcoded.line}-${hardcoded.column}`,
      patternId: this.id,
      severity: 'warning',
      file: hardcoded.file,
      range: {
        start: { line: hardcoded.line - 1, character: hardcoded.column - 1 },
        end: { line: hardcoded.endLine - 1, character: hardcoded.endColumn - 1 },
      },
      message: `${typeDescription.charAt(0).toUpperCase() + typeDescription.slice(1)} '${hardcoded.value}'${propertyInfo} doesn't follow the typography scale`,
      explanation: `Using hardcoded typography values instead of design tokens makes it difficult to maintain consistent typography across the application. Use values from your typography scale (Tailwind classes, CSS custom properties, or theme tokens).`,
      expected: hardcoded.suggestedToken || 'A typography token',
      actual: hardcoded.value,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };

    const quickFix = this.createQuickFixForHardcodedTypography(hardcoded);
    if (quickFix !== undefined) {
      violation.quickFix = quickFix;
    }

    return violation;
  }

  /**
   * Create a quick fix for replacing a hardcoded typography value with a token
   */
  private createQuickFixForHardcodedTypography(hardcoded: HardcodedTypographyInfo): QuickFix | undefined {
    // Only provide quick fix if we have a suggested token
    if (!hardcoded.suggestedToken) {
      return undefined;
    }

    // Extract the first suggested token (before "or")
    const suggestedToken = hardcoded.suggestedToken.split(' or ')[0] || hardcoded.suggestedToken;

    // Determine the replacement based on context
    let replacement: string;
    if (hardcoded.lineContent.includes('var(')) {
      // Already using CSS custom properties, suggest a different custom property
      replacement = `var(${suggestedToken.replace(/\./g, '-')})`;
    } else if (hardcoded.lineContent.includes('${') || hardcoded.lineContent.includes('`')) {
      // Template literal context (styled-components, emotion)
      replacement = `\${${suggestedToken}}`;
    } else {
      // Default: suggest the token directly
      replacement = suggestedToken;
    }

    return {
      title: `Replace with typography token: ${suggestedToken}`,
      kind: 'quickfix',
      edit: {
        changes: {
          [hardcoded.file]: [
            {
              range: {
                start: { line: hardcoded.line - 1, character: hardcoded.column - 1 },
                end: { line: hardcoded.endLine - 1, character: hardcoded.endColumn - 1 },
              },
              newText: replacement,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Replace '${hardcoded.value}' with '${replacement}'`,
    };
  }

  /**
   * Generate a quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Check if this is a typography violation
    if (!violation.message.includes('typography') && 
        !violation.message.includes('font') && 
        !violation.message.includes('line height')) {
      return null;
    }

    // Extract the value from the message
    const valueMatch = violation.message.match(/['"]([^'"]+)['"]/);
    if (!valueMatch?.[1]) {
      return null;
    }

    const value = valueMatch[1];
    let suggestedToken: string;

    // Determine the type and suggest replacement
    if (violation.message.includes('font size')) {
      const match = value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
      if (match) {
        suggestedToken = suggestTypographyToken(value, 'arbitrary-font-size');
      } else {
        return null;
      }
    } else if (violation.message.includes('line height')) {
      suggestedToken = suggestTypographyToken(value, 'arbitrary-line-height');
    } else if (violation.message.includes('font weight')) {
      suggestedToken = suggestTypographyToken(value, 'arbitrary-font-weight');
    } else if (violation.message.includes('font family')) {
      suggestedToken = suggestTypographyToken(value, 'hardcoded-font-family');
    } else {
      return null;
    }

    const firstSuggestion = suggestedToken.split(' or ')[0] || suggestedToken;

    return {
      title: `Replace with typography token: ${firstSuggestion}`,
      kind: 'quickfix',
      edit: {
        changes: {
          [violation.file]: [
            {
              range: violation.range,
              newText: firstSuggestion,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Replace '${value}' with '${firstSuggestion}'`,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TypographyDetector instance
 */
export function createTypographyDetector(): TypographyDetector {
  return new TypographyDetector();
}
