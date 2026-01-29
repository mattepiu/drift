/**
 * Regex Detector - Regex-based detection base class
 *
 * Provides pattern matching helpers and utilities for regex-based pattern detection.
 * Extends BaseDetector with specialized methods for matching patterns in source code.
 *
 * @requirements 6.4 - THE Detector_System SHALL support detection methods: ast, regex, semantic, structural, and custom
 */

import { BaseDetector } from './base-detector.js';

import type { Location } from 'driftdetect-core';


// ============================================================================
// Regex Match Types
// ============================================================================

/**
 * Result of a regex match with position information
 */
export interface RegexMatch {
  /** The full matched text */
  match: string;

  /** Index of the match in the source string */
  index: number;

  /** Named capture groups (if any) */
  groups: Record<string, string>;

  /** Numbered capture groups (index 0 is full match) */
  captures: string[];
}

/**
 * Result of a regex match with line information
 */
export interface LineMatch {
  /** The full matched text */
  match: string;

  /** Line number (1-indexed) */
  line: number;

  /** Column number (1-indexed) */
  column: number;

  /** End line number (1-indexed) */
  endLine: number;

  /** End column number (1-indexed) */
  endColumn: number;

  /** Index of the match in the source string */
  index: number;

  /** Named capture groups (if any) */
  groups: Record<string, string>;

  /** Numbered capture groups (index 0 is full match) */
  captures: string[];

  /** The full line(s) containing the match */
  lineContent: string;
}

/**
 * Result of extracting named capture groups
 */
export interface CaptureResult {
  /** The full matched text */
  match: string;

  /** Named capture groups */
  groups: Record<string, string>;

  /** Line number (1-indexed) */
  line: number;

  /** Column number (1-indexed) */
  column: number;
}

/**
 * Location of a pattern match in source code
 */
export interface PatternLocation {
  /** File path (relative to project root) */
  file: string;

  /** Line number (1-indexed) */
  line: number;

  /** Column number (1-indexed) */
  column: number;

  /** End line number (1-indexed) */
  endLine: number;

  /** End column number (1-indexed) */
  endColumn: number;

  /** The matched text */
  matchedText: string;

  /** Named capture groups (if any) */
  groups: Record<string, string>;
}

/**
 * Options for regex matching operations
 */
export interface RegexMatchOptions {
  /** Whether to match case-insensitively */
  caseInsensitive?: boolean;

  /** Whether to match across multiple lines */
  multiline?: boolean;

  /** Whether to use dotAll mode (. matches newlines) */
  dotAll?: boolean;

  /** Maximum number of matches to return (undefined = all) */
  maxMatches?: number;
}

// ============================================================================
// Regex Detector Abstract Class
// ============================================================================

/**
 * Abstract base class for regex-based detectors
 *
 * Provides pattern matching helpers and utilities for detection
 * that operates on source code using regular expressions.
 *
 * @requirements 6.4 - THE Detector_System SHALL support detection methods: regex
 *
 * @example
 * ```typescript
 * class TodoCommentDetector extends RegexDetector {
 *   readonly id = 'documentation/todo-patterns';
 *   readonly category = 'documentation';
 *   readonly subcategory = 'comments';
 *   readonly name = 'TODO Comment Detector';
 *   readonly description = 'Detects TODO/FIXME comment patterns';
 *   readonly supportedLanguages = ['typescript', 'javascript'];
 *
 *   async detect(context: DetectionContext): Promise<DetectionResult> {
 *     const todoPattern = /\/\/\s*(TODO|FIXME):\s*(.+)/gi;
 *     const matches = this.matchLines(context.content, todoPattern);
 *     // Analyze TODO patterns...
 *   }
 *
 *   generateQuickFix(violation: Violation): QuickFix | null {
 *     return null;
 *   }
 * }
 * ```
 */
export abstract class RegexDetector extends BaseDetector {
  /**
   * Detection method is always 'regex' for regex-based detectors
   *
   * @requirements 6.4 - Detector declares detection method as 'regex'
   */
  readonly detectionMethod = 'regex' as const;

  // ============================================================================
  // Core Pattern Matching Methods
  // ============================================================================

