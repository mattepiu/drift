/**
 * Tailwind Patterns Detector - Tailwind CSS pattern consistency detection
 *
 * Detects Tailwind CSS patterns including:
 * - Standard Tailwind utility classes
 * - Tailwind arbitrary values (e.g., p-[13px], text-[#ff0000])
 * - Tailwind responsive prefixes (sm:, md:, lg:, xl:, 2xl:)
 * - Tailwind state variants (hover:, focus:, active:, disabled:)
 * - Tailwind dark mode (dark:)
 * - @apply directive usage
 * - Tailwind config customizations
 *
 * Flags inconsistent Tailwind usage:
 * - Mixing arbitrary values with standard classes
 * - Inconsistent responsive breakpoint ordering
 * - Redundant/conflicting classes (e.g., flex and block on same element)
 * - Non-standard class ordering
 *
 * @requirements 9.6 - THE Styling_Detector SHALL detect Tailwind pattern consistency
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of Tailwind patterns detected
 */
export type TailwindPatternType =
  | 'utility-class'           // Standard Tailwind utility classes
  | 'arbitrary-value'         // Arbitrary values (p-[13px])
  | 'responsive-prefix'       // Responsive prefixes (sm:, md:, lg:)
  | 'state-variant'           // State variants (hover:, focus:)
  | 'dark-mode'               // Dark mode (dark:)
  | 'apply-directive'         // @apply directive usage
  | 'config-customization';   // Tailwind config customizations

/**
 * Types of Tailwind violations detected
 */
export type TailwindViolationType =
  | 'arbitrary-value-usage'        // Using arbitrary values instead of standard classes
  | 'inconsistent-breakpoint-order' // Inconsistent responsive breakpoint ordering
  | 'conflicting-classes'          // Redundant/conflicting classes
  | 'non-standard-ordering'        // Non-standard class ordering
  | 'mixed-arbitrary-standard';    // Mixing arbitrary and standard values

/**
 * Information about a detected Tailwind pattern
 */
export interface TailwindPatternInfo {
  /** Type of Tailwind pattern */
  type: TailwindPatternType;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Class name(s) detected */
  classNames: string[];
  /** Additional context */
  context?: string;
}

/**
 * Information about a detected Tailwind violation
 */
export interface TailwindViolationInfo {
  /** Type of Tailwind violation */
  type: TailwindViolationType;
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
  /** The problematic class name(s) */
  classNames: string[];
  /** Description of the issue */
  issue: string;
  /** Suggested fix */
  suggestedFix?: string;
  /** The full line content */
  lineContent: string;
}

/**
 * Analysis of Tailwind patterns in a file
 */
