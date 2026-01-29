/**
 * Responsive Detector - Breakpoint usage pattern detection
 *
 * Detects responsive breakpoint patterns including:
 * - Tailwind responsive prefixes (sm:, md:, lg:, xl:, 2xl:)
 * - CSS media queries (@media (min-width: ...), @media (max-width: ...))
 * - CSS container queries (@container)
 * - Theme breakpoint usage (theme.breakpoints.*, theme.screens.*)
 * - CSS custom property breakpoints (var(--breakpoint-*))
 * - Mobile-first vs desktop-first approaches
 *
 * Flags inconsistent responsive usage:
 * - Inconsistent breakpoint ordering (e.g., lg: before md:)
 * - Mixing mobile-first and desktop-first approaches
 * - Arbitrary breakpoint values not matching the design system
 * - Missing responsive variants for key breakpoints
 * - Hardcoded pixel values in media queries instead of using design tokens
 *
 * @requirements 9.8 - THE Styling_Detector SHALL detect responsive breakpoint usage patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of responsive patterns detected
 */
export type ResponsivePatternType =
  | 'tailwind-responsive'      // Tailwind responsive prefixes (sm:, md:, lg:, xl:, 2xl:)
  | 'css-media-query'          // CSS media queries (@media)
  | 'css-container-query'      // CSS container queries (@container)
  | 'theme-breakpoint'         // Theme breakpoint usage (theme.breakpoints.*)
  | 'css-breakpoint-property'  // CSS custom property breakpoints (var(--breakpoint-*))
  | 'mobile-first'             // Mobile-first approach (min-width)
  | 'desktop-first';           // Desktop-first approach (max-width)

/**
 * Types of responsive violations detected
 */
export type ResponsiveViolationType =
  | 'inconsistent-breakpoint-order'  // Breakpoints not in correct order
  | 'mixed-approach'                 // Mixing mobile-first and desktop-first
  | 'arbitrary-breakpoint'           // Arbitrary breakpoint value not in design system
  | 'hardcoded-media-query'          // Hardcoded pixel value in media query
  | 'missing-responsive-variant';    // Missing responsive variant for key breakpoint


/**
 * Information about a detected responsive pattern
 */
export interface ResponsivePatternInfo {
  /** Type of responsive pattern */
  type: ResponsivePatternType;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Breakpoint name or value */
  breakpoint?: string;
  /** Breakpoint value in pixels (if applicable) */
  breakpointValue?: number;
  /** Additional context */
  context?: string;
}

/**
 * Information about a detected responsive violation
 */
export interface ResponsiveViolationInfo {
  /** Type of responsive violation */
  type: ResponsiveViolationType;
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
  /** The problematic breakpoint(s) */
  breakpoints: string[];
  /** Description of the issue */
  issue: string;
  /** Suggested fix */
  suggestedFix?: string;
  /** The full line content */
  lineContent: string;
}

/**
 * Analysis of responsive patterns in a file
 */
export interface ResponsiveAnalysis {
  /** Responsive patterns found */
  patterns: ResponsivePatternInfo[];
  /** Responsive violations found */
  violations: ResponsiveViolationInfo[];
  /** Whether file uses Tailwind responsive prefixes */
  usesTailwindResponsive: boolean;
  /** Whether file uses CSS media queries */
  usesCSSMediaQueries: boolean;
  /** Whether file uses CSS container queries */
  usesCSSContainerQueries: boolean;
  /** Whether file uses theme breakpoints */
  usesThemeBreakpoints: boolean;
  /** Whether file uses CSS custom property breakpoints */
  usesCSSBreakpointProperties: boolean;
  /** Whether file uses mobile-first approach */
  usesMobileFirst: boolean;
  /** Whether file uses desktop-first approach */
  usesDesktopFirst: boolean;
  /** Confidence score for responsive consistency */
  responsiveConsistencyConfidence: number;
}


// ============================================================================
// Constants
// ============================================================================

/**
 * Standard Tailwind breakpoints (in pixels)
 */
export const TAILWIND_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/**
 * Tailwind breakpoint order (mobile-first)
 */
export const TAILWIND_BREAKPOINT_ORDER = ['sm', 'md', 'lg', 'xl', '2xl'] as const;

/**
 * Common design system breakpoints (in pixels)
 */
export const COMMON_BREAKPOINTS = {
  xs: 320,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
  '3xl': 1920,
} as const;