  /**
   * Find all matches of a regex pattern in content
   *
   * Returns all matches with their positions and capture groups.
   *
   * @param content - The source content to search
   * @param pattern - The regex pattern to match (will be made global if not already)
   * @param options - Optional matching options
   * @returns Array of match results
   *
   * @example
   * ```typescript
   * const matches = this.matchAll(content, /function\s+(\w+)/g);
   * for (const match of matches) {
   *   console.log(`Found function: ${match.captures[1]}`);
   * }
   * ```
   */
  protected matchAll(
    content: string,
    pattern: RegExp,
    options: RegexMatchOptions = {}
  ): RegexMatch[] {
    const regex = this.normalizePattern(pattern, { ...options, global: true });
    const results: RegexMatch[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      results.push({
        match: match[0],
        index: match.index,
        groups: match.groups ? { ...match.groups } : {},
        captures: [...match],
      });

      if (options.maxMatches !== undefined && results.length >= options.maxMatches) {
        break;
      }

      // Prevent infinite loops for zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    return results;
  }

  /**
   * Find all matches with line and column information
   *
   * Returns matches with their line numbers, columns, and the full line content.
   *
   * @param content - The source content to search
   * @param pattern - The regex pattern to match
   * @param options - Optional matching options
   * @returns Array of line match results
   *
   * @example
   * ```typescript
   * const matches = this.matchLines(content, /console\.log\(/g);
   * for (const match of matches) {
   *   console.log(`Found console.log at line ${match.line}, column ${match.column}`);
   * }
   * ```
   */
  protected matchLines(
    content: string,
    pattern: RegExp,
    options: RegexMatchOptions = {}
  ): LineMatch[] {
    const matches = this.matchAll(content, pattern, options);
    const lineInfo = this.buildLineIndex(content);

    return matches.map((match) => {
      const startPos = this.indexToPosition(match.index, lineInfo);
      const endPos = this.indexToPosition(match.index + match.match.length, lineInfo);

      return {
        match: match.match,
        line: startPos.line,
        column: startPos.column,
        endLine: endPos.line,
        endColumn: endPos.column,
        index: match.index,
        groups: match.groups,
        captures: match.captures,
        lineContent: this.getLineContent(content, startPos.line, endPos.line, lineInfo),
      };
    });
  }

  /**
   * Extract named capture groups from all matches
   *
   * Useful for patterns with named groups like /(?<name>\w+)/
   *
   * @param content - The source content to search
   * @param pattern - The regex pattern with named capture groups
   * @param options - Optional matching options
   * @returns Array of capture results with groups
   *
   * @example
   * ```typescript
   * const captures = this.extractCaptures(
   *   content,
   *   /function\s+(?<name>\w+)\s*\((?<params>[^)]*)\)/g
   * );
   * for (const capture of captures) {
   *   console.log(`Function ${capture.groups.name} with params: ${capture.groups.params}`);
   * }
   * ```
   */
  protected extractCaptures(
    content: string,
    pattern: RegExp,
    options: RegexMatchOptions = {}
  ): CaptureResult[] {
    const matches = this.matchLines(content, pattern, options);

    return matches.map((match) => ({
      match: match.match,
      groups: match.groups,
      line: match.line,
      column: match.column,
    }));
  }

  /**
   * Find locations of all pattern matches
   *
   * Returns Location objects compatible with the drift core types.
   *
   * @param content - The source content to search
   * @param pattern - The regex pattern to match
   * @param file - The file path for the locations
   * @param options - Optional matching options
   * @returns Array of pattern locations
   *
   * @example
   * ```typescript
   * const locations = this.findPatternLocations(
   *   context.content,
   *   /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
   *   context.file
   * );
   * ```
   */
  protected findPatternLocations(
    content: string,
    pattern: RegExp,
    file: string,
    options: RegexMatchOptions = {}
  ): PatternLocation[] {
    const matches = this.matchLines(content, pattern, options);

    return matches.map((match) => ({
      file,
      line: match.line,
      column: match.column,
      endLine: match.endLine,
      endColumn: match.endColumn,
      matchedText: match.match,
      groups: match.groups,
    }));
  }

  // ============================================================================
  // Utility Methods for Common Regex Operations
  // ============================================================================

  /**
   * Test if a pattern matches anywhere in the content
   *
   * @param content - The source content to test
   * @param pattern - The regex pattern to test
   * @returns true if the pattern matches
   *
   * @example
   * ```typescript
   * if (this.hasMatch(content, /export\s+default/)) {
   *   // File has a default export
   * }
   * ```
   */
  protected hasMatch(content: string, pattern: RegExp): boolean {
    const regex = this.normalizePattern(pattern, {});
    return regex.test(content);
  }

  /**
   * Count the number of matches in content
   *
   * @param content - The source content to search
   * @param pattern - The regex pattern to count
   * @returns Number of matches found
   *
   * @example
   * ```typescript
   * const importCount = this.countMatches(content, /^import\s+/gm);
   * ```
   */
  protected countMatches(content: string, pattern: RegExp): number {
    return this.matchAll(content, pattern).length;
  }

  /**
   * Find the first match of a pattern
   *
   * @param content - The source content to search
   * @param pattern - The regex pattern to match
   * @returns The first match, or null if not found
   *
   * @example
   * ```typescript
   * const firstFunction = this.findFirst(content, /function\s+(\w+)/);
   * if (firstFunction) {
   *   console.log(`First function: ${firstFunction.captures[1]}`);
   * }
   * ```
   */
  protected findFirst(content: string, pattern: RegExp): LineMatch | null {
    const matches = this.matchLines(content, pattern, { maxMatches: 1 });
    return matches.length > 0 ? matches[0]! : null;
  }

  /**
   * Find the last match of a pattern
   *
   * @param content - The source content to search
   * @param pattern - The regex pattern to match
   * @returns The last match, or null if not found
   */
  protected findLast(content: string, pattern: RegExp): LineMatch | null {
    const matches = this.matchLines(content, pattern);
    return matches.length > 0 ? matches[matches.length - 1]! : null;
  }

  /**
   * Find matches within a specific line range
   *
   * @param content - The source content to search
   * @param pattern - The regex pattern to match
   * @param startLine - Start line (1-indexed, inclusive)
   * @param endLine - End line (1-indexed, inclusive)
   * @returns Array of matches within the line range
   */
  protected matchInRange(
    content: string,
    pattern: RegExp,
    startLine: number,
    endLine: number
  ): LineMatch[] {
    const matches = this.matchLines(content, pattern);
    return matches.filter(
      (match) => match.line >= startLine && match.line <= endLine
    );
  }

  /**
   * Replace all matches of a pattern
   *
   * @param content - The source content
   * @param pattern - The regex pattern to replace
   * @param replacement - The replacement string or function
   * @returns The content with replacements applied
   *
   * @example
   * ```typescript
   * const fixed = this.replaceAll(content, /var\s+/g, 'const ');
   * ```
   */
  protected replaceAll(
    content: string,
    pattern: RegExp,
    replacement: string | ((match: string, ...args: unknown[]) => string)
  ): string {
    const regex = this.normalizePattern(pattern, { global: true });
    return content.replace(regex, replacement as string);
  }

  /**
   * Split content by a pattern
   *
   * @param content - The source content to split
   * @param pattern - The regex pattern to split by
   * @param limit - Maximum number of splits
   * @returns Array of split parts
   */
  protected splitByPattern(
    content: string,
    pattern: RegExp,
    limit?: number
  ): string[] {
    return content.split(pattern, limit);
  }

  /**
   * Get all lines matching a pattern
   *
   * Returns complete lines that contain a match.
   *
   * @param content - The source content to search
   * @param pattern - The regex pattern to match
   * @returns Array of objects with line number and content
   *
   * @example
   * ```typescript
   * const importLines = this.getMatchingLines(content, /^import\s+/);
   * ```
   */
  protected getMatchingLines(
    content: string,
    pattern: RegExp
  ): Array<{ line: number; content: string }> {
    const lines = content.split('\n');
    const results: Array<{ line: number; content: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (pattern.test(line)) {
        results.push({ line: i + 1, content: line });
      }
    }

    return results;
  }

  /**
   * Get lines NOT matching a pattern
   *
   * @param content - The source content to search
   * @param pattern - The regex pattern to exclude
   * @returns Array of objects with line number and content
   */
  protected getNonMatchingLines(
    content: string,
    pattern: RegExp
  ): Array<{ line: number; content: string }> {
    const lines = content.split('\n');
    const results: Array<{ line: number; content: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!pattern.test(line)) {
        results.push({ line: i + 1, content: line });
      }
    }

    return results;
  }

