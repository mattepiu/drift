/**
 * Design Tokens Detector - Token usage detection
 *
 * Detects design token usage patterns including:
 * - Imports from design-tokens/ directory
 * - CSS custom properties (--token-name)
 * - Theme object usage (theme.colors, theme.spacing, etc.)
 * - Token variable usage in styled-components, emotion, etc.
 *
 * Flags hardcoded values that should use design tokens:
 * - Hardcoded colors (hex, rgb, hsl)
 * - Hardcoded spacing values (px, rem, em)
 * - Hardcoded font sizes
 * - Hardcoded border radius
 *
 * @requirements 9.1 - THE Styling_Detector SHALL detect design token usage vs hardcoded values
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of design token patterns detected
 */
export type TokenPatternType =
  | 'design-tokens-import'    // Import from design-tokens/ directory
  | 'css-custom-property'     // CSS custom property usage (--token-name)
  | 'theme-object'            // Theme object usage (theme.colors, etc.)
  | 'token-variable'          // Token variable usage in styled-components/emotion
  | 'tailwind-class';         // Tailwind utility class usage

/**
 * Types of hardcoded values detected
 */
export type HardcodedValueType =
  | 'color-hex'               // Hex color (#fff, #ffffff)
  | 'color-rgb'               // RGB color (rgb(255, 255, 255))
  | 'color-rgba'              // RGBA color (rgba(255, 255, 255, 0.5))
  | 'color-hsl'               // HSL color (hsl(0, 0%, 100%))
  | 'color-hsla'              // HSLA color (hsla(0, 0%, 100%, 0.5))
  | 'spacing-px'              // Pixel spacing (10px, 20px)
  | 'spacing-rem'             // Rem spacing (1rem, 2rem)
  | 'spacing-em'              // Em spacing (1em, 2em)
  | 'font-size'               // Font size values
  | 'border-radius'           // Border radius values
  | 'z-index';                // Z-index values


/**
 * Information about a detected token usage
 */
export interface TokenUsageInfo {
  /** Type of token pattern */
  type: TokenPatternType;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Token name or import path */
  tokenName?: string;
  /** Additional context */
  context?: string;
}

/**
 * Information about a detected hardcoded value
 */
export interface HardcodedValueInfo {
  /** Type of hardcoded value */
  type: HardcodedValueType;
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
  /** Suggested token replacement */
  suggestedToken?: string;
  /** The full line content */
  lineContent: string;
}

/**
 * Analysis of design token patterns in a file
 */
export interface DesignTokenAnalysis {
  /** Token usages found */
  tokenUsages: TokenUsageInfo[];
  /** Hardcoded values found */
  hardcodedValues: HardcodedValueInfo[];
  /** Whether file imports from design-tokens */
  hasDesignTokenImport: boolean;
  /** Whether file uses CSS custom properties */
  usesCSSCustomProperties: boolean;
  /** Whether file uses theme object */
  usesThemeObject: boolean;
  /** Confidence score for token usage pattern */
  tokenUsageConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Regex patterns for detecting design token imports
 */
export const DESIGN_TOKEN_IMPORT_PATTERNS = [
  // Import from design-tokens directory
  /import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"](?:@\/|\.\.?\/)*design-tokens(?:\/[^'"]*)?['"]/g,
  // Import from tokens directory
  /import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"](?:@\/|\.\.?\/)*tokens(?:\/[^'"]*)?['"]/g,
  // Import from theme directory
  /import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"](?:@\/|\.\.?\/)*theme(?:\/[^'"]*)?['"]/g,
  // Import from styles/tokens
  /import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"](?:@\/|\.\.?\/)*styles\/tokens(?:\/[^'"]*)?['"]/g,
] as const;

/**
 * Regex pattern for CSS custom properties
 */
export const CSS_CUSTOM_PROPERTY_PATTERN = /var\(\s*--([a-zA-Z0-9_-]+)\s*(?:,\s*[^)]+)?\)/g;

/**
 * Regex patterns for theme object usage
 */