export interface TailwindAnalysis {
  /** Tailwind patterns found */
  patterns: TailwindPatternInfo[];
  /** Tailwind violations found */
  violations: TailwindViolationInfo[];
  /** Whether file uses standard utility classes */
  usesUtilityClasses: boolean;
  /** Whether file uses arbitrary values */
  usesArbitraryValues: boolean;
  /** Whether file uses responsive prefixes */
  usesResponsivePrefixes: boolean;
  /** Whether file uses state variants */
  usesStateVariants: boolean;
  /** Whether file uses dark mode */
  usesDarkMode: boolean;
  /** Whether file uses @apply directive */
  usesApplyDirective: boolean;
  /** Confidence score for Tailwind consistency */
  tailwindConsistencyConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Standard Tailwind utility class patterns
 */
export const TAILWIND_UTILITY_PATTERNS = [
  // Layout
  /\b(?:flex|grid|block|inline|inline-block|inline-flex|inline-grid|hidden|contents|flow-root)\b/g,
  /\b(?:flex-row|flex-col|flex-row-reverse|flex-col-reverse|flex-wrap|flex-nowrap|flex-wrap-reverse)\b/g,
  /\b(?:flex-1|flex-auto|flex-initial|flex-none)\b/g,
  /\b(?:grid-cols-\d+|grid-rows-\d+|col-span-\d+|row-span-\d+|col-start-\d+|col-end-\d+|row-start-\d+|row-end-\d+)\b/g,
  // Spacing
  /\b(?:p|px|py|pt|pr|pb|pl)-(?:\d+(?:\.\d+)?|auto|px)\b/g,
  /\b(?:m|mx|my|mt|mr|mb|ml)-(?:\d+(?:\.\d+)?|auto|px)\b/g,
  /\b(?:space-x|space-y)-(?:\d+(?:\.\d+)?|reverse)\b/g,
  /\b(?:gap|gap-x|gap-y)-\d+(?:\.\d+)?\b/g,
  // Sizing
  /\b(?:w|h|min-w|min-h|max-w|max-h|size)-(?:\d+(?:\/\d+)?|full|screen|auto|min|max|fit|px)\b/g,
  // Typography
  /\b(?:text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl))\b/g,
  /\b(?:font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black))\b/g,
  /\b(?:leading-(?:none|tight|snug|normal|relaxed|loose|\d+))\b/g,
  /\b(?:tracking-(?:tighter|tight|normal|wide|wider|widest))\b/g,
  // Colors
  /\b(?:text|bg|border|ring|divide|outline|accent|caret|fill|stroke)-(?:inherit|current|transparent|black|white)\b/g,
  /\b(?:text|bg|border|ring|divide|outline|accent|caret|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:\d{2,3}|50)\b/g,
  // Flexbox alignment
  /\b(?:items|justify|content|self|place-content|place-items|place-self)-(?:start|end|center|between|around|evenly|stretch|baseline|auto)\b/g,
  // Border
  /\b(?:border|border-t|border-r|border-b|border-l|border-x|border-y)(?:-\d+)?\b/g,
  /\b(?:rounded|rounded-t|rounded-r|rounded-b|rounded-l|rounded-tl|rounded-tr|rounded-bl|rounded-br|rounded-s|rounded-e|rounded-ss|rounded-se|rounded-es|rounded-ee)(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?\b/g,
  // Effects
  /\b(?:shadow|shadow-sm|shadow-md|shadow-lg|shadow-xl|shadow-2xl|shadow-inner|shadow-none)\b/g,
  /\b(?:opacity-\d+)\b/g,
  // Positioning
  /\b(?:relative|absolute|fixed|sticky|static)\b/g,
  /\b(?:top|right|bottom|left|inset|inset-x|inset-y)-(?:\d+(?:\/\d+)?|auto|px|full)\b/g,
  /\b(?:z-\d+|z-auto)\b/g,
  // Display
  /\b(?:overflow|overflow-x|overflow-y)-(?:auto|hidden|visible|scroll|clip)\b/g,
  // Transitions
  /\b(?:transition|transition-all|transition-colors|transition-opacity|transition-shadow|transition-transform|transition-none)\b/g,
  /\b(?:duration-\d+)\b/g,
  /\b(?:ease-linear|ease-in|ease-out|ease-in-out)\b/g,
  /\b(?:delay-\d+)\b/g,
  // Transforms
  /\b(?:scale|scale-x|scale-y)-\d+\b/g,
  /\b(?:rotate-\d+)\b/g,
  /\b(?:translate-x|translate-y)-(?:\d+(?:\/\d+)?|full|px)\b/g,
  /\b(?:skew-x|skew-y)-\d+\b/g,
  // Cursor
  /\b(?:cursor-(?:auto|default|pointer|wait|text|move|help|not-allowed|none|context-menu|progress|cell|crosshair|vertical-text|alias|copy|no-drop|grab|grabbing|all-scroll|col-resize|row-resize|n-resize|e-resize|s-resize|w-resize|ne-resize|nw-resize|se-resize|sw-resize|ew-resize|ns-resize|nesw-resize|nwse-resize|zoom-in|zoom-out))\b/g,
  // Pointer events
  /\b(?:pointer-events-(?:none|auto))\b/g,
  // User select
  /\b(?:select-(?:none|text|all|auto))\b/g,
  // Visibility
  /\b(?:visible|invisible|collapse)\b/g,
  // Whitespace
  /\b(?:whitespace-(?:normal|nowrap|pre|pre-line|pre-wrap|break-spaces))\b/g,
  // Word break
  /\b(?:break-(?:normal|words|all|keep))\b/g,
  // Text alignment
  /\b(?:text-(?:left|center|right|justify|start|end))\b/g,
  // Text decoration
  /\b(?:underline|overline|line-through|no-underline)\b/g,
  // Text transform
  /\b(?:uppercase|lowercase|capitalize|normal-case)\b/g,
  // Aspect ratio
  /\b(?:aspect-(?:auto|square|video))\b/g,
  // Object fit
  /\b(?:object-(?:contain|cover|fill|none|scale-down))\b/g,
] as const;

/**
 * Tailwind arbitrary value patterns
 * Matches: p-[13px], text-[#ff0000], w-[calc(100%-20px)], etc.
 */
export const TAILWIND_ARBITRARY_VALUE_PATTERN = /\b([a-z][a-z0-9-]*)-\[([^\]]+)\]/gi;

/**
 * Tailwind responsive prefix patterns
 * Matches: sm:, md:, lg:, xl:, 2xl:
 */
export const TAILWIND_RESPONSIVE_PREFIXES = ['sm', 'md', 'lg', 'xl', '2xl'] as const;
export const TAILWIND_RESPONSIVE_PATTERN = /\b(sm|md|lg|xl|2xl):([a-z][a-z0-9-]*(?:-[a-z0-9]+)*(?:\[[^\]]+\])?)/gi;

/**
 * Tailwind state variant patterns
 * Matches: hover:, focus:, active:, disabled:, etc.
 */
export const TAILWIND_STATE_VARIANTS = [
  'hover', 'focus', 'active', 'disabled', 'visited', 'focus-within', 'focus-visible',
  'first', 'last', 'odd', 'even', 'first-of-type', 'last-of-type', 'only-child', 'only-of-type',
  'empty', 'enabled', 'checked', 'indeterminate', 'default', 'required', 'valid', 'invalid',
  'in-range', 'out-of-range', 'placeholder-shown', 'autofill', 'read-only',
  'before', 'after', 'first-letter', 'first-line', 'marker', 'selection', 'file', 'backdrop', 'placeholder',
  'group-hover', 'group-focus', 'peer-hover', 'peer-focus', 'peer-checked',
] as const;
export const TAILWIND_STATE_VARIANT_PATTERN = new RegExp(
  `\\b(${TAILWIND_STATE_VARIANTS.join('|')}):([a-z][a-z0-9-]*(?:-[a-z0-9]+)*(?:\\[[^\\]]+\\])?)`,
  'gi'
);

/**
 * Tailwind dark mode pattern
 * Matches: dark:bg-gray-800, dark:text-white, etc.
 */
export const TAILWIND_DARK_MODE_PATTERN = /\bdark:([a-z][a-z0-9-]*(?:-[a-z0-9]+)*(?:\[[^\]]+\])?)/gi;