  // ============================================================================
  // Pattern Building Helpers
  // ============================================================================

  /**
   * Create a pattern that matches any of the given strings
   *
   * @param strings - Strings to match (will be escaped)
   * @param flags - Optional regex flags
   * @returns A regex that matches any of the strings
   *
   * @example
   * ```typescript
   * const keywords = this.createAlternationPattern(['var', 'let', 'const'], 'g');
   * // Creates: /var|let|const/g
   * ```
   */
  protected createAlternationPattern(strings: string[], flags?: string): RegExp {
    const escaped = strings.map((s) => this.escapeRegex(s));
    return new RegExp(escaped.join('|'), flags);
  }

  /**
   * Create a pattern that matches a word boundary version of strings
   *
   * @param strings - Strings to match as whole words
   * @param flags - Optional regex flags
   * @returns A regex that matches whole words only
   *
   * @example
   * ```typescript
   * const keywords = this.createWordBoundaryPattern(['var', 'let', 'const'], 'g');
   * // Creates: /\b(?:var|let|const)\b/g
   * ```
   */
  protected createWordBoundaryPattern(strings: string[], flags?: string): RegExp {
    const escaped = strings.map((s) => this.escapeRegex(s));
    return new RegExp(`\\b(?:${escaped.join('|')})\\b`, flags);
  }