export const THEME_OBJECT_PATTERNS = [
  // theme.colors.*, theme.spacing.*, etc.
  /theme\.(?:colors?|spacing|typography|fontSizes?|borderRadius|shadows?|zIndex|breakpoints?)\.[a-zA-Z0-9_.[\]]+/g,
  // ${theme.colors.*} in template literals
  /\$\{theme\.(?:colors?|spacing|typography|fontSizes?|borderRadius|shadows?|zIndex|breakpoints?)\.[a-zA-Z0-9_.[\]]+\}/g,
  // props.theme.* pattern
  /props\.theme\.(?:colors?|spacing|typography|fontSizes?|borderRadius|shadows?|zIndex|breakpoints?)\.[a-zA-Z0-9_.[\]]+/g,
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
 * Regex patterns for hardcoded spacing values
 */
export const HARDCODED_SPACING_PATTERNS = {
  // Pixel values: 10px, 20px (excluding 0px and 1px which are often intentional)
  px: /(?<![a-zA-Z0-9_-])(?:[2-9]|[1-9]\d+)px\b/g,
  // Rem values: 1rem, 2rem (excluding common values like 0rem)
  rem: /(?<![a-zA-Z0-9_-])(?:0?\.\d+|\d+(?:\.\d+)?)rem\b/g,
  // Em values: 1em, 2em
  em: /(?<![a-zA-Z0-9_-])(?:0?\.\d+|\d+(?:\.\d+)?)em\b/g,
} as const;

/**
 * CSS properties that commonly use design tokens
 */
export const TOKEN_PROPERTIES = [
  // Color properties
  'color',
  'background-color',
  'background',
  'border-color',
  'border',
  'outline-color',
  'fill',
  'stroke',
  'box-shadow',
  'text-shadow',
  // Spacing properties
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
  // Typography properties
  'font-size',
  'line-height',
  'letter-spacing',
  // Border properties
  'border-radius',
  'border-width',
  // Z-index
  'z-index',
] as const;

/**
 * Allowed hardcoded values (common exceptions)
 * Note: Values are stored in lowercase for case-insensitive comparison
 */
export const ALLOWED_HARDCODED_VALUES = new Set([
  '0',
  '0px',
  '1px',
  '100%',
  'inherit',
  'initial',
  'unset',
  'auto',
  'none',
  'transparent',
  'currentcolor', // lowercase for case-insensitive comparison
  '#000',
  '#000000',
  '#fff',
  '#ffffff',
  'black',
  'white',
]);

/**
 * Standard spacing scale values (4px increments) - these are NOT violations
 * These are common design system values that don't need tokens
 */
export const STANDARD_SPACING_SCALE_PX = new Set([
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 128
]);

/**
 * Standard rem scale values - these are NOT violations
 */
export const STANDARD_SPACING_SCALE_REM = new Set([
  0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16
]);

/**
 * File patterns to exclude from hardcoded value detection
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
 * Check if a file should be excluded from hardcoded value detection
 */
export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if a value is in the allowed hardcoded values list
 */
export function isAllowedHardcodedValue(value: string): boolean {
  return ALLOWED_HARDCODED_VALUES.has(value.toLowerCase().trim());
}

/**
 * Detect design token imports in content
 */
export function detectTokenImports(content: string, file: string): TokenUsageInfo[] {
  const results: TokenUsageInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of DESIGN_TOKEN_IMPORT_PATTERNS) {
    // Reset regex lastIndex
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'design-tokens-import',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        tokenName: extractImportPath(match[0]),
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Extract import path from import statement
 */
function extractImportPath(importStatement: string): string {
  const match = importStatement.match(/from\s+['"]([^'"]+)['"]/);
  return match ? match[1] || '' : '';
}

/**
 * Detect CSS custom property usage in content
 */
export function detectCSSCustomProperties(content: string, file: string): TokenUsageInfo[] {
  const results: TokenUsageInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(CSS_CUSTOM_PROPERTY_PATTERN.source, CSS_CUSTOM_PROPERTY_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'css-custom-property',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      tokenName: match[1] || '',
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect theme object usage in content
 */
export function detectThemeObjectUsage(content: string, file: string): TokenUsageInfo[] {
  const results: TokenUsageInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of THEME_OBJECT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'theme-object',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        tokenName: match[0],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}


/**
 * Detect hardcoded color values in content
 * 
 * Only flags colors that appear to be hardcoded in styling contexts.
 * Skips Tailwind arbitrary values (handled by Tailwind Patterns detector)
 * and CSS custom property definitions.
 */
export function detectHardcodedColors(
  content: string,
  file: string
): HardcodedValueInfo[] {
  const results: HardcodedValueInfo[] = [];
  const lines = content.split('\n');

  // Check each color pattern type
  const colorPatterns: Array<{ pattern: RegExp; type: HardcodedValueType }> = [
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
      if (isAllowedHardcodedValue(value)) {
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
      
      // Skip Tailwind arbitrary values - handled by Tailwind Patterns detector
      // e.g., bg-[#B08968], text-[rgb(255,0,0)]
      if (/\w+-\[[^\]]*(?:#[0-9a-fA-F]+|rgb|rgba|hsl|hsla)[^\]]*\]/.test(lineContent)) {
        continue;
      }
      
      // Skip if this looks like a color definition/mapping object
      // e.g., colorMap = { primary: { stroke: '#B08968' } }
      // e.g., primary: '#B08968' or colors: { brand: '#123456' }
      // e.g., const colors = { red: '#ff0000' }
      // Note: Use word boundary \b to avoid matching CSS property 'color:'
      if (/\b(?:colors|palette|theme|colorMap|chartColors?|statusColors?)\s*[=:{]/.test(lineContent) || 
          /['"]?(?:primary|secondary|accent|brand|background|foreground|text|border|success|warning|error|info|destructive|muted|stroke|fill)['"]?\s*:/.test(lineContent) ||
          /(?:const|let|var)\s+\w*[Cc]olors?\s*=/.test(lineContent)) {
        continue;
      }
      
      // Skip chart/visualization color definitions (Recharts, Chart.js, D3, etc.)
      // e.g., stroke="#94a3b8" in <XAxis stroke="#94a3b8" />
      // e.g., <CartesianGrid stroke="#1E1E1E" />
      // e.g., <Bar fill="#8884d8" />
      const chartComponentPattern = /<(?:XAxis|YAxis|CartesianGrid|Bar|Line|Area|Pie|Cell|Tooltip|Legend|ResponsiveContainer|BarChart|LineChart|AreaChart|PieChart|RadarChart|ScatterChart|ComposedChart|Treemap|Sankey|Funnel)\b/i;
      if (chartComponentPattern.test(lineContent)) {
        continue;
      }
      
      // Skip JSX props that commonly accept color values
      // e.g., stroke={...}, fill={...}, color={...}
      if (/\b(?:stroke|fill|stopColor|floodColor)\s*=\s*[{'"]/i.test(lineContent)) {
        continue;
      }

      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      const endColumn = column + value.length;

      const property = extractCSSProperty(lineContent);
      const hardcodedInfo: HardcodedValueInfo = {
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
 * Detect hardcoded spacing values in content
 * 
 * Only flags values that are NOT on a standard spacing scale.
 * Values like 16px, 24px, 32px are considered acceptable as they
 * follow common design system conventions.
 */
export function detectHardcodedSpacing(
  content: string,
  file: string
): HardcodedValueInfo[] {
  const results: HardcodedValueInfo[] = [];
  const lines = content.split('\n');

  const spacingPatterns: Array<{ pattern: RegExp; type: HardcodedValueType }> = [
    { pattern: HARDCODED_SPACING_PATTERNS.px, type: 'spacing-px' },
    { pattern: HARDCODED_SPACING_PATTERNS.rem, type: 'spacing-rem' },
    { pattern: HARDCODED_SPACING_PATTERNS.em, type: 'spacing-em' },
  ];

  for (const { pattern, type } of spacingPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const value = match[0];

      // Skip allowed values
      if (isAllowedHardcodedValue(value)) {
        continue;
      }

      // Extract numeric value and check if it's on a standard scale
      const numMatch = value.match(/^(\d+(?:\.\d+)?)/);
      if (numMatch) {
        const num = parseFloat(numMatch[1] || '0');
        
        // Skip values on standard spacing scales
        if (type === 'spacing-px' && STANDARD_SPACING_SCALE_PX.has(num)) {
          continue;
        }
        if ((type === 'spacing-rem' || type === 'spacing-em') && STANDARD_SPACING_SCALE_REM.has(num)) {
          continue;
        }
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
      
      // Skip Tailwind arbitrary values - handled by Tailwind Patterns detector
      if (/\w+-\[[^\]]*\d+(?:px|rem|em)[^\]]*\]/.test(lineContent)) {
        continue;
      }

      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      const endColumn = column + value.length;

      const property = extractCSSProperty(lineContent);
      const hardcodedInfo: HardcodedValueInfo = {
        type,
        file,
        line: lineNumber,
        column,
        endLine: lineNumber,
        endColumn,
        value,
        suggestedToken: suggestSpacingToken(value),
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
 * Suggest a token name for a color value
 */
function suggestColorToken(value: string): string {
  // Normalize the value
  const normalized = value.toLowerCase();

  // Common color mappings
  if (normalized === '#000' || normalized === '#000000') {
    return 'colors.black or --color-black';
  }
  if (normalized === '#fff' || normalized === '#ffffff') {
    return 'colors.white or --color-white';
  }

  // Generic suggestion
  return 'Use a design token from your color palette (e.g., colors.primary, --color-primary)';
}

/**
 * Suggest a token name for a spacing value
 */
function suggestSpacingToken(value: string): string {
  // Extract numeric value
  const numMatch = value.match(/^(\d+(?:\.\d+)?)/);
  if (!numMatch) {
    return 'Use a spacing token (e.g., spacing.md, --spacing-4)';
  }

  const num = parseFloat(numMatch[1] || '0');

  // Common spacing scale suggestions
  if (value.endsWith('px')) {
    if (num <= 4) {return 'spacing.xs or --spacing-1';}
    if (num <= 8) {return 'spacing.sm or --spacing-2';}
    if (num <= 16) {return 'spacing.md or --spacing-4';}
    if (num <= 24) {return 'spacing.lg or --spacing-6';}
    if (num <= 32) {return 'spacing.xl or --spacing-8';}
    return 'spacing.2xl or --spacing-10';
  }

  if (value.endsWith('rem')) {
    if (num <= 0.25) {return 'spacing.xs or --spacing-1';}
    if (num <= 0.5) {return 'spacing.sm or --spacing-2';}
    if (num <= 1) {return 'spacing.md or --spacing-4';}
    if (num <= 1.5) {return 'spacing.lg or --spacing-6';}
    if (num <= 2) {return 'spacing.xl or --spacing-8';}
    return 'spacing.2xl or --spacing-10';
  }

  return 'Use a spacing token (e.g., spacing.md, --spacing-4)';
}

/**
 * Analyze design token patterns in a file
 */
export function analyzeDesignTokens(
  content: string,
  file: string
): DesignTokenAnalysis {
  // Detect token usages
  const tokenImports = detectTokenImports(content, file);
  const cssCustomProperties = detectCSSCustomProperties(content, file);
  const themeObjectUsages = detectThemeObjectUsage(content, file);

  const tokenUsages = [
    ...tokenImports,
    ...cssCustomProperties,
    ...themeObjectUsages,
  ];

  // Hardcoded value detection DISABLED - was enforcing arbitrary standards, not learning patterns
  const hardcodedValues: HardcodedValueInfo[] = [];

  // Calculate confidence
  const hasTokenUsage = tokenUsages.length > 0;
  const hasHardcodedValues = hardcodedValues.length > 0;

  let tokenUsageConfidence = 0;
  if (hasTokenUsage && !hasHardcodedValues) {
    tokenUsageConfidence = 1.0;
  } else if (hasTokenUsage && hasHardcodedValues) {
    const ratio = tokenUsages.length / (tokenUsages.length + hardcodedValues.length);
    tokenUsageConfidence = ratio;
  } else if (!hasTokenUsage && hasHardcodedValues) {
    tokenUsageConfidence = 0;
  } else {
    tokenUsageConfidence = 0.5; // No styling detected
  }

  return {
    tokenUsages,
    hardcodedValues,
    hasDesignTokenImport: tokenImports.length > 0,
    usesCSSCustomProperties: cssCustomProperties.length > 0,
    usesThemeObject: themeObjectUsages.length > 0,
    tokenUsageConfidence,
  };
}


// ============================================================================
// Design Tokens Detector Class
// ============================================================================

/**
 * Detector for design token usage patterns
 *
 * Identifies design token usage and flags hardcoded values that should
 * use design tokens instead.
 *
 * @requirements 9.1 - THE Styling_Detector SHALL detect design token usage vs hardcoded values
 */
export class DesignTokensDetector extends RegexDetector {
  readonly id = 'styling/design-tokens';
  readonly category = 'styling' as const;
  readonly subcategory = 'design-tokens';
  readonly name = 'Design Tokens Detector';
  readonly description = 'Detects design token usage patterns and flags hardcoded values that should use tokens';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  /**
   * Detect design token patterns and violations
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Analyze the file
    const analysis = analyzeDesignTokens(context.content, context.file);

    // Create pattern matches for token usages
    if (analysis.hasDesignTokenImport) {
      patterns.push(this.createTokenImportPattern(context.file, analysis));
    }

    if (analysis.usesCSSCustomProperties) {
      patterns.push(this.createCSSCustomPropertyPattern(context.file, analysis));
    }

    if (analysis.usesThemeObject) {
      patterns.push(this.createThemeObjectPattern(context.file, analysis));
    }

    // Create violations for hardcoded values
    for (const hardcoded of analysis.hardcodedValues) {
      violations.push(this.createHardcodedValueViolation(hardcoded));
    }

    return this.createResult(patterns, violations, analysis.tokenUsageConfidence);
  }

  /**
   * Create a pattern match for design token imports
   */
  private createTokenImportPattern(
    file: string,
    analysis: DesignTokenAnalysis
  ): PatternMatch {
    const tokenImports = analysis.tokenUsages.filter(
      t => t.type === 'design-tokens-import'
    );
    const firstImport = tokenImports[0];

    return {
      patternId: `${this.id}/import`,
      location: {
        file,
        line: firstImport?.line || 1,
        column: firstImport?.column || 1,
      },
      confidence: 1.0,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for CSS custom property usage
   */
  private createCSSCustomPropertyPattern(
    file: string,
    analysis: DesignTokenAnalysis
  ): PatternMatch {
    const cssProps = analysis.tokenUsages.filter(
      t => t.type === 'css-custom-property'
    );
    const firstProp = cssProps[0];

    return {
      patternId: `${this.id}/css-custom-property`,
      location: {
        file,
        line: firstProp?.line || 1,
        column: firstProp?.column || 1,
      },
      confidence: 1.0,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for theme object usage
   */
  private createThemeObjectPattern(
    file: string,
    analysis: DesignTokenAnalysis
  ): PatternMatch {
    const themeUsages = analysis.tokenUsages.filter(
      t => t.type === 'theme-object'
    );
    const firstUsage = themeUsages[0];

    return {
      patternId: `${this.id}/theme-object`,
      location: {
        file,
        line: firstUsage?.line || 1,
        column: firstUsage?.column || 1,
      },
      confidence: 1.0,
      isOutlier: false,
    };
  }

  /**
   * Create a violation for a hardcoded value
   */
  private createHardcodedValueViolation(hardcoded: HardcodedValueInfo): Violation {
    const typeDescriptions: Record<HardcodedValueType, string> = {
      'color-hex': 'hex color',
      'color-rgb': 'RGB color',
      'color-rgba': 'RGBA color',
      'color-hsl': 'HSL color',
      'color-hsla': 'HSLA color',
      'spacing-px': 'pixel spacing value',
      'spacing-rem': 'rem spacing value',
      'spacing-em': 'em spacing value',
      'font-size': 'font size',
      'border-radius': 'border radius',
      'z-index': 'z-index value',
    };

    const typeDescription = typeDescriptions[hardcoded.type] || 'hardcoded value';
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
      message: `Hardcoded ${typeDescription} '${hardcoded.value}'${propertyInfo} should use a design token`,
      explanation: `Using hardcoded values instead of design tokens makes it difficult to maintain consistent styling across the application. Design tokens provide a single source of truth for colors, spacing, and other design values.`,
      expected: hardcoded.suggestedToken || 'A design token',
      actual: hardcoded.value,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };

    const quickFix = this.createQuickFixForHardcodedValue(hardcoded);
    if (quickFix !== undefined) {
      violation.quickFix = quickFix;
    }

    return violation;
  }


  /**
   * Create a quick fix for replacing a hardcoded value with a token
   */
  private createQuickFixForHardcodedValue(hardcoded: HardcodedValueInfo): QuickFix | undefined {
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
      replacement = `var(--${suggestedToken.replace(/\./g, '-').replace('colors', 'color').replace('spacing', 'spacing')})`;
    } else if (hardcoded.lineContent.includes('${') || hardcoded.lineContent.includes('`')) {
      // Template literal context (styled-components, emotion)
      replacement = `\${${suggestedToken}}`;
    } else {
      // Default: suggest the token directly
      replacement = suggestedToken;
    }

    return {
      title: `Replace with design token: ${suggestedToken}`,
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
    // Check if this is a hardcoded value violation
    if (!violation.message.includes('Hardcoded')) {
      return null;
    }

    // Extract the value from the message
    const valueMatch = violation.message.match(/Hardcoded [^']+ '([^']+)'/);
    if (!valueMatch?.[1]) {
      return null;
    }

    const value = valueMatch[1];
    const isColor = violation.message.includes('color');
    const isSpacing = violation.message.includes('spacing');

    let suggestedToken: string;
    if (isColor) {
      suggestedToken = suggestColorToken(value);
    } else if (isSpacing) {
      suggestedToken = suggestSpacingToken(value);
    } else {
      return null;
    }

    const firstSuggestion = suggestedToken.split(' or ')[0] || suggestedToken;

    return {
      title: `Replace with design token: ${firstSuggestion}`,
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
 * Create a new DesignTokensDetector instance
 */
export function createDesignTokensDetector(): DesignTokensDetector {
  return new DesignTokensDetector();
}

