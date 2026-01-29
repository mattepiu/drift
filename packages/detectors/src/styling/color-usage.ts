/**
 * Color Usage Detector - Color pattern detection
 *
 * Detects color usage patterns including:
 * - CSS custom properties for colors (--color-*, var(--color-*))
 * - Theme color objects (theme.colors.*, colors.primary, etc.)
 * - Tailwind color classes (text-blue-500, bg-red-100, border-gray-300, etc.)
 * - Named CSS colors (red, blue, green, etc.)
 *
 * Flags hardcoded color values:
 * - Hex colors (#fff, #ffffff, #ffffffff)
 * - RGB colors (rgb(255, 255, 255))
 * - RGBA colors (rgba(255, 255, 255, 0.5))
 * - HSL colors (hsl(0, 0%, 100%))
 * - HSLA colors (hsla(0, 0%, 100%, 0.5))
 *
 * @requirements 9.3 - THE Styling_Detector SHALL detect color usage patterns (system colors vs hex)
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of color patterns detected
 */
export type ColorPatternType =
  | 'css-color-property'       // CSS custom property for colors (--color-*, var(--color-*))
  | 'theme-color'              // Theme color object (theme.colors.*, colors.primary)
  | 'tailwind-color'           // Tailwind color class (text-blue-500, bg-red-100)
  | 'named-css-color';         // Named CSS color (red, blue, green)

/**
 * Types of hardcoded color values detected
 */
export type HardcodedColorType =
  | 'color-hex'                // Hex color (#fff, #ffffff, #ffffffff)
  | 'color-rgb'                // RGB color (rgb(255, 255, 255))
  | 'color-rgba'               // RGBA color (rgba(255, 255, 255, 0.5))
  | 'color-hsl'                // HSL color (hsl(0, 0%, 100%))
  | 'color-hsla';              // HSLA color (hsla(0, 0%, 100%, 0.5))

/**
 * Information about a detected color pattern
 */
export interface ColorPatternInfo {
  /** Type of color pattern */
  type: ColorPatternType;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Color name or variable name */
  colorName?: string;
  /** Additional context */
  context?: string;
}

/**
 * Information about a detected hardcoded color value
 */
export interface HardcodedColorInfo {
  /** Type of hardcoded color */
  type: HardcodedColorType;
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
  /** Suggested color token */
  suggestedToken?: string;
  /** The full line content */
  lineContent: string;
}

/**
 * Analysis of color patterns in a file
 */
export interface ColorUsageAnalysis {
  /** Color patterns found */
  colorPatterns: ColorPatternInfo[];
  /** Hardcoded color values found */
  hardcodedColors: HardcodedColorInfo[];
  /** Whether file uses CSS custom properties for colors */
  usesCSSColorProperties: boolean;
  /** Whether file uses theme color object */
  usesThemeColors: boolean;
  /** Whether file uses Tailwind color classes */
  usesTailwindColors: boolean;
  /** Confidence score for color token usage */
  colorTokenConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Regex pattern for CSS custom properties for colors
 */
export const CSS_COLOR_PROPERTY_PATTERN = /var\(\s*--(?:color|clr|c)[-_]?([a-zA-Z0-9_-]*)\s*(?:,\s*[^)]+)?\)/g;

/**
 * Regex patterns for theme color object usage
 */
export const THEME_COLOR_PATTERNS = [
  // theme.colors.*, theme.color.*
  /theme\.colors?\.([a-zA-Z0-9_.[\]]+)/g,
  // ${theme.colors.*} in template literals
  /\$\{theme\.colors?\.([a-zA-Z0-9_.[\]]+)\}/g,
  // props.theme.colors.*
  /props\.theme\.colors?\.([a-zA-Z0-9_.[\]]+)/g,
  // colors.primary, colors.secondary, etc. (standalone color object)
  /\bcolors\.([a-zA-Z0-9_.[\]]+)/g,
] as const;

/**
 * Tailwind color class patterns
 */
export const TAILWIND_COLOR_PATTERNS = [
  // Text colors: text-red-500, text-blue-100
  /\btext-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Background colors: bg-red-500, bg-blue-100
  /\bbg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Border colors: border-red-500, border-blue-100
  /\bborder-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Ring colors: ring-red-500, ring-blue-100
  /\bring-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Divide colors: divide-red-500, divide-blue-100
  /\bdivide-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Outline colors: outline-red-500, outline-blue-100
  /\boutline-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Fill colors: fill-red-500, fill-blue-100
  /\bfill-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Stroke colors: stroke-red-500, stroke-blue-100
  /\bstroke-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Accent colors: accent-red-500, accent-blue-100
  /\baccent-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Caret colors: caret-red-500, caret-blue-100
  /\bcaret-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Shadow colors: shadow-red-500, shadow-blue-100
  /\bshadow-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Decoration colors: decoration-red-500, decoration-blue-100
  /\bdecoration-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
] as const;