  /**
   * Escape special regex characters in a string
   *
   * @param str - String to escape
   * @returns Escaped string safe for use in regex
   *
   * @example
   * ```typescript
   * const escaped = this.escapeRegex('file.ts'); // 'file\\.ts'
   * ```
   */
  protected escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Create a pattern from a template with placeholders
   *
   * @param template - Template string with {name} placeholders
   * @param values - Values to substitute for placeholders
   * @param flags - Optional regex flags
   * @returns A regex with placeholders replaced
   *
   * @example
   * ```typescript
   * const pattern = this.createPatternFromTemplate(
   *   'import\\s+{name}\\s+from\\s+[\'\"]{module}[\'\"]',
   *   { name: '\\w+', module: '[^\'\"]+' },
   *   'g'
   * );
   * ```
   */
  protected createPatternFromTemplate(
    template: string,
    values: Record<string, string>,
    flags?: string
  ): RegExp {
    let pattern = template;
    for (const [key, value] of Object.entries(values)) {
      pattern = pattern.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return new RegExp(pattern, flags);
  }

  // ============================================================================
  // Location Conversion Helpers
  // ============================================================================

  /**
   * Convert a LineMatch to a Location object
   *
   * @param match - The line match to convert
   * @param file - The file path
   * @returns A Location object
   */
  protected lineMatchToLocation(match: LineMatch, file: string): Location {
    return {
      file,
      line: match.line,
      column: match.column,
      endLine: match.endLine,
      endColumn: match.endColumn,
    };
  }

  /**
   * Convert a PatternLocation to a Location object
   *
   * @param patternLocation - The pattern location to convert
   * @returns A Location object
   */
  protected patternLocationToLocation(patternLocation: PatternLocation): Location {
    return {
      file: patternLocation.file,
      line: patternLocation.line,
      column: patternLocation.column,
      endLine: patternLocation.endLine,
      endColumn: patternLocation.endColumn,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Line index information for position calculations
   */
  private buildLineIndex(content: string): number[] {
    const lineStarts: number[] = [0];
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        lineStarts.push(i + 1);
      }
    }
    return lineStarts;
  }

  /**
   * Convert a string index to line/column position
   */
  private indexToPosition(
    index: number,
    lineStarts: number[]
  ): { line: number; column: number } {
    // Binary search for the line
    let low = 0;
    let high = lineStarts.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (lineStarts[mid]! <= index) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return {
      line: low + 1, // 1-indexed
      column: index - lineStarts[low]! + 1, // 1-indexed
    };
  }

  /**
   * Get the content of one or more lines
   */
  private getLineContent(
    content: string,
    startLine: number,
    endLine: number,
    _lineStarts: number[]
  ): string {
    const lines = content.split('\n');
    const result: string[] = [];

    for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
      result.push(lines[i]!);
    }

    return result.join('\n');
  }

  /**
   * Normalize a regex pattern with options
   */
  private normalizePattern(
    pattern: RegExp,
    options: RegexMatchOptions & { global?: boolean }
  ): RegExp {
    let flags = pattern.flags;

    // Add global flag if requested and not present
    if (options.global && !flags.includes('g')) {
      flags += 'g';
    }

    // Add case-insensitive flag if requested
    if (options.caseInsensitive && !flags.includes('i')) {
      flags += 'i';
    }

    // Add multiline flag if requested
    if (options.multiline && !flags.includes('m')) {
      flags += 'm';
    }

    // Add dotAll flag if requested
    if (options.dotAll && !flags.includes('s')) {
      flags += 's';
    }

    // Return original if flags haven't changed
    if (flags === pattern.flags) {
      return pattern;
    }

    return new RegExp(pattern.source, flags);
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a detector is a regex detector
 *
 * @param detector - The detector to check
 * @returns true if the detector is a RegexDetector
 */
export function isRegexDetector(detector: BaseDetector): detector is RegexDetector {
  return detector.detectionMethod === 'regex';
}
