/**
 * Class Naming Detector - CSS class naming convention detection
 *
 * Detects CSS class naming patterns including:
 * - BEM pattern (block__element--modifier)
 * - Utility-first pattern (Tailwind-style: flex, items-center, p-4)
 * - CSS Modules pattern (styles.className)
 * - Semantic naming pattern (btn-primary, card-header)
 * - SMACSS/OOCSS patterns
 *
 * Flags inconsistent class naming:
 * - Mixed naming conventions in the same file
 * - Non-standard BEM usage
 * - Inconsistent utility class ordering
 *
 * @requirements 9.5 - THE Styling_Detector SHALL detect CSS class naming conventions (BEM, utility-first)
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of class naming patterns detected
 */
export type ClassNamingPatternType =
  | 'bem'                // BEM pattern (block__element--modifier)
  | 'utility-first'      // Utility-first pattern (Tailwind-style)
  | 'css-modules'        // CSS Modules pattern (styles.className)
  | 'semantic'           // Semantic naming pattern (btn-primary, card-header)
  | 'smacss'             // SMACSS pattern (l-*, is-*, js-*)
  | 'oocss';             // OOCSS pattern (media, media-body)

/**
 * Types of class naming violations detected
 */
export type ClassNamingViolationType =
  | 'mixed-conventions'       // Mixed naming conventions in the same file
  | 'invalid-bem'             // Non-standard BEM usage
  | 'inconsistent-ordering'   // Inconsistent utility class ordering
  | 'non-semantic-name';      // Non-semantic class name

/**
 * Information about a detected class naming pattern
 */