/**
 * Tailwind responsive prefix pattern
 * Matches: sm:flex, md:hidden, lg:grid-cols-3, xl:p-4, 2xl:text-lg
 */
export const TAILWIND_RESPONSIVE_PATTERN = /\b(sm|md|lg|xl|2xl):([a-z][a-z0-9-]*(?:-[a-z0-9]+)*(?:\[[^\]]+\])?)/gi;

/**
 * CSS media query pattern (min-width - mobile-first)
 * Matches: @media (min-width: 768px), @media screen and (min-width: 1024px)
 */
export const CSS_MEDIA_QUERY_MIN_WIDTH_PATTERN = /@media\s+(?:screen\s+and\s+)?\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)\s*\)/gi;

/**
 * CSS media query pattern (max-width - desktop-first)
 * Matches: @media (max-width: 768px), @media screen and (max-width: 1024px)
 */
export const CSS_MEDIA_QUERY_MAX_WIDTH_PATTERN = /@media\s+(?:screen\s+and\s+)?\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)\s*\)/gi;

/**
 * CSS container query pattern
 * Matches: @container (min-width: 400px), @container sidebar (min-width: 300px)
 */
export const CSS_CONTAINER_QUERY_PATTERN = /@container\s*(?:\w+\s*)?\(\s*(?:min|max)-width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)\s*\)/gi;

/**
 * Theme breakpoint usage patterns
 */
export const THEME_BREAKPOINT_PATTERNS = [
  // theme.breakpoints.*, theme.screens.*
  /theme\.(?:breakpoints|screens)\.([a-zA-Z0-9_]+)/g,
  // ${theme.breakpoints.*} in template literals
  /\$\{theme\.(?:breakpoints|screens)\.([a-zA-Z0-9_]+)\}/g,
  // props.theme.breakpoints.*
  /props\.theme\.(?:breakpoints|screens)\.([a-zA-Z0-9_]+)/g,
] as const;

/**
 * CSS custom property breakpoint patterns
 * Matches: var(--breakpoint-sm), var(--screen-md)
 */
export const CSS_BREAKPOINT_PROPERTY_PATTERN = /var\(\s*--(?:breakpoint|screen|bp)[-_]?([a-zA-Z0-9_-]*)\s*(?:,\s*[^)]+)?\)/gi;

/**
 * Hardcoded media query pixel values (arbitrary values)
 */
export const HARDCODED_MEDIA_QUERY_PATTERN = /@media\s+(?:screen\s+and\s+)?\(\s*(?:min|max)-width\s*:\s*(\d+(?:\.\d+)?)(px)\s*\)/gi;


/**
 * File patterns to exclude from responsive detection
 */
export const EXCLUDED_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
  /tailwind\.config\.[jt]s$/,
  /postcss\.config\.[jt]s$/,
];

/**
 * Allowed arbitrary breakpoint values (common exceptions)
 */
export const ALLOWED_BREAKPOINT_VALUES = new Set([
  320, 375, 414, 480,  // Common mobile sizes
  640, 768, 1024, 1280, 1536, 1920,  // Standard breakpoints
]);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file should be excluded from responsive detection
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
 * Check if a breakpoint value is in the standard set
 */
export function isStandardBreakpoint(value: number): boolean {
  return Object.values(TAILWIND_BREAKPOINTS).includes(value as typeof TAILWIND_BREAKPOINTS[keyof typeof TAILWIND_BREAKPOINTS]);
}

/**
 * Check if a breakpoint value is allowed (standard or common exception)
 */
export function isAllowedBreakpointValue(value: number): boolean {
  return ALLOWED_BREAKPOINT_VALUES.has(value) || isStandardBreakpoint(value);
}

/**
 * Get the breakpoint order index for a Tailwind breakpoint
 */
export function getBreakpointOrderIndex(breakpoint: string): number {
  return TAILWIND_BREAKPOINT_ORDER.indexOf(breakpoint as typeof TAILWIND_BREAKPOINT_ORDER[number]);
}

/**
 * Find the nearest standard breakpoint value
 */
export function findNearestBreakpoint(value: number): { name: string; value: number } {
  const breakpoints = Object.entries(TAILWIND_BREAKPOINTS);
  let nearest = breakpoints[0]!;
  let minDiff = Math.abs(value - nearest[1]);

  for (const [name, bpValue] of breakpoints) {
    const diff = Math.abs(value - bpValue);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = [name, bpValue];
    }
  }

  return { name: nearest[0], value: nearest[1] };
}