/**
 * Regex patterns for hardcoded color values
 */
export const HARDCODED_COLOR_PATTERNS = {
  // Hex colors: #fff, #ffffff, #ffffffff (with alpha)
  hex: /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
  // RGB colors: rgb(255, 255, 255)
  rgb: /rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)/gi,
  // RGBA colors: rgba(255, 255, 255, 0.5)
  rgba: /rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)/gi,
  // HSL colors: hsl(0, 0%, 100%)
  hsl: /hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)/gi,
  // HSLA colors: hsla(0, 0%, 100%, 0.5)
  hsla: /hsla\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*,\s*[\d.]+\s*\)/gi,
} as const;

/**
 * Named CSS colors to detect
 */
export const NAMED_CSS_COLORS = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure',
  'beige', 'bisque', 'blanchedalmond', 'blue', 'blueviolet',
  'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate',
  'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan',
  'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen',
  'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange',
  'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue',
  'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
  'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite',
  'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo',
  'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen',
  'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow',
  'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta',
  'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
  'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred',
  'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
  'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
  'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
  'plum', 'powderblue', 'purple', 'rebeccapurple', 'red',
  'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown',
  'seagreen', 'seashell', 'sienna', 'silver', 'skyblue',
  'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen',
  'steelblue', 'tan', 'teal', 'thistle', 'tomato',
  'turquoise', 'violet', 'wheat', 'whitesmoke', 'yellow', 'yellowgreen',
] as const;

/**
 * CSS properties that commonly use color values
 */
export const COLOR_PROPERTIES = [
  'color',
  'background-color',
  'background',
  'border-color',
  'border',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'outline',
  'fill',
  'stroke',
  'box-shadow',
  'text-shadow',
  'text-decoration-color',
  'caret-color',
  'accent-color',
  'column-rule-color',
] as const;

/**
 * Allowed hardcoded color values (common exceptions)
 * Note: Values are stored in lowercase for case-insensitive comparison
 */
export const ALLOWED_HARDCODED_COLORS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  '#000',
  '#000000',
  '#fff',
  '#ffffff',
  'black',
  'white',
]);

/**
 * File patterns to exclude from hardcoded color detection
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
  /colors?\.[jt]s$/,
  /palette\.[jt]s$/,
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file should be excluded from hardcoded color detection
 */
export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if a value is in the allowed hardcoded colors list
 */