export interface ClassNamingPatternInfo {
  /** Type of class naming pattern */
  type: ClassNamingPatternType;
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
 * Information about a detected class naming violation
 */
export interface ClassNamingViolationInfo {
  /** Type of class naming violation */
  type: ClassNamingViolationType;
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
 * Analysis of class naming patterns in a file
 */
export interface ClassNamingAnalysis {
  /** Class naming patterns found */
  patterns: ClassNamingPatternInfo[];
  /** Class naming violations found */
  violations: ClassNamingViolationInfo[];
  /** Whether file uses BEM naming */
  usesBEM: boolean;
  /** Whether file uses utility-first naming */
  usesUtilityFirst: boolean;
  /** Whether file uses CSS Modules */
  usesCSSModules: boolean;
  /** Whether file uses semantic naming */
  usesSemantic: boolean;
  /** Whether file uses SMACSS patterns */
  usesSMACSS: boolean;
  /** Dominant naming convention in the file */
  dominantConvention: ClassNamingPatternType | null;
  /** Confidence score for consistent naming */
  namingConsistencyConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * BEM pattern regex
 * Matches: block, block__element, block--modifier, block__element--modifier
 */
export const BEM_PATTERN = /\b([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:__([a-z][a-z0-9]*(?:-[a-z0-9]+)*))?(?:--([a-z][a-z0-9]*(?:-[a-z0-9]+)*))?\b/gi;

/**
 * Strict BEM pattern (requires at least __ or --)
 */
export const STRICT_BEM_PATTERN = /\b([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:__[a-z][a-z0-9]*(?:-[a-z0-9]+)*|--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+\b/gi;

/**
 * Invalid BEM patterns (common mistakes)
 */
export const INVALID_BEM_PATTERNS = [
  // Double underscore followed by double dash (should be separate)
  /\b[a-z][a-z0-9-]*__[a-z][a-z0-9-]*__[a-z][a-z0-9-]*\b/gi,
  // Triple underscore
  /\b[a-z][a-z0-9-]*___[a-z][a-z0-9-]*\b/gi,
  // Triple dash
  /\b[a-z][a-z0-9-]*---[a-z][a-z0-9-]*\b/gi,
  // Uppercase in BEM (should be lowercase)
  /\b[a-z][a-zA-Z0-9-]*__[A-Z][a-zA-Z0-9-]*\b/g,
  /\b[a-z][a-zA-Z0-9-]*--[A-Z][a-zA-Z0-9-]*\b/g,
] as const;

/**
 * Tailwind utility class patterns
 */
export const TAILWIND_UTILITY_PATTERNS = [
  // Layout
  /\b(?:flex|grid|block|inline|hidden|container)\b/g,
  /\b(?:flex-row|flex-col|flex-wrap|flex-nowrap|flex-1|flex-auto|flex-initial|flex-none)\b/g,
  /\b(?:grid-cols-\d+|grid-rows-\d+|col-span-\d+|row-span-\d+)\b/g,
  // Spacing
  /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml)-(?:\d+|auto|px)\b/g,
  /\b(?:space-x|space-y|gap|gap-x|gap-y)-\d+\b/g,
  // Sizing
  /\b(?:w|h|min-w|min-h|max-w|max-h)-(?:\d+|full|screen|auto|min|max|fit)\b/g,
  // Typography
  /\b(?:text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl))\b/g,
  /\b(?:font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black))\b/g,
  // Colors (simplified)
  /\b(?:text|bg|border|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
  // Flexbox alignment
  /\b(?:items|justify|content|self)-(?:start|end|center|between|around|evenly|stretch|baseline)\b/g,
  // Border
  /\b(?:border|border-t|border-r|border-b|border-l)(?:-\d+)?\b/g,
  /\b(?:rounded|rounded-t|rounded-r|rounded-b|rounded-l|rounded-tl|rounded-tr|rounded-bl|rounded-br)(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?\b/g,
  // Effects
  /\b(?:shadow|shadow-sm|shadow-md|shadow-lg|shadow-xl|shadow-2xl|shadow-inner|shadow-none)\b/g,
  /\b(?:opacity-\d+)\b/g,
  // Positioning
  /\b(?:relative|absolute|fixed|sticky|static)\b/g,
  /\b(?:top|right|bottom|left|inset)-(?:\d+|auto|px|full)\b/g,
  /\b(?:z-\d+|z-auto)\b/g,
  // Display
  /\b(?:overflow|overflow-x|overflow-y)-(?:auto|hidden|visible|scroll)\b/g,
  // Transitions
  /\b(?:transition|transition-all|transition-colors|transition-opacity|transition-shadow|transition-transform)\b/g,
  /\b(?:duration-\d+)\b/g,
  /\b(?:ease-linear|ease-in|ease-out|ease-in-out)\b/g,
] as const;

/**
 * CSS Modules pattern
 * Matches: styles.className, styles['class-name'], styles["class-name"]
 */
export const CSS_MODULES_PATTERNS = [
  /\bstyles\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
  /\bstyles\[['"]([a-zA-Z_][a-zA-Z0-9_-]*)['"]\]/g,
  /\bclasses\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
  /\bclasses\[['"]([a-zA-Z_][a-zA-Z0-9_-]*)['"]\]/g,
  /\bcss\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
] as const;

/**
 * Semantic naming patterns
 * Matches: btn-primary, card-header, nav-item, etc.
 */
export const SEMANTIC_NAMING_PATTERNS = [
  // Button patterns
  /\b(?:btn|button)-(?:primary|secondary|tertiary|success|danger|warning|info|light|dark|link|outline|ghost|disabled)\b/gi,
  // Card patterns
  /\b(?:card|panel)-(?:header|body|footer|title|subtitle|content|image|actions)\b/gi,
  // Navigation patterns
  /\b(?:nav|navbar|menu)-(?:item|link|brand|toggle|collapse|dropdown)\b/gi,
  // Form patterns
  /\b(?:form|input|field)-(?:group|control|label|error|help|text|check|radio|select)\b/gi,
  // Layout patterns
  /\b(?:container|wrapper|section|header|footer|sidebar|main|content)-(?:fluid|fixed|full|inner|outer)\b/gi,
  // List patterns
  /\b(?:list|item)-(?:group|item|inline|unstyled|ordered|unordered)\b/gi,
  // Modal/Dialog patterns
  /\b(?:modal|dialog)-(?:header|body|footer|title|content|backdrop|close)\b/gi,
  // Alert patterns
  /\b(?:alert|notification|toast)-(?:success|error|warning|info|primary|secondary|dismissible)\b/gi,
  // Table patterns
  /\b(?:table|row|cell|thead|tbody|tfoot)-(?:header|body|footer|striped|bordered|hover|responsive)\b/gi,
] as const;

/**
 * SMACSS patterns
 * Matches: l-*, is-*, has-*, js-*
 */
export const SMACSS_PATTERNS = [
  // Layout
  /\bl-[a-z][a-z0-9-]*\b/gi,
  // State
  /\bis-[a-z][a-z0-9-]*\b/gi,
  /\bhas-[a-z][a-z0-9-]*\b/gi,
  // JavaScript hooks
  /\bjs-[a-z][a-z0-9-]*\b/gi,
] as const;

/**
 * OOCSS patterns (common object-oriented CSS patterns)
 */
export const OOCSS_PATTERNS = [
  // Media object
  /\b(?:media|media-body|media-left|media-right|media-object)\b/gi,
  // Flag object
  /\b(?:flag|flag-body|flag-image)\b/gi,
  // Box object
  /\b(?:box|box-header|box-body|box-footer)\b/gi,
] as const;

/**
 * File patterns to exclude from class naming detection
 */
export const EXCLUDED_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
  /\.config\.[jt]s$/,
  /tailwind\.config/,
];

/**
 * Recommended utility class ordering (Tailwind convention)
 */
export const UTILITY_CLASS_ORDER = [
  'container',
  'position',
  'display',
  'flex',
  'grid',
  'width',
  'height',
  'margin',
  'padding',
  'border',
  'background',
  'text',
  'font',
  'color',
  'opacity',
  'shadow',
  'transition',
  'animation',
] as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file should be excluded from class naming detection
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
 * Check if a class name follows BEM convention
 */
export function isBEMClassName(className: string): boolean {
  // BEM: block__element--modifier
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?(?:--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/i.test(className);
}

/**
 * Check if a class name is a Tailwind utility class
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
 * Check if a class name follows semantic naming
 */
export function isSemanticClassName(className: string): boolean {
  for (const pattern of SEMANTIC_NAMING_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(className)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a class name follows SMACSS convention
 */
export function isSMACSClassName(className: string): boolean {
  for (const pattern of SMACSS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(className)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate BEM class name and return issues
 */
export function validateBEMClassName(className: string): string | null {
  // Check for multiple element separators
  if ((className.match(/__/g) || []).length > 1) {
    return 'BEM class should have at most one element separator (__)';
  }

  // Check for uppercase letters
  if (/[A-Z]/.test(className)) {
    return 'BEM class names should be lowercase';
  }

  // Check for invalid characters
  if (/[^a-z0-9_-]/i.test(className)) {
    return 'BEM class names should only contain lowercase letters, numbers, hyphens, and underscores';
  }

  // Check for triple underscore or dash
  if (/___/.test(className) || /---/.test(className)) {
    return 'BEM class names should not have triple underscores or dashes';
  }

  return null;
}

/**
 * Detect BEM patterns in content
 */
export function detectBEMPatterns(content: string, file: string): ClassNamingPatternInfo[] {
  const results: ClassNamingPatternInfo[] = [];
  const lines = content.split('\n');
  const regex = new RegExp(STRICT_BEM_PATTERN.source, STRICT_BEM_PATTERN.flags);
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
      type: 'bem',
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
 * Detect utility-first (Tailwind) patterns in content
 */
export function detectUtilityFirstPatterns(content: string, file: string): ClassNamingPatternInfo[] {
  const results: ClassNamingPatternInfo[] = [];
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
        type: 'utility-first',
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
 * Detect CSS Modules patterns in content
 */
export function detectCSSModulesPatterns(content: string, file: string): ClassNamingPatternInfo[] {
  const results: ClassNamingPatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of CSS_MODULES_PATTERNS) {
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
        type: 'css-modules',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        classNames: [match[1] || match[0]],
        context: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Detect semantic naming patterns in content
 */
export function detectSemanticPatterns(content: string, file: string): ClassNamingPatternInfo[] {
  const results: ClassNamingPatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of SEMANTIC_NAMING_PATTERNS) {
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
        type: 'semantic',
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
 * Detect SMACSS patterns in content
 */
export function detectSMACSPatterns(content: string, file: string): ClassNamingPatternInfo[] {
  const results: ClassNamingPatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of SMACSS_PATTERNS) {
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
        type: 'smacss',
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
 * Detect invalid BEM patterns
 */
export function detectInvalidBEMPatterns(content: string, file: string): ClassNamingViolationInfo[] {
  const results: ClassNamingViolationInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of INVALID_BEM_PATTERNS) {
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
      const endColumn = column + match[0].length;

      const issue = validateBEMClassName(match[0]) || 'Invalid BEM class name format';

      results.push({
        type: 'invalid-bem',
        file,
        line: lineNumber,
        column,
        endLine: lineNumber,
        endColumn,
        classNames: [match[0]],
        issue,
        suggestedFix: suggestBEMFix(match[0]),
        lineContent: lines[lineNumber - 1] || '',
      });
    }
  }

  return results;
}

/**
 * Detect mixed naming conventions in a file
 */
export function detectMixedConventions(
  patterns: ClassNamingPatternInfo[],
  file: string
): ClassNamingViolationInfo[] {
  const results: ClassNamingViolationInfo[] = [];

  // Count patterns by type
  const typeCounts: Record<ClassNamingPatternType, number> = {
    'bem': 0,
    'utility-first': 0,
    'css-modules': 0,
    'semantic': 0,
    'smacss': 0,
    'oocss': 0,
  };

  for (const pattern of patterns) {
    typeCounts[pattern.type]++;
  }

  // Find the dominant convention
  const sortedTypes = Object.entries(typeCounts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sortedTypes.length <= 1) {
    return results; // No mixed conventions
  }

  const dominantType = sortedTypes[0]?.[0] as ClassNamingPatternType;
  const dominantCount = sortedTypes[0]?.[1] || 0;

  // Flag patterns that don't match the dominant convention
  // Only flag if there's a clear dominant pattern (>60% of patterns)
  const totalPatterns = patterns.length;
  if (dominantCount / totalPatterns < 0.6) {
    // No clear dominant pattern, flag all as mixed
    const firstPattern = patterns[0];
    if (firstPattern) {
      results.push({
        type: 'mixed-conventions',
        file,
        line: firstPattern.line,
        column: firstPattern.column,
        endLine: firstPattern.line,
        endColumn: firstPattern.column + firstPattern.matchedText.length,
        classNames: patterns.map(p => p.matchedText),
        issue: `File uses multiple naming conventions: ${sortedTypes.map(([t, c]) => `${t} (${c})`).join(', ')}`,
        suggestedFix: `Consider standardizing on one naming convention (most common: ${dominantType})`,
        lineContent: firstPattern.context || '',
      });
    }
  } else {
    // Flag minority patterns
    for (const pattern of patterns) {
      if (pattern.type !== dominantType) {
        results.push({
          type: 'mixed-conventions',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          classNames: [pattern.matchedText],
          issue: `Class '${pattern.matchedText}' uses ${pattern.type} convention, but file predominantly uses ${dominantType}`,
          suggestedFix: `Consider converting to ${dominantType} convention`,
          lineContent: pattern.context || '',
        });
      }
    }
  }

  return results;
}

/**
 * Suggest a BEM fix for an invalid class name
 */
export function suggestBEMFix(className: string): string {
  // Convert to lowercase
  let fixed = className.toLowerCase();

  // Replace triple underscores/dashes with double
  fixed = fixed.replace(/___/g, '__').replace(/---/g, '--');

  // Remove extra element separators
  const parts = fixed.split('__');
  if (parts.length > 2) {
    fixed = `${parts[0]}__${parts.slice(1).join('-')}`;
  }

  return fixed;
}

/**
 * Determine the dominant naming convention
 */
export function getDominantConvention(patterns: ClassNamingPatternInfo[]): ClassNamingPatternType | null {
  if (patterns.length === 0) {return null;}

  const typeCounts: Record<ClassNamingPatternType, number> = {
    'bem': 0,
    'utility-first': 0,
    'css-modules': 0,
    'semantic': 0,
    'smacss': 0,
    'oocss': 0,
  };

  for (const pattern of patterns) {
    typeCounts[pattern.type]++;
  }

  const sortedTypes = Object.entries(typeCounts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return sortedTypes[0]?.[0] as ClassNamingPatternType || null;
}

/**
 * Analyze class naming patterns in a file
 */
export function analyzeClassNaming(content: string, file: string): ClassNamingAnalysis {
  // Skip excluded files
  if (shouldExcludeFile(file)) {
    return {
      patterns: [],
      violations: [],
      usesBEM: false,
      usesUtilityFirst: false,
      usesCSSModules: false,
      usesSemantic: false,
      usesSMACSS: false,
      dominantConvention: null,
      namingConsistencyConfidence: 1.0,
    };
  }

  // Detect all patterns
  const bemPatterns = detectBEMPatterns(content, file);
  const utilityPatterns = detectUtilityFirstPatterns(content, file);
  const cssModulesPatterns = detectCSSModulesPatterns(content, file);
  const semanticPatterns = detectSemanticPatterns(content, file);
  const smacssPatterns = detectSMACSPatterns(content, file);

  const allPatterns = [
    ...bemPatterns,
    ...utilityPatterns,
    ...cssModulesPatterns,
    ...semanticPatterns,
    ...smacssPatterns,
  ];

  // Detect violations
  // NOTE: We've disabled mixed convention detection because:
  // 1. Modern projects often mix Tailwind utilities with component library classes (btn-primary, etc.)
  // 2. This is intentional and not a violation - component libraries have their own naming conventions
  // 3. The detector should focus on detecting patterns, not enforcing arbitrary rules
  const invalidBEMViolations = detectInvalidBEMPatterns(content, file);
  // Disabled: mixedConventionViolations - mixing Tailwind with component library classes is normal
  // const mixedConventionViolations = detectMixedConventions(allPatterns, file);

  const allViolations = [
    ...invalidBEMViolations,
    // ...mixedConventionViolations, // Disabled - mixing conventions is normal in modern projects
  ];

  // Calculate confidence
  const hasPatterns = allPatterns.length > 0;
  const hasViolations = allViolations.length > 0;

  let namingConsistencyConfidence = 0;
  if (hasPatterns && !hasViolations) {
    namingConsistencyConfidence = 1.0;
  } else if (hasPatterns && hasViolations) {
    const ratio = allPatterns.length / (allPatterns.length + allViolations.length);
    namingConsistencyConfidence = ratio;
  } else if (!hasPatterns && hasViolations) {
    namingConsistencyConfidence = 0;
  } else {
    namingConsistencyConfidence = 0.5; // No class naming detected
  }

  return {
    patterns: allPatterns,
    violations: allViolations,
    usesBEM: bemPatterns.length > 0,
    usesUtilityFirst: utilityPatterns.length > 0,
    usesCSSModules: cssModulesPatterns.length > 0,
    usesSemantic: semanticPatterns.length > 0,
    usesSMACSS: smacssPatterns.length > 0,
    dominantConvention: getDominantConvention(allPatterns),
    namingConsistencyConfidence,
  };
}

// ============================================================================
// Class Naming Detector Class
// ============================================================================

/**
 * Detector for CSS class naming conventions
 *
 * Identifies class naming patterns (BEM, utility-first, CSS Modules, semantic)
 * and flags inconsistent naming conventions.
 *
 * @requirements 9.5 - THE Styling_Detector SHALL detect CSS class naming conventions (BEM, utility-first)
 */
export class ClassNamingDetector extends RegexDetector {
  readonly id = 'styling/class-naming';
  readonly category = 'styling' as const;
  readonly subcategory = 'class-naming';
  readonly name = 'Class Naming Detector';
  readonly description = 'Detects CSS class naming conventions (BEM, utility-first, CSS Modules) and flags inconsistent naming';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  /**
   * Detect class naming patterns and violations
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Analyze the file
    const analysis = analyzeClassNaming(context.content, context.file);

    // Create pattern matches for naming conventions
    if (analysis.usesBEM) {
      patterns.push(this.createBEMPattern(context.file, analysis));
    }

    if (analysis.usesUtilityFirst) {
      patterns.push(this.createUtilityFirstPattern(context.file, analysis));
    }

    if (analysis.usesCSSModules) {
      patterns.push(this.createCSSModulesPattern(context.file, analysis));
    }

    if (analysis.usesSemantic) {
      patterns.push(this.createSemanticPattern(context.file, analysis));
    }

    if (analysis.usesSMACSS) {
      patterns.push(this.createSMACSPattern(context.file, analysis));
    }

    // Create violations
    for (const violation of analysis.violations) {
      violations.push(this.createClassNamingViolation(violation));
    }

    return this.createResult(patterns, violations, analysis.namingConsistencyConfidence);
  }

  /**
   * Create a pattern match for BEM usage
   */
  private createBEMPattern(file: string, analysis: ClassNamingAnalysis): PatternMatch {
    const bemPatterns = analysis.patterns.filter(p => p.type === 'bem');
    const firstPattern = bemPatterns[0];

    return {
      patternId: `${this.id}/bem`,
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
   * Create a pattern match for utility-first usage
   */
  private createUtilityFirstPattern(file: string, analysis: ClassNamingAnalysis): PatternMatch {
    const utilityPatterns = analysis.patterns.filter(p => p.type === 'utility-first');
    const firstPattern = utilityPatterns[0];

    return {
      patternId: `${this.id}/utility-first`,
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
   * Create a pattern match for CSS Modules usage
   */
  private createCSSModulesPattern(file: string, analysis: ClassNamingAnalysis): PatternMatch {
    const cssModulesPatterns = analysis.patterns.filter(p => p.type === 'css-modules');
    const firstPattern = cssModulesPatterns[0];

    return {
      patternId: `${this.id}/css-modules`,
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
   * Create a pattern match for semantic naming usage
   */
  private createSemanticPattern(file: string, analysis: ClassNamingAnalysis): PatternMatch {
    const semanticPatterns = analysis.patterns.filter(p => p.type === 'semantic');
    const firstPattern = semanticPatterns[0];

    return {
      patternId: `${this.id}/semantic`,
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
   * Create a pattern match for SMACSS usage
   */
  private createSMACSPattern(file: string, analysis: ClassNamingAnalysis): PatternMatch {
    const smacssPatterns = analysis.patterns.filter(p => p.type === 'smacss');
    const firstPattern = smacssPatterns[0];

    return {
      patternId: `${this.id}/smacss`,
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
   * Create a violation for a class naming issue
   */
  private createClassNamingViolation(info: ClassNamingViolationInfo): Violation {
    const typeDescriptions: Record<ClassNamingViolationType, string> = {
      'mixed-conventions': 'Mixed naming conventions',
      'invalid-bem': 'Invalid BEM class name',
      'inconsistent-ordering': 'Inconsistent utility class ordering',
      'non-semantic-name': 'Non-semantic class name',
    };

    const typeDescription = typeDescriptions[info.type] || 'Class naming issue';

    const violation: Violation = {
      id: `${this.id}-${info.file}-${info.line}-${info.column}`,
      patternId: this.id,
      severity: info.type === 'invalid-bem' ? 'warning' : 'info',
      file: info.file,
      range: {
        start: { line: info.line - 1, character: info.column - 1 },
        end: { line: info.endLine - 1, character: info.endColumn - 1 },
      },
      message: `${typeDescription}: ${info.issue}`,
      explanation: this.getExplanationForViolationType(info.type),
      expected: info.suggestedFix || 'Consistent class naming convention',
      actual: info.classNames.join(', '),
      aiExplainAvailable: true,
      aiFixAvailable: info.type === 'invalid-bem',
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
   * Get explanation for a violation type
   */
  private getExplanationForViolationType(type: ClassNamingViolationType): string {
    switch (type) {
      case 'mixed-conventions':
        return 'Using multiple naming conventions in the same file makes the codebase harder to maintain. Choose one convention and apply it consistently.';
      case 'invalid-bem':
        return 'BEM (Block Element Modifier) naming should follow the pattern: block__element--modifier. Class names should be lowercase with hyphens for multi-word names.';
      case 'inconsistent-ordering':
        return 'Utility classes should follow a consistent ordering (e.g., layout, spacing, typography, colors) for better readability.';
      case 'non-semantic-name':
        return 'Class names should describe the purpose or meaning of the element, not its appearance.';
      default:
        return 'Consistent class naming improves code maintainability and readability.';
    }
  }

  /**
   * Create a quick fix for a class naming violation
   */
  private createQuickFixForViolation(info: ClassNamingViolationInfo): QuickFix | undefined {
    if (info.type !== 'invalid-bem' || !info.suggestedFix) {
      return undefined;
    }

    return {
      title: `Fix BEM class name: ${info.suggestedFix}`,
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
      confidence: 0.8,
      preview: `Replace '${info.classNames[0]}' with '${info.suggestedFix}'`,
    };
  }

  /**
   * Generate a quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Check if this is a BEM violation
    if (!violation.message.includes('BEM')) {
      return null;
    }

    // Extract the class name from the message
    const classMatch = violation.actual;
    if (!classMatch) {
      return null;
    }

    const suggestedFix = suggestBEMFix(classMatch);

    return {
      title: `Fix BEM class name: ${suggestedFix}`,
      kind: 'quickfix',
      edit: {
        changes: {
          [violation.file]: [
            {
              range: violation.range,
              newText: suggestedFix,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.8,
      preview: `Replace '${classMatch}' with '${suggestedFix}'`,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ClassNamingDetector instance
 */
export function createClassNamingDetector(): ClassNamingDetector {
  return new ClassNamingDetector();
}