/**
 * Suggest a standard breakpoint for an arbitrary value
 */
export function suggestBreakpoint(value: number): string {
  const nearest = findNearestBreakpoint(value);
  return `Use standard breakpoint '${nearest.name}' (${nearest.value}px) instead of ${value}px`;
}

/**
 * Convert em/rem to pixels (assuming 16px base)
 */
export function convertToPixels(value: number, unit: string): number {
  if (unit === 'em' || unit === 'rem') {
    return value * 16;
  }
  return value;
}

/**
 * Detect Tailwind responsive prefixes in content
 */
export function detectTailwindResponsive(content: string, file: string): ResponsivePatternInfo[] {
  const results: ResponsivePatternInfo[] = [];
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

    const breakpoint = match[1] || '';
    const breakpointValue = TAILWIND_BREAKPOINTS[breakpoint as keyof typeof TAILWIND_BREAKPOINTS];

    results.push({
      type: 'tailwind-responsive',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      breakpoint,
      breakpointValue,
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect CSS media queries (min-width - mobile-first)
 */
export function detectCSSMediaQueriesMinWidth(content: string, file: string): ResponsivePatternInfo[] {
  const results: ResponsivePatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(CSS_MEDIA_QUERY_MIN_WIDTH_PATTERN.source, CSS_MEDIA_QUERY_MIN_WIDTH_PATTERN.flags);
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

    const value = parseFloat(match[1] || '0');
    const unit = match[2] || 'px';
    const breakpointValue = convertToPixels(value, unit);

    results.push({
      type: 'mobile-first',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      breakpoint: `${value}${unit}`,
      breakpointValue,
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}


/**
 * Detect CSS media queries (max-width - desktop-first)
 */
export function detectCSSMediaQueriesMaxWidth(content: string, file: string): ResponsivePatternInfo[] {
  const results: ResponsivePatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(CSS_MEDIA_QUERY_MAX_WIDTH_PATTERN.source, CSS_MEDIA_QUERY_MAX_WIDTH_PATTERN.flags);
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

    const value = parseFloat(match[1] || '0');
    const unit = match[2] || 'px';
    const breakpointValue = convertToPixels(value, unit);

    results.push({
      type: 'desktop-first',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      breakpoint: `${value}${unit}`,
      breakpointValue,
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect CSS container queries
 */
export function detectCSSContainerQueries(content: string, file: string): ResponsivePatternInfo[] {
  const results: ResponsivePatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(CSS_CONTAINER_QUERY_PATTERN.source, CSS_CONTAINER_QUERY_PATTERN.flags);
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

    const value = parseFloat(match[1] || '0');
    const unit = match[2] || 'px';
    const breakpointValue = convertToPixels(value, unit);

    results.push({
      type: 'css-container-query',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      breakpoint: `${value}${unit}`,
      breakpointValue,
      context: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Detect theme breakpoint usage
 */
export function detectThemeBreakpoints(content: string, file: string): ResponsivePatternInfo[] {
  const results: ResponsivePatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of THEME_BREAKPOINT_PATTERNS) {
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

      const breakpoint = match[1] || '';
      const breakpointValue = TAILWIND_BREAKPOINTS[breakpoint as keyof typeof TAILWIND_BREAKPOINTS];

      results.push({
        type: 'theme-breakpoint',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        breakpoint,
        breakpointValue,
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}


/**
 * Detect CSS custom property breakpoints
 */
export function detectCSSBreakpointProperties(content: string, file: string): ResponsivePatternInfo[] {
  const results: ResponsivePatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(CSS_BREAKPOINT_PROPERTY_PATTERN.source, CSS_BREAKPOINT_PROPERTY_PATTERN.flags);
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

    const breakpoint = match[1] || '';
    const breakpointValue = TAILWIND_BREAKPOINTS[breakpoint as keyof typeof TAILWIND_BREAKPOINTS];

    results.push({
      type: 'css-breakpoint-property',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      breakpoint,
      breakpointValue,
      context: lines[lineNumber - 1] || '',
    });
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
  
  return classNames;
}

/**
 * Detect inconsistent breakpoint ordering in Tailwind classes
 */
export function detectInconsistentBreakpointOrder(content: string, file: string): ResponsiveViolationInfo[] {
  const results: ResponsiveViolationInfo[] = [];
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const classNames = extractClassNamesFromLine(line);
    
    if (classNames.length === 0) {continue;}

    // Group responsive classes by their base class
    const responsiveGroups = new Map<string, Array<{ breakpoint: string; className: string; index: number }>>();
    
    classNames.forEach((className, index) => {
      const match = className.match(/^(sm|md|lg|xl|2xl):(.+)$/);
      if (match) {
        const breakpoint = match[1]!;
        const baseClass = match[2]!;
        
        // Extract the property prefix (e.g., 'flex' from 'flex', 'p' from 'p-4')
        const propertyMatch = baseClass.match(/^([a-z]+(?:-[a-z]+)*?)(?:-\d|$|\[)/i);
        const propertyPrefix = propertyMatch ? propertyMatch[1]! : baseClass;
        
        if (!responsiveGroups.has(propertyPrefix)) {
          responsiveGroups.set(propertyPrefix, []);
        }
        responsiveGroups.get(propertyPrefix)!.push({ breakpoint, className, index });
      }
    });

    // Check each group for ordering issues
    for (const [_propertyPrefix, group] of responsiveGroups) {
      if (group.length < 2) {continue;}

      // Check if breakpoints are in correct order
      for (let i = 0; i < group.length - 1; i++) {
        const current = group[i]!;
        const next = group[i + 1]!;
        
        const currentOrder = getBreakpointOrderIndex(current.breakpoint);
        const nextOrder = getBreakpointOrderIndex(next.breakpoint);
        
        // If current breakpoint should come after next (wrong order)
        if (currentOrder > nextOrder && current.index < next.index) {
          const classIndex = line.indexOf(current.className);
          const column = classIndex >= 0 ? classIndex + 1 : 1;

          results.push({
            type: 'inconsistent-breakpoint-order',
            file,
            line: lineIndex + 1,
            column,
            endLine: lineIndex + 1,
            endColumn: column + current.className.length,
            breakpoints: [current.breakpoint, next.breakpoint],
            issue: `Breakpoint '${current.breakpoint}:' appears before '${next.breakpoint}:' but should come after (mobile-first order: sm → md → lg → xl → 2xl)`,
            suggestedFix: `Reorder classes to follow mobile-first breakpoint order: ${TAILWIND_BREAKPOINT_ORDER.join(' → ')}`,
            lineContent: line,
          });
        }
      }
    }
  }

  return results;
}


/**
 * Detect mixed mobile-first and desktop-first approaches
 */
export function detectMixedApproach(
  mobileFirstPatterns: ResponsivePatternInfo[],
  desktopFirstPatterns: ResponsivePatternInfo[],
  file: string
): ResponsiveViolationInfo[] {
  const results: ResponsiveViolationInfo[] = [];

  // Only flag if both approaches are used significantly
  if (mobileFirstPatterns.length > 0 && desktopFirstPatterns.length > 0) {
    const totalPatterns = mobileFirstPatterns.length + desktopFirstPatterns.length;
    const mobileFirstRatio = mobileFirstPatterns.length / totalPatterns;
    
    // If neither approach is dominant (both > 20%), flag as mixed
    if (mobileFirstRatio > 0.2 && mobileFirstRatio < 0.8) {
      // Flag the minority approach patterns
      const minorityPatterns = mobileFirstRatio > 0.5 ? desktopFirstPatterns : mobileFirstPatterns;
      const dominantApproach = mobileFirstRatio > 0.5 ? 'mobile-first (min-width)' : 'desktop-first (max-width)';
      
      for (const pattern of minorityPatterns) {
        results.push({
          type: 'mixed-approach',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          breakpoints: [pattern.breakpoint || ''],
          issue: `File mixes mobile-first and desktop-first approaches. This media query uses ${pattern.type === 'mobile-first' ? 'min-width' : 'max-width'}, but the file predominantly uses ${dominantApproach}`,
          suggestedFix: `Consider standardizing on ${dominantApproach} approach for consistency`,
          lineContent: pattern.context || '',
        });
      }
    }
  }

  return results;
}

/**
 * Detect arbitrary/hardcoded breakpoint values in media queries
 */
export function detectArbitraryBreakpoints(content: string, file: string): ResponsiveViolationInfo[] {
  const results: ResponsiveViolationInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(HARDCODED_MEDIA_QUERY_PATTERN.source, HARDCODED_MEDIA_QUERY_PATTERN.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Skip if inside a comment
    if (isInsideComment(content, match.index)) {
      continue;
    }

    const value = parseFloat(match[1] || '0');
    
    // Skip if it's a standard breakpoint value
    if (isAllowedBreakpointValue(value)) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const endColumn = column + match[0].length;

    results.push({
      type: 'arbitrary-breakpoint',
      file,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn,
      breakpoints: [`${value}px`],
      issue: `Arbitrary breakpoint value '${value}px' doesn't match standard design system breakpoints`,
      suggestedFix: suggestBreakpoint(value),
      lineContent: lines[lineNumber - 1] || '',
    });
  }

  return results;
}

/**
 * Analyze responsive patterns in a file
 */
export function analyzeResponsive(content: string, file: string): ResponsiveAnalysis {
  // Skip excluded files
  if (shouldExcludeFile(file)) {
    return {
      patterns: [],
      violations: [],
      usesTailwindResponsive: false,
      usesCSSMediaQueries: false,
      usesCSSContainerQueries: false,
      usesThemeBreakpoints: false,
      usesCSSBreakpointProperties: false,
      usesMobileFirst: false,
      usesDesktopFirst: false,
      responsiveConsistencyConfidence: 1.0,
    };
  }

  // Detect all patterns
  const tailwindResponsive = detectTailwindResponsive(content, file);
  const mobileFirstQueries = detectCSSMediaQueriesMinWidth(content, file);
  const desktopFirstQueries = detectCSSMediaQueriesMaxWidth(content, file);
  const containerQueries = detectCSSContainerQueries(content, file);
  const themeBreakpoints = detectThemeBreakpoints(content, file);
  const cssBreakpointProperties = detectCSSBreakpointProperties(content, file);

  const allPatterns = [
    ...tailwindResponsive,
    ...mobileFirstQueries,
    ...desktopFirstQueries,
    ...containerQueries,
    ...themeBreakpoints,
    ...cssBreakpointProperties,
  ];

  // Detect violations
  const breakpointOrderViolations = detectInconsistentBreakpointOrder(content, file);
  const mixedApproachViolations = detectMixedApproach(mobileFirstQueries, desktopFirstQueries, file);
  const arbitraryBreakpointViolations = detectArbitraryBreakpoints(content, file);

  const allViolations = [
    ...breakpointOrderViolations,
    ...mixedApproachViolations,
    ...arbitraryBreakpointViolations,
  ];

  // Calculate confidence
  const hasPatterns = allPatterns.length > 0;
  const hasViolations = allViolations.length > 0;

  let responsiveConsistencyConfidence = 0;
  if (hasPatterns && !hasViolations) {
    responsiveConsistencyConfidence = 1.0;
  } else if (hasPatterns && hasViolations) {
    const ratio = allPatterns.length / (allPatterns.length + allViolations.length);
    responsiveConsistencyConfidence = ratio;
  } else if (!hasPatterns && hasViolations) {
    responsiveConsistencyConfidence = 0;
  } else {
    responsiveConsistencyConfidence = 0.5; // No responsive patterns detected
  }

  return {
    patterns: allPatterns,
    violations: allViolations,
    usesTailwindResponsive: tailwindResponsive.length > 0,
    usesCSSMediaQueries: mobileFirstQueries.length > 0 || desktopFirstQueries.length > 0,
    usesCSSContainerQueries: containerQueries.length > 0,
    usesThemeBreakpoints: themeBreakpoints.length > 0,
    usesCSSBreakpointProperties: cssBreakpointProperties.length > 0,
    usesMobileFirst: mobileFirstQueries.length > 0,
    usesDesktopFirst: desktopFirstQueries.length > 0,
    responsiveConsistencyConfidence,
  };
}


// ============================================================================
// Responsive Detector Class
// ============================================================================

/**
 * Detector for responsive breakpoint usage patterns
 *
 * Identifies responsive patterns (Tailwind prefixes, CSS media queries, container queries)
 * and flags inconsistent breakpoint usage.
 *
 * @requirements 9.8 - THE Styling_Detector SHALL detect responsive breakpoint usage patterns
 */
export class ResponsiveDetector extends RegexDetector {
  readonly id = 'styling/responsive';
  readonly category = 'styling' as const;
  readonly subcategory = 'responsive';
  readonly name = 'Responsive Detector';
  readonly description = 'Detects responsive breakpoint usage patterns and flags inconsistent breakpoint ordering, mixed approaches, and arbitrary values';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  /**
   * Detect responsive patterns and violations
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Analyze the file
    const analysis = analyzeResponsive(context.content, context.file);

    // Create pattern matches for responsive patterns
    if (analysis.usesTailwindResponsive) {
      patterns.push(this.createTailwindResponsivePattern(context.file, analysis));
    }

    if (analysis.usesCSSMediaQueries) {
      patterns.push(this.createCSSMediaQueryPattern(context.file, analysis));
    }

    if (analysis.usesCSSContainerQueries) {
      patterns.push(this.createCSSContainerQueryPattern(context.file, analysis));
    }

    if (analysis.usesThemeBreakpoints) {
      patterns.push(this.createThemeBreakpointPattern(context.file, analysis));
    }

    if (analysis.usesCSSBreakpointProperties) {
      patterns.push(this.createCSSBreakpointPropertyPattern(context.file, analysis));
    }

    // Create violations
    for (const violation of analysis.violations) {
      violations.push(this.createResponsiveViolation(violation));
    }

    return this.createResult(patterns, violations, analysis.responsiveConsistencyConfidence);
  }

  /**
   * Create a pattern match for Tailwind responsive usage
   */
  private createTailwindResponsivePattern(
    file: string,
    analysis: ResponsiveAnalysis
  ): PatternMatch {
    const tailwindPatterns = analysis.patterns.filter(
      p => p.type === 'tailwind-responsive'
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
   * Create a pattern match for CSS media query usage
   */
  private createCSSMediaQueryPattern(
    file: string,
    analysis: ResponsiveAnalysis
  ): PatternMatch {
    const mediaQueryPatterns = analysis.patterns.filter(
      p => p.type === 'mobile-first' || p.type === 'desktop-first'
    );
    const firstPattern = mediaQueryPatterns[0];

    return {
      patternId: `${this.id}/media-query`,
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
   * Create a pattern match for CSS container query usage
   */
  private createCSSContainerQueryPattern(
    file: string,
    analysis: ResponsiveAnalysis
  ): PatternMatch {
    const containerPatterns = analysis.patterns.filter(
      p => p.type === 'css-container-query'
    );
    const firstPattern = containerPatterns[0];

    return {
      patternId: `${this.id}/container-query`,
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
   * Create a pattern match for theme breakpoint usage
   */
  private createThemeBreakpointPattern(
    file: string,
    analysis: ResponsiveAnalysis
  ): PatternMatch {
    const themePatterns = analysis.patterns.filter(
      p => p.type === 'theme-breakpoint'
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
   * Create a pattern match for CSS breakpoint property usage
   */
  private createCSSBreakpointPropertyPattern(
    file: string,
    analysis: ResponsiveAnalysis
  ): PatternMatch {
    const cssPatterns = analysis.patterns.filter(
      p => p.type === 'css-breakpoint-property'
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
   * Create a violation for a responsive issue
   */
  private createResponsiveViolation(violationInfo: ResponsiveViolationInfo): Violation {
    const severity = violationInfo.type === 'arbitrary-breakpoint' ? 'warning' : 'info';

    const violation: Violation = {
      id: `${this.id}-${violationInfo.file}-${violationInfo.line}-${violationInfo.column}`,
      patternId: this.id,
      severity,
      file: violationInfo.file,
      range: {
        start: { line: violationInfo.line - 1, character: violationInfo.column - 1 },
        end: { line: violationInfo.endLine - 1, character: violationInfo.endColumn - 1 },
      },
      message: violationInfo.issue,
      explanation: this.getExplanation(violationInfo),
      expected: this.getExpectedValue(violationInfo),
      actual: violationInfo.breakpoints.join(', '),
      aiExplainAvailable: true,
      aiFixAvailable: violationInfo.type === 'arbitrary-breakpoint',
      firstSeen: new Date(),
      occurrences: 1,
    };

    const quickFix = this.createQuickFixForViolation(violationInfo);
    if (quickFix !== undefined) {
      violation.quickFix = quickFix;
    }

    return violation;
  }

  /**
   * Get explanation for a responsive violation
   */
  private getExplanation(violationInfo: ResponsiveViolationInfo): string {
    switch (violationInfo.type) {
      case 'inconsistent-breakpoint-order':
        return `Tailwind responsive classes should follow mobile-first ordering (sm → md → lg → xl → 2xl). This ensures styles cascade correctly from smaller to larger screens. Incorrect ordering can lead to unexpected style overrides.`;
      
      case 'mixed-approach':
        return `Mixing mobile-first (min-width) and desktop-first (max-width) media queries in the same file creates confusion and can lead to conflicting styles. Choose one approach and use it consistently throughout your codebase.`;
      
      case 'arbitrary-breakpoint':
        return `Using arbitrary breakpoint values instead of standard design system breakpoints makes it harder to maintain consistent responsive behavior. Standard breakpoints (640px, 768px, 1024px, 1280px, 1536px) ensure consistency across your application.`;
      
      case 'hardcoded-media-query':
        return `Hardcoded pixel values in media queries should be replaced with design tokens or CSS custom properties for maintainability. This allows breakpoints to be changed in one place.`;
      
      case 'missing-responsive-variant':
        return `Key responsive breakpoints should have corresponding style variants to ensure proper display across all device sizes.`;
      
      default:
        return `Responsive patterns should be consistent throughout the codebase for maintainability.`;
    }
  }

  /**
   * Get expected value for a responsive violation
   */
  private getExpectedValue(violationInfo: ResponsiveViolationInfo): string {
    switch (violationInfo.type) {
      case 'inconsistent-breakpoint-order':
        return `Breakpoints in order: ${TAILWIND_BREAKPOINT_ORDER.join(' → ')}`;
      
      case 'mixed-approach':
        return `Consistent use of either mobile-first (min-width) or desktop-first (max-width)`;
      
      case 'arbitrary-breakpoint':
        return `Standard breakpoint value (${Object.entries(TAILWIND_BREAKPOINTS).map(([k, v]) => `${k}: ${v}px`).join(', ')})`;
      
      case 'hardcoded-media-query':
        return `CSS custom property or design token (e.g., var(--breakpoint-md))`;
      
      case 'missing-responsive-variant':
        return `Responsive variants for key breakpoints`;
      
      default:
        return `Consistent responsive pattern`;
    }
  }

  /**
   * Create a quick fix for a responsive violation
   */
  private createQuickFixForViolation(violationInfo: ResponsiveViolationInfo): QuickFix | undefined {
    if (violationInfo.type !== 'arbitrary-breakpoint') {
      return undefined;
    }

    // Extract the pixel value from the breakpoint
    const pxMatch = violationInfo.breakpoints[0]?.match(/(\d+)px/);
    if (!pxMatch) {
      return undefined;
    }

    const value = parseInt(pxMatch[1]!, 10);
    const nearest = findNearestBreakpoint(value);
    
    // Create replacement text
    const replacement = violationInfo.lineContent.replace(
      new RegExp(`${value}px`),
      `${nearest.value}px`
    );

    return {
      title: `Replace with standard breakpoint: ${nearest.name} (${nearest.value}px)`,
      kind: 'quickfix',
      edit: {
        changes: {
          [violationInfo.file]: [
            {
              range: {
                start: { line: violationInfo.line - 1, character: 0 },
                end: { line: violationInfo.line - 1, character: violationInfo.lineContent.length },
              },
              newText: replacement,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Replace '${value}px' with '${nearest.value}px' (${nearest.name})`,
    };
  }

  /**
   * Generate a quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Check if this is a responsive violation with arbitrary breakpoint
    if (!violation.message.includes('breakpoint') && !violation.message.includes('Breakpoint')) {
      return null;
    }

    // Extract the pixel value from the message
    const pxMatch = violation.actual.match(/(\d+)px/);
    if (!pxMatch) {
      return null;
    }

    const value = parseInt(pxMatch[1]!, 10);
    const nearest = findNearestBreakpoint(value);

    return {
      title: `Replace with standard breakpoint: ${nearest.name} (${nearest.value}px)`,
      kind: 'quickfix',
      edit: {
        changes: {
          [violation.file]: [
            {
              range: violation.range,
              newText: `${nearest.value}px`,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Replace '${value}px' with '${nearest.value}px' (${nearest.name})`,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ResponsiveDetector instance
 */
export function createResponsiveDetector(): ResponsiveDetector {
  return new ResponsiveDetector();
}