export function isAllowedHardcodedColor(value: string): boolean {
  return ALLOWED_HARDCODED_COLORS.has(value.toLowerCase().trim());
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
 * Detect CSS custom property usage for colors
 */
export function detectCSSColorProperties(content: string, file: string): ColorPatternInfo[] {
  const results: ColorPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(CSS_COLOR_PROPERTY_PATTERN.source, CSS_COLOR_PROPERTY_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'css-color-property',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      colorName: match[1] || '',
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect theme color object usage
 */
export function detectThemeColors(content: string, file: string): ColorPatternInfo[] {
  const results: ColorPatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of THEME_COLOR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'theme-color',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        colorName: match[1] || match[0],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Detect Tailwind color classes
 */
export function detectTailwindColors(content: string, file: string): ColorPatternInfo[] {
  const results: ColorPatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of TAILWIND_COLOR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'tailwind-color',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        colorName: match[0],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Detect named CSS colors
 */
export function detectNamedCSSColors(content: string, file: string): ColorPatternInfo[] {
  const results: ColorPatternInfo[] = [];
  const lines = content.split('\n');

  // Create a pattern that matches named colors as whole words in CSS context
  const colorPattern = new RegExp(
    `\\b(${NAMED_CSS_COLORS.join('|')})\\b(?=\\s*[;,})])`,
    'gi'
  );

  let match;
  while ((match = colorPattern.exec(content)) !== null) {
    const colorName = match[1]?.toLowerCase() || '';

    // Skip black and white as they're allowed
    if (colorName === 'black' || colorName === 'white') {
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

    results.push({
      type: 'named-css-color',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      colorName: colorName,
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect hardcoded color values
 */
export function detectHardcodedColors(
  content: string,
  file: string
): HardcodedColorInfo[] {
  const results: HardcodedColorInfo[] = [];
  const lines = content.split('\n');

  // Check each color pattern type
  const colorPatterns: Array<{ pattern: RegExp; type: HardcodedColorType }> = [
    { pattern: HARDCODED_COLOR_PATTERNS.hex, type: 'color-hex' },
    { pattern: HARDCODED_COLOR_PATTERNS.rgb, type: 'color-rgb' },
    { pattern: HARDCODED_COLOR_PATTERNS.rgba, type: 'color-rgba' },
    { pattern: HARDCODED_COLOR_PATTERNS.hsl, type: 'color-hsl' },
    { pattern: HARDCODED_COLOR_PATTERNS.hsla, type: 'color-hsla' },
  ];

  for (const { pattern, type } of colorPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const value = match[0];

      // Skip allowed values
      if (isAllowedHardcodedColor(value)) {
        continue;
      }

      // Skip if inside a CSS custom property definition
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lineContent = lines[lineNumber - 1] || '';

      // Skip CSS custom property definitions (--color-name: #fff)
      if (/^\s*--[a-zA-Z0-9_-]+\s*:/.test(lineContent)) {
        continue;
      }

      // Skip if inside a comment
      if (isInsideComment(content, match.index)) {
        continue;
      }

      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      const endColumn = column + value.length;

      const property = extractCSSProperty(lineContent);
      const hardcodedInfo: HardcodedColorInfo = {
        type,
        file,
        line: lineNumber,
        column,
        endLine: lineNumber,
        endColumn,
        value,
        suggestedToken: suggestColorToken(value),
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
 * Suggest a color token for a hardcoded color value
 */
export function suggestColorToken(value: string): string {
  // Normalize the value
  const normalized = value.toLowerCase();

  // Common color mappings based on hex values
  if (normalized === '#000' || normalized === '#000000') {
    return 'colors.black or --color-black';
  }
  if (normalized === '#fff' || normalized === '#ffffff') {
    return 'colors.white or --color-white';
  }

  // Try to identify color family from hex
  if (normalized.startsWith('#')) {
    const colorFamily = identifyColorFamily(normalized);
    if (colorFamily) {
      return `colors.${colorFamily} or --color-${colorFamily}`;
    }
  }

  // Generic suggestion
  return 'Use a design token from your color palette (e.g., colors.primary, --color-primary)';
}

/**
 * Identify color family from hex value
 */
function identifyColorFamily(hex: string): string | null {
  // Normalize to 6-digit hex
  let normalizedHex = hex.toLowerCase().replace('#', '');
  if (normalizedHex.length === 3) {
    normalizedHex = normalizedHex.split('').map(c => c + c).join('');
  }
  if (normalizedHex.length === 8) {
    normalizedHex = normalizedHex.slice(0, 6);
  }

  const r = parseInt(normalizedHex.slice(0, 2), 16);
  const g = parseInt(normalizedHex.slice(2, 4), 16);
  const b = parseInt(normalizedHex.slice(4, 6), 16);

  // Simple heuristics for color family identification
  if (r > 200 && g < 100 && b < 100) {return 'red';}
  if (r < 100 && g > 200 && b < 100) {return 'green';}
  if (r < 100 && g < 100 && b > 200) {return 'blue';}
  if (r > 200 && g > 200 && b < 100) {return 'yellow';}
  if (r > 200 && g < 150 && b > 200) {return 'pink';}
  if (r > 200 && g > 100 && b < 100) {return 'orange';}
  if (r > 100 && g < 100 && b > 200) {return 'purple';}
  if (r < 100 && g > 200 && b > 200) {return 'cyan';}
  if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && Math.abs(r - b) < 30) {
    if (r < 50) {return 'black';}
    if (r > 200) {return 'white';}
    return 'gray';
  }

  return null;
}

/**
 * Analyze color usage patterns in a file
 */
export function analyzeColorUsage(content: string, file: string): ColorUsageAnalysis {
  // Skip excluded files for hardcoded color detection
  const skipHardcodedDetection = shouldExcludeFile(file);

  // Detect color patterns
  const cssColorProperties = detectCSSColorProperties(content, file);
  const themeColors = detectThemeColors(content, file);
  const tailwindColors = detectTailwindColors(content, file);
  const namedCSSColors = detectNamedCSSColors(content, file);

  const colorPatterns = [
    ...cssColorProperties,
    ...themeColors,
    ...tailwindColors,
    ...namedCSSColors,
  ];

  // Detect hardcoded colors (unless file is excluded)
  let hardcodedColors: HardcodedColorInfo[] = [];
  if (!skipHardcodedDetection) {
    hardcodedColors = detectHardcodedColors(content, file);
  }

  // Calculate confidence
  const hasColorPatterns = colorPatterns.length > 0;
  const hasHardcodedColors = hardcodedColors.length > 0;

  let colorTokenConfidence = 0;
  if (hasColorPatterns && !hasHardcodedColors) {
    colorTokenConfidence = 1.0;
  } else if (hasColorPatterns && hasHardcodedColors) {
    const ratio = colorPatterns.length / (colorPatterns.length + hardcodedColors.length);
    colorTokenConfidence = ratio;
  } else if (!hasColorPatterns && hasHardcodedColors) {
    colorTokenConfidence = 0;
  } else {
    colorTokenConfidence = 0.5; // No color styling detected
  }

  return {
    colorPatterns,
    hardcodedColors,
    usesCSSColorProperties: cssColorProperties.length > 0,
    usesThemeColors: themeColors.length > 0,
    usesTailwindColors: tailwindColors.length > 0,
    colorTokenConfidence,
  };
}

// ============================================================================
// Color Usage Detector Class
// ============================================================================

/**
 * Detector for color usage patterns
 *
 * Identifies color token usage and flags hardcoded color values that should
 * use design tokens instead.
 *
 * @requirements 9.3 - THE Styling_Detector SHALL detect color usage patterns (system colors vs hex)
 */
export class ColorUsageDetector extends RegexDetector {
  readonly id = 'styling/color-usage';
  readonly category = 'styling' as const;
  readonly subcategory = 'color-usage';
  readonly name = 'Color Usage Detector';
  readonly description = 'Detects color usage patterns and flags hardcoded color values that should use design tokens';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  /**
   * Detect color patterns and violations
   * 
   * NOTE: This detector focuses on PATTERN detection only.
   * Hardcoded color violations are handled by the Design Tokens Detector
   * to avoid duplicate violations.
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    // NOTE: We don't create violations here - Design Tokens Detector handles hardcoded values
    // This prevents duplicate violations for the same hardcoded colors

    // Analyze the file
    const analysis = analyzeColorUsage(context.content, context.file);

    // Create pattern matches for color usages
    if (analysis.usesCSSColorProperties) {
      patterns.push(this.createCSSColorPropertyPattern(context.file, analysis));
    }

    if (analysis.usesThemeColors) {
      patterns.push(this.createThemeColorPattern(context.file, analysis));
    }

    if (analysis.usesTailwindColors) {
      patterns.push(this.createTailwindColorPattern(context.file, analysis));
    }

    // NOTE: Hardcoded color violations are NOT created here to avoid duplication
    // with the Design Tokens Detector which handles all hardcoded values

    return this.createResult(patterns, [], analysis.colorTokenConfidence);
  }

  /**
   * Create a pattern match for CSS color property usage
   */
  private createCSSColorPropertyPattern(
    file: string,
    analysis: ColorUsageAnalysis
  ): PatternMatch {
    const cssPatterns = analysis.colorPatterns.filter(
      p => p.type === 'css-color-property'
    );
    const firstPattern = cssPatterns[0];

    return {
      patternId: `${this.id}/css-color-property`,
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
   * Create a pattern match for theme color usage
   */
  private createThemeColorPattern(
    file: string,
    analysis: ColorUsageAnalysis
  ): PatternMatch {
    const themePatterns = analysis.colorPatterns.filter(
      p => p.type === 'theme-color'
    );
    const firstPattern = themePatterns[0];

    return {
      patternId: `${this.id}/theme-color`,
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
   * Create a pattern match for Tailwind color usage
   */
  private createTailwindColorPattern(
    file: string,
    analysis: ColorUsageAnalysis
  ): PatternMatch {
    const tailwindPatterns = analysis.colorPatterns.filter(
      p => p.type === 'tailwind-color'
    );
    const firstPattern = tailwindPatterns[0];

    return {
      patternId: `${this.id}/tailwind-color`,
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
    // Check if this is a hardcoded color violation
    if (!violation.message.includes('Hardcoded') || !violation.message.includes('color')) {
      return null;
    }

    // Extract the value from the message
    const valueMatch = violation.message.match(/Hardcoded [^']+ '([^']+)'/);
    if (!valueMatch?.[1]) {
      return null;
    }

    const value = valueMatch[1];
    const suggestedToken = suggestColorToken(value);
    const firstSuggestion = suggestedToken.split(' or ')[0] || suggestedToken;

    return {
      title: `Replace with color token: ${firstSuggestion}`,
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
 * Create a new ColorUsageDetector instance
 */
export function createColorUsageDetector(): ColorUsageDetector {
  return new ColorUsageDetector();
}