/**
 * @apply directive pattern
 * Matches: @apply flex items-center p-4;
 */
export const TAILWIND_APPLY_PATTERN = /@apply\s+([^;]+);?/gi;

/**
 * Tailwind config customization patterns
 */
export const TAILWIND_CONFIG_PATTERNS = [
  /theme:\s*\{/g,
  /extend:\s*\{/g,
  /plugins:\s*\[/g,
  /content:\s*\[/g,
] as const;

/**
 * Conflicting class pairs - classes that shouldn't be used together
 */
export const CONFLICTING_CLASS_PAIRS: Array<[RegExp, RegExp, string]> = [
  [/\bflex\b/, /\bgrid\b/, 'flex and grid'],
  [/\bflex\b/, /\bblock\b/, 'flex and block'],
  [/\bgrid\b/, /\bblock\b/, 'grid and block'],
  [/\bhidden\b/, /\bflex\b/, 'hidden and flex'],
  [/\bhidden\b/, /\bgrid\b/, 'hidden and grid'],
  [/\bhidden\b/, /\bblock\b/, 'hidden and block'],
  [/\bstatic\b/, /\brelative\b/, 'static and relative'],
  [/\bstatic\b/, /\babsolute\b/, 'static and absolute'],
  [/\bstatic\b/, /\bfixed\b/, 'static and fixed'],
  [/\bstatic\b/, /\bsticky\b/, 'static and sticky'],
  [/\brelative\b/, /\babsolute\b/, 'relative and absolute'],
  [/\brelative\b/, /\bfixed\b/, 'relative and fixed'],
  [/\babsolute\b/, /\bfixed\b/, 'absolute and fixed'],
  [/\bvisible\b/, /\binvisible\b/, 'visible and invisible'],
  [/\bunderline\b/, /\bno-underline\b/, 'underline and no-underline'],
  [/\buppercase\b/, /\blowercase\b/, 'uppercase and lowercase'],
  [/\buppercase\b/, /\bcapitalize\b/, 'uppercase and capitalize'],
  [/\blowercase\b/, /\bcapitalize\b/, 'lowercase and capitalize'],
];

/**
 * Recommended responsive breakpoint order
 */
export const RESPONSIVE_BREAKPOINT_ORDER = ['sm', 'md', 'lg', 'xl', '2xl'] as const;

/**
 * Recommended class ordering categories
 */
export const CLASS_ORDER_CATEGORIES = [
  'layout',      // flex, grid, block, hidden
  'position',    // relative, absolute, fixed, sticky
  'display',     // overflow, z-index
  'sizing',      // w-*, h-*, min-*, max-*
  'spacing',     // p-*, m-*, gap-*
  'border',      // border-*, rounded-*
  'background',  // bg-*
  'typography',  // text-*, font-*, leading-*
  'effects',     // shadow-*, opacity-*
  'transitions', // transition-*, duration-*, ease-*
  'transforms',  // scale-*, rotate-*, translate-*
] as const;

/**
 * File patterns to exclude from Tailwind detection
 */
export const EXCLUDED_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
  /tailwind\.config\.[jt]s$/,
  /postcss\.config\.[jt]s$/,
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file should be excluded from Tailwind detection
 */
export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(filePath));
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
 * Check if a class is a standard Tailwind utility class
 */
export function isTailwindUtilityClass(className: string): boolean {
  for (const pattern of TAILWIND_UTILITY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(className)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a class uses arbitrary values
 */
export function isArbitraryValueClass(className: string): boolean {
  // Create new regex to avoid lastIndex issues with global flag
  const regex = new RegExp(TAILWIND_ARBITRARY_VALUE_PATTERN.source, 'i');
  return regex.test(className);
}

/**
 * Check if a class has a responsive prefix
 */
export function hasResponsivePrefix(className: string): boolean {
  // Create new regex to avoid lastIndex issues with global flag
  const regex = new RegExp(TAILWIND_RESPONSIVE_PATTERN.source, 'i');
  return regex.test(className);
}

/**
 * Check if a class has a state variant
 */
export function hasStateVariant(className: string): boolean {
  // Create new regex to avoid lastIndex issues with global flag
  const regex = new RegExp(TAILWIND_STATE_VARIANT_PATTERN.source, 'i');
  return regex.test(className);
}

/**
 * Check if a class has dark mode prefix
 */
export function hasDarkModePrefix(className: string): boolean {
  // Create new regex to avoid lastIndex issues with global flag
  const regex = new RegExp(TAILWIND_DARK_MODE_PATTERN.source, 'i');
  return regex.test(className);
}

/**
 * Extract the base class from a prefixed class
 * e.g., "sm:flex" -> "flex", "hover:bg-blue-500" -> "bg-blue-500"
 */
export function extractBaseClass(className: string): string {
  // Remove responsive prefix
  let base = className.replace(/^(sm|md|lg|xl|2xl):/, '');
  // Remove state variant prefix
  base = base.replace(new RegExp(`^(${TAILWIND_STATE_VARIANTS.join('|')}):`, 'i'), '');
  // Remove dark mode prefix
  base = base.replace(/^dark:/, '');
  return base;
}

/**
 * Get the responsive breakpoint from a class
 */
export function getResponsiveBreakpoint(className: string): string | null {
  const match = className.match(/^(sm|md|lg|xl|2xl):/);
  return match ? match[1]! : null;
}

/**
 * Get the breakpoint order index
 */
export function getBreakpointOrderIndex(breakpoint: string): number {
  return RESPONSIVE_BREAKPOINT_ORDER.indexOf(breakpoint as typeof RESPONSIVE_BREAKPOINT_ORDER[number]);
}

/**
 * Detect standard Tailwind utility classes in content
 */
export function detectUtilityClasses(content: string, file: string): TailwindPatternInfo[] {
  const results: TailwindPatternInfo[] = [];
  const lines = content.split('\n');
  const seenMatches = new Set<string>();

  for (const pattern of TAILWIND_UTILITY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const key = `${match.index}-${match[0]}`;
      if (seenMatches.has(key)) {continue;}
      seenMatches.add(key);

      // Skip if inside a comment
      if (isInsideComment(content, match.index)) {
        continue;
      }

      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'utility-class',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        classNames: [match[0]],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Detect Tailwind arbitrary value classes
 */
export function detectArbitraryValues(content: string, file: string): TailwindPatternInfo[] {
  const results: TailwindPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(TAILWIND_ARBITRARY_VALUE_PATTERN.source, TAILWIND_ARBITRARY_VALUE_PATTERN.flags);
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
      type: 'arbitrary-value',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      classNames: [match[0]],
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect Tailwind responsive prefix usage
 */
export function detectResponsivePrefixes(content: string, file: string): TailwindPatternInfo[] {
  const results: TailwindPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(TAILWIND_RESPONSIVE_PATTERN.source, TAILWIND_RESPONSIVE_PATTERN.flags);
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
      type: 'responsive-prefix',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      classNames: [match[0]],
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect Tailwind state variant usage
 */
export function detectStateVariants(content: string, file: string): TailwindPatternInfo[] {
  const results: TailwindPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(TAILWIND_STATE_VARIANT_PATTERN.source, TAILWIND_STATE_VARIANT_PATTERN.flags);
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
      type: 'state-variant',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      classNames: [match[0]],
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect Tailwind dark mode usage
 */
export function detectDarkMode(content: string, file: string): TailwindPatternInfo[] {
  const results: TailwindPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(TAILWIND_DARK_MODE_PATTERN.source, TAILWIND_DARK_MODE_PATTERN.flags);
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
      type: 'dark-mode',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      classNames: [match[0]],
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect @apply directive usage
 */
export function detectApplyDirective(content: string, file: string): TailwindPatternInfo[] {
  const results: TailwindPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(TAILWIND_APPLY_PATTERN.source, TAILWIND_APPLY_PATTERN.flags);
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

    const classes = match[1]?.trim().split(/\s+/) || [];

    results.push({
      type: 'apply-directive',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      classNames: classes,
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect Tailwind config customizations
 */
export function detectConfigCustomizations(content: string, file: string): TailwindPatternInfo[] {
  const results: TailwindPatternInfo[] = [];
  const lines = content.split('\n');

  // Only check config files
  if (!file.includes('tailwind.config')) {
    return results;
  }

  for (const pattern of TAILWIND_CONFIG_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'config-customization',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        classNames: [],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Extract all class names from a className attribute
 */
function extractClassNamesFromLine(line: string): string[] {
  const classNames: string[] = [];
  
  // Match className="..." or class="..."
  const classAttrMatch = line.match(/(?:className|class)=["']([^"']+)["']/);
  if (classAttrMatch?.[1]) {
    classNames.push(...classAttrMatch[1].split(/\s+/).filter(Boolean));
  }
  
  // Match className={`...`} template literals
  const templateMatch = line.match(/(?:className|class)=\{`([^`]+)`\}/);
  if (templateMatch?.[1]) {
    // Extract static parts (ignore ${...} expressions)
    const staticParts = templateMatch[1].replace(/\$\{[^}]+\}/g, ' ');
    classNames.push(...staticParts.split(/\s+/).filter(Boolean));
  }
  
  // Match @apply directive
  const applyMatch = line.match(/@apply\s+([^;]+)/);
  if (applyMatch?.[1]) {
    classNames.push(...applyMatch[1].split(/\s+/).filter(Boolean));
  }
  
  return classNames;
}

/**
 * Detect arbitrary value usage violations
 */
export function detectArbitraryValueViolations(
  arbitraryPatterns: TailwindPatternInfo[],
  _utilityPatterns: TailwindPatternInfo[],
  file: string
): TailwindViolationInfo[] {
  const results: TailwindViolationInfo[] = [];

  for (const arbitrary of arbitraryPatterns) {
    // Only flag arbitrary values when there's a clear standard alternative
    // Don't flag things like h-[90vh], bg-[#B08968], w-[calc(...)] - these are legitimate escape hatches
    const suggestedFix = suggestStandardClass(arbitrary.matchedText);
    
    // Only create a violation if we have a concrete suggestion
    if (suggestedFix) {
      const violation: TailwindViolationInfo = {
        type: 'arbitrary-value-usage',
        file,
        line: arbitrary.line,
        column: arbitrary.column,
        endLine: arbitrary.line,
        endColumn: arbitrary.column + arbitrary.matchedText.length,
        classNames: [arbitrary.matchedText],
        issue: `Arbitrary value '${arbitrary.matchedText}' can be replaced with standard class '${suggestedFix}'`,
        suggestedFix,
        lineContent: arbitrary.context || '',
      };
      results.push(violation);
    }
    // Don't flag arbitrary values without clear alternatives - they're legitimate Tailwind escape hatches
  }

  return results;
}

/**
 * Suggest a standard Tailwind class for an arbitrary value
 */
export function suggestStandardClass(arbitraryClass: string): string | undefined {
  const match = arbitraryClass.match(/^([a-z][a-z0-9-]*)-\[([^\]]+)\]$/i);
  if (!match) {return undefined;}

  const [, property, value] = match;
  
  // Handle pixel values
  const pxMatch = value?.match(/^(\d+)px$/);
  if (pxMatch && property) {
    const px = parseInt(pxMatch[1]!, 10);
    // Tailwind uses 4px = 1 unit
    const tailwindUnit = px / 4;
    if (Number.isInteger(tailwindUnit) && tailwindUnit >= 0 && tailwindUnit <= 96) {
      return `${property}-${tailwindUnit}`;
    }
  }

  // Handle rem values
  const remMatch = value?.match(/^(\d+(?:\.\d+)?)rem$/);
  if (remMatch && property) {
    const rem = parseFloat(remMatch[1]!);
    // Tailwind uses 0.25rem = 1 unit
    const tailwindUnit = rem / 0.25;
    if (Number.isInteger(tailwindUnit) && tailwindUnit >= 0 && tailwindUnit <= 96) {
      return `${property}-${tailwindUnit}`;
    }
  }

  // Handle percentage values for width/height
  if ((property === 'w' || property === 'h') && value) {
    if (value === '100%') {return `${property}-full`;}
    if (value === '50%') {return `${property}-1/2`;}
    if (value === '33.333333%' || value === '33.33%') {return `${property}-1/3`;}
    if (value === '66.666667%' || value === '66.67%') {return `${property}-2/3`;}
    if (value === '25%') {return `${property}-1/4`;}
    if (value === '75%') {return `${property}-3/4`;}
  }

  return undefined;
}

/**
 * Detect conflicting class violations
 */
export function detectConflictingClasses(content: string, file: string): TailwindViolationInfo[] {
  const results: TailwindViolationInfo[] = [];
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const classNames = extractClassNamesFromLine(line);
    
    if (classNames.length === 0) {continue;}

    // Check for conflicting pairs
    for (const [pattern1, pattern2, description] of CONFLICTING_CLASS_PAIRS) {
      const hasFirst = classNames.some(cn => pattern1.test(cn));
      const hasSecond = classNames.some(cn => pattern2.test(cn));

      if (hasFirst && hasSecond) {
        const conflictingClasses = classNames.filter(cn => pattern1.test(cn) || pattern2.test(cn));
        
        // Find the position of the first conflicting class
        const firstClass = conflictingClasses[0]!;
        const classIndex = line.indexOf(firstClass);
        const column = classIndex >= 0 ? classIndex + 1 : 1;

        results.push({
          type: 'conflicting-classes',
          file,
          line: lineIndex + 1,
          column,
          endLine: lineIndex + 1,
          endColumn: column + conflictingClasses.join(' ').length,
          classNames: conflictingClasses,
          issue: `Conflicting classes: ${description}`,
          suggestedFix: `Remove one of the conflicting classes: ${conflictingClasses.join(', ')}`,
          lineContent: line,
        });
      }
    }
  }

  return results;
}

/**
 * Detect inconsistent responsive breakpoint ordering
 */
export function detectInconsistentBreakpointOrder(content: string, file: string): TailwindViolationInfo[] {
  const results: TailwindViolationInfo[] = [];
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const classNames = extractClassNamesFromLine(line);
    
    if (classNames.length === 0) {continue;}

    // Group classes by their property prefix (e.g., 'p' for p-4, 'flex' for flex)
    const classGroups = new Map<string, Array<{ className: string; breakpoint: string | null; index: number }>>();
    
    classNames.forEach((className, index) => {
      const breakpoint = getResponsiveBreakpoint(className);
      const baseClass = extractBaseClass(className);
      
      // Extract property prefix (e.g., 'p' from 'p-4', 'flex' from 'flex')
      const propertyMatch = baseClass.match(/^([a-z]+(?:-[a-z]+)*?)(?:-\d|$)/i);
      const propertyPrefix = propertyMatch ? propertyMatch[1]! : baseClass;
      
      if (!classGroups.has(propertyPrefix)) {
        classGroups.set(propertyPrefix, []);
      }
      classGroups.get(propertyPrefix)!.push({ className, breakpoint, index });
    });

    // Check each group for proper ordering
    for (const [propertyPrefix, group] of classGroups) {
      const responsiveClasses = group.filter(g => g.breakpoint !== null);
      
      if (responsiveClasses.length < 2) {continue;}

      // Check if breakpoints are in order (by their position in the class list)
      // Sort by their original index to check order
      const sortedByIndex = [...responsiveClasses].sort((a, b) => a.index - b.index);
      
      let lastBreakpointIndex = -1;
      let isOutOfOrder = false;
      let outOfOrderClasses: string[] = [];

      for (const { breakpoint } of sortedByIndex) {
        const breakpointIndex = getBreakpointOrderIndex(breakpoint!);
        if (breakpointIndex < lastBreakpointIndex) {
          isOutOfOrder = true;
          outOfOrderClasses = sortedByIndex.map(r => r.className);
          break;
        }
        lastBreakpointIndex = breakpointIndex;
      }

      if (isOutOfOrder) {
        const firstClass = outOfOrderClasses[0]!;
        const classIndex = line.indexOf(firstClass);
        const column = classIndex >= 0 ? classIndex + 1 : 1;

        // Sort classes by breakpoint order
        const sortedClasses = [...responsiveClasses]
          .sort((a, b) => getBreakpointOrderIndex(a.breakpoint!) - getBreakpointOrderIndex(b.breakpoint!))
          .map(r => r.className);

        results.push({
          type: 'inconsistent-breakpoint-order',
          file,
          line: lineIndex + 1,
          column,
          endLine: lineIndex + 1,
          endColumn: column + outOfOrderClasses.join(' ').length,
          classNames: outOfOrderClasses,
          issue: `Responsive breakpoints for '${propertyPrefix}' are not in mobile-first order (sm → md → lg → xl → 2xl)`,
          suggestedFix: `Reorder to: ${sortedClasses.join(' ')}`,
          lineContent: line,
        });
      }
    }
  }

  return results;
}

/**
 * Detect mixed arbitrary and standard values for the same property
 */
export function detectMixedArbitraryStandard(
  arbitraryPatterns: TailwindPatternInfo[],
  utilityPatterns: TailwindPatternInfo[],
  file: string
): TailwindViolationInfo[] {
  const results: TailwindViolationInfo[] = [];

  // Group patterns by property prefix
  const arbitraryByProperty = new Map<string, TailwindPatternInfo[]>();
  const standardByProperty = new Map<string, TailwindPatternInfo[]>();

  for (const pattern of arbitraryPatterns) {
    const property = pattern.matchedText.split('-[')[0] || '';
    if (!arbitraryByProperty.has(property)) {
      arbitraryByProperty.set(property, []);
    }
    arbitraryByProperty.get(property)!.push(pattern);
  }

  for (const pattern of utilityPatterns) {
    const property = pattern.matchedText.split('-')[0] || '';
    if (!standardByProperty.has(property)) {
      standardByProperty.set(property, []);
    }
    standardByProperty.get(property)!.push(pattern);
  }

  // Find properties that have both arbitrary and standard values
  for (const [property, arbitraryList] of arbitraryByProperty) {
    if (standardByProperty.has(property)) {
      const standardList = standardByProperty.get(property)!;
      
      // Only flag if there are multiple instances suggesting inconsistency
      if (arbitraryList.length > 0 && standardList.length > 0) {
        const firstArbitrary = arbitraryList[0]!;
        
        results.push({
          type: 'mixed-arbitrary-standard',
          file,
          line: firstArbitrary.line,
          column: firstArbitrary.column,
          endLine: firstArbitrary.line,
          endColumn: firstArbitrary.column + firstArbitrary.matchedText.length,
          classNames: [
            ...arbitraryList.map(p => p.matchedText),
            ...standardList.map(p => p.matchedText),
          ],
          issue: `Mixed arbitrary and standard values for '${property}' property`,
          suggestedFix: `Consider using consistent values - either all standard Tailwind classes or all arbitrary values for '${property}'`,
          lineContent: firstArbitrary.context || '',
        });
      }
    }
  }

  return results;
}

/**
 * Analyze Tailwind patterns in a file
 */
export function analyzeTailwindPatterns(content: string, file: string): TailwindAnalysis {
  // Skip excluded files
  if (shouldExcludeFile(file)) {
    return {
      patterns: [],
      violations: [],
      usesUtilityClasses: false,
      usesArbitraryValues: false,
      usesResponsivePrefixes: false,
      usesStateVariants: false,
      usesDarkMode: false,
      usesApplyDirective: false,
      tailwindConsistencyConfidence: 1.0,
    };
  }

  // Detect all patterns
  const utilityClasses = detectUtilityClasses(content, file);
  const arbitraryValues = detectArbitraryValues(content, file);
  const responsivePrefixes = detectResponsivePrefixes(content, file);
  const stateVariants = detectStateVariants(content, file);
  const darkMode = detectDarkMode(content, file);
  const applyDirective = detectApplyDirective(content, file);
  const configCustomizations = detectConfigCustomizations(content, file);

  const allPatterns = [
    ...utilityClasses,
    ...arbitraryValues,
    ...responsivePrefixes,
    ...stateVariants,
    ...darkMode,
    ...applyDirective,
    ...configCustomizations,
  ];

  // Detect violations
  // NOTE: We've disabled most violation detection because:
  // 1. Arbitrary values are intentional Tailwind escape hatches, not violations
  // 2. "Mixed arbitrary and standard" is a normal pattern, not a problem
  // 3. "Conflicting classes" often aren't conflicts (e.g., conditional rendering)
  // 
  // The detector should focus on detecting PATTERNS, not enforcing arbitrary rules.
  // Violations should only be flagged when there's clear inconsistency within
  // the project's own established patterns.
  
  // Disabled: arbitraryViolations - arbitrary values are intentional
  // Disabled: mixedViolations - mixing is fine
  // Disabled: conflictingViolations - too many false positives
  // Disabled: breakpointViolations - drift learns patterns, doesn't enforce ordering rules
  // const breakpointViolations = detectInconsistentBreakpointOrder(content, file);

  const allViolations: TailwindViolationInfo[] = [
    // All violations disabled - drift is a pattern-learning tool, not a linter
  ];

  // Calculate confidence
  const hasPatterns = allPatterns.length > 0;
  const hasViolations = allViolations.length > 0;

  let tailwindConsistencyConfidence = 0;
  if (hasPatterns && !hasViolations) {
    tailwindConsistencyConfidence = 1.0;
  } else if (hasPatterns && hasViolations) {
    const ratio = allPatterns.length / (allPatterns.length + allViolations.length);
    tailwindConsistencyConfidence = ratio;
  } else if (!hasPatterns && hasViolations) {
    tailwindConsistencyConfidence = 0;
  } else {
    tailwindConsistencyConfidence = 0.5; // No Tailwind detected
  }

  return {
    patterns: allPatterns,
    violations: allViolations,
    usesUtilityClasses: utilityClasses.length > 0,
    usesArbitraryValues: arbitraryValues.length > 0,
    usesResponsivePrefixes: responsivePrefixes.length > 0,
    usesStateVariants: stateVariants.length > 0,
    usesDarkMode: darkMode.length > 0,
    usesApplyDirective: applyDirective.length > 0,
    tailwindConsistencyConfidence,
  };
}

// ============================================================================
// Tailwind Patterns Detector Class
// ============================================================================

/**
 * Detector for Tailwind CSS pattern consistency
 *
 * Identifies Tailwind patterns and flags inconsistent usage.
 *
 * @requirements 9.6 - THE Styling_Detector SHALL detect Tailwind pattern consistency
 */
export class TailwindPatternsDetector extends RegexDetector {
  readonly id = 'styling/tailwind-patterns';
  readonly category = 'styling' as const;
  readonly subcategory = 'tailwind-patterns';
  readonly name = 'Tailwind Patterns Detector';
  readonly description = 'Detects Tailwind CSS patterns and flags inconsistent usage';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  /**
   * Detect Tailwind patterns and violations
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Analyze the file
    const analysis = analyzeTailwindPatterns(context.content, context.file);

    // Create pattern matches for Tailwind patterns
    if (analysis.usesUtilityClasses) {
      patterns.push(this.createUtilityClassPattern(context.file, analysis));
    }

    if (analysis.usesArbitraryValues) {
      patterns.push(this.createArbitraryValuePattern(context.file, analysis));
    }

    if (analysis.usesResponsivePrefixes) {
      patterns.push(this.createResponsivePrefixPattern(context.file, analysis));
    }

    if (analysis.usesStateVariants) {
      patterns.push(this.createStateVariantPattern(context.file, analysis));
    }

    if (analysis.usesDarkMode) {
      patterns.push(this.createDarkModePattern(context.file, analysis));
    }

    if (analysis.usesApplyDirective) {
      patterns.push(this.createApplyDirectivePattern(context.file, analysis));
    }

    // Create violations
    for (const violation of analysis.violations) {
      violations.push(this.createTailwindViolation(violation));
    }

    return this.createResult(patterns, violations, analysis.tailwindConsistencyConfidence);
  }

  /**
   * Create a pattern match for utility class usage
   */
  private createUtilityClassPattern(file: string, analysis: TailwindAnalysis): PatternMatch {
    const utilityPatterns = analysis.patterns.filter(p => p.type === 'utility-class');
    const firstPattern = utilityPatterns[0];

    return {
      patternId: `${this.id}/utility-class`,
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
   * Create a pattern match for arbitrary value usage
   */
  private createArbitraryValuePattern(file: string, analysis: TailwindAnalysis): PatternMatch {
    const arbitraryPatterns = analysis.patterns.filter(p => p.type === 'arbitrary-value');
    const firstPattern = arbitraryPatterns[0];

    return {
      patternId: `${this.id}/arbitrary-value`,
      location: {
        file,
        line: firstPattern?.line || 1,
        column: firstPattern?.column || 1,
      },
      confidence: 0.7, // Lower confidence for arbitrary values
      isOutlier: true, // Arbitrary values are considered outliers
    };
  }

  /**
   * Create a pattern match for responsive prefix usage
   */
  private createResponsivePrefixPattern(file: string, analysis: TailwindAnalysis): PatternMatch {
    const responsivePatterns = analysis.patterns.filter(p => p.type === 'responsive-prefix');
    const firstPattern = responsivePatterns[0];

    return {
      patternId: `${this.id}/responsive-prefix`,
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
   * Create a pattern match for state variant usage
   */
  private createStateVariantPattern(file: string, analysis: TailwindAnalysis): PatternMatch {
    const statePatterns = analysis.patterns.filter(p => p.type === 'state-variant');
    const firstPattern = statePatterns[0];

    return {
      patternId: `${this.id}/state-variant`,
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
   * Create a pattern match for dark mode usage
   */
  private createDarkModePattern(file: string, analysis: TailwindAnalysis): PatternMatch {
    const darkModePatterns = analysis.patterns.filter(p => p.type === 'dark-mode');
    const firstPattern = darkModePatterns[0];

    return {
      patternId: `${this.id}/dark-mode`,
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
   * Create a pattern match for @apply directive usage
   */
  private createApplyDirectivePattern(file: string, analysis: TailwindAnalysis): PatternMatch {
    const applyPatterns = analysis.patterns.filter(p => p.type === 'apply-directive');
    const firstPattern = applyPatterns[0];

    return {
      patternId: `${this.id}/apply-directive`,
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
   * Create a violation for a Tailwind issue
   */
  private createTailwindViolation(info: TailwindViolationInfo): Violation {
    const typeDescriptions: Record<TailwindViolationType, string> = {
      'arbitrary-value-usage': 'Arbitrary value usage',
      'inconsistent-breakpoint-order': 'Inconsistent breakpoint order',
      'conflicting-classes': 'Conflicting classes',
      'non-standard-ordering': 'Non-standard class ordering',
      'mixed-arbitrary-standard': 'Mixed arbitrary and standard values',
    };

    const typeDescription = typeDescriptions[info.type] || 'Tailwind issue';
    const severity = this.getSeverityForViolationType(info.type);

    const violation: Violation = {
      id: `${this.id}-${info.file}-${info.line}-${info.column}`,
      patternId: this.id,
      severity,
      file: info.file,
      range: {
        start: { line: info.line - 1, character: info.column - 1 },
        end: { line: info.endLine - 1, character: info.endColumn - 1 },
      },
      message: `${typeDescription}: ${info.issue}`,
      explanation: this.getExplanationForViolationType(info.type),
      expected: info.suggestedFix || 'Consistent Tailwind usage',
      actual: info.classNames.join(', '),
      aiExplainAvailable: true,
      aiFixAvailable: info.type === 'conflicting-classes' || info.type === 'inconsistent-breakpoint-order',
      firstSeen: new Date(),
      occurrences: 1,
    };

    const quickFix = this.createQuickFixForViolation(info);
    if (quickFix !== undefined) {
      violation.quickFix = quickFix;
    }

    return violation;
  }

  /**
   * Get severity for a violation type
   */
  private getSeverityForViolationType(type: TailwindViolationType): 'error' | 'warning' | 'info' | 'hint' {
    switch (type) {
      case 'conflicting-classes':
        return 'warning';
      case 'inconsistent-breakpoint-order':
        return 'info';
      case 'arbitrary-value-usage':
        return 'info';
      case 'mixed-arbitrary-standard':
        return 'info';
      case 'non-standard-ordering':
        return 'hint';
      default:
        return 'info';
    }
  }

  /**
   * Get explanation for a violation type
   */
  private getExplanationForViolationType(type: TailwindViolationType): string {
    switch (type) {
      case 'arbitrary-value-usage':
        return 'Using arbitrary values (e.g., p-[13px]) instead of standard Tailwind classes can lead to inconsistent spacing and make the design system harder to maintain. Consider using standard Tailwind spacing values.';
      case 'inconsistent-breakpoint-order':
        return 'Tailwind uses a mobile-first approach. Responsive classes should be ordered from smallest to largest breakpoint (sm → md → lg → xl → 2xl) for better readability and maintainability.';
      case 'conflicting-classes':
        return 'These classes conflict with each other and may cause unexpected behavior. Only one of these classes should be applied at a time.';
      case 'non-standard-ordering':
        return 'Following a consistent class ordering convention improves readability. Consider ordering classes by: layout → position → sizing → spacing → border → background → typography → effects.';
      case 'mixed-arbitrary-standard':
        return 'Mixing arbitrary values with standard Tailwind classes for the same property can lead to inconsistent styling. Consider using either all standard classes or all arbitrary values consistently.';
      default:
        return 'Consistent Tailwind usage improves code maintainability and design system adherence.';
    }
  }

  /**
   * Create a quick fix for a Tailwind violation
   */
  private createQuickFixForViolation(info: TailwindViolationInfo): QuickFix | undefined {
    if (info.type === 'inconsistent-breakpoint-order' && info.suggestedFix) {
      return {
        title: `Reorder breakpoints: ${info.suggestedFix}`,
        kind: 'quickfix',
        edit: {
          changes: {
            [info.file]: [
              {
                range: {
                  start: { line: info.line - 1, character: info.column - 1 },
                  end: { line: info.endLine - 1, character: info.endColumn - 1 },
                },
                newText: info.suggestedFix,
              },
            ],
          },
        },
        isPreferred: true,
        confidence: 0.9,
        preview: `Reorder to: ${info.suggestedFix}`,
      };
    }

    if (info.type === 'arbitrary-value-usage' && info.suggestedFix) {
      const standardClass = suggestStandardClass(info.classNames[0] || '');
      if (standardClass) {
        return {
          title: `Use standard class: ${standardClass}`,
          kind: 'quickfix',
          edit: {
            changes: {
              [info.file]: [
                {
                  range: {
                    start: { line: info.line - 1, character: info.column - 1 },
                    end: { line: info.endLine - 1, character: info.endColumn - 1 },
                  },
                  newText: standardClass,
                },
              ],
            },
          },
          isPreferred: true,
          confidence: 0.8,
          preview: `Replace '${info.classNames[0]}' with '${standardClass}'`,
        };
      }
    }

    return undefined;
  }

  /**
   * Generate a quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Check if this is a breakpoint order violation
    if (violation.message.includes('breakpoint order') && violation.expected !== 'Consistent Tailwind usage') {
      return {
        title: `Reorder breakpoints`,
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
        confidence: 0.9,
        preview: `Reorder to: ${violation.expected}`,
      };
    }

    // Check if this is an arbitrary value violation with a suggestion
    if (violation.message.includes('Arbitrary value') && violation.actual) {
      const standardClass = suggestStandardClass(violation.actual);
      if (standardClass) {
        return {
          title: `Use standard class: ${standardClass}`,
          kind: 'quickfix',
          edit: {
            changes: {
              [violation.file]: [
                {
                  range: violation.range,
                  newText: standardClass,
                },
              ],
            },
          },
          isPreferred: true,
          confidence: 0.8,
          preview: `Replace '${violation.actual}' with '${standardClass}'`,
        };
      }
    }

    return null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TailwindPatternsDetector instance
 */
export function createTailwindPatternsDetector(): TailwindPatternsDetector {
  return new TailwindPatternsDetector();
}
