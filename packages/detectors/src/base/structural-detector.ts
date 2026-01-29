 /**
 * Structural Detector - File/directory structure detection base class
 *
 * Provides path pattern matching helpers and utilities for structural pattern detection.
 * Extends BaseDetector with specialized methods for analyzing file and directory structures.
 *
 * @requirements 6.4 - THE Detector_System SHALL support detection methods: ast, regex, semantic, structural, and custom
 */

import { BaseDetector } from './base-detector.js';

import type { Location } from 'driftdetect-core';


// ============================================================================
// Naming Convention Types
// ============================================================================

/**
 * Supported naming conventions for file and identifier names
 */
export type NamingConvention =
  | 'PascalCase'
  | 'camelCase'
  | 'kebab-case'
  | 'snake_case'
  | 'SCREAMING_SNAKE_CASE'
  | 'flatcase';

/**
 * Result of a naming convention check
 */
export interface NamingConventionResult {
  /** Whether the name matches the convention */
  matches: boolean;

  /** The detected convention (if any) */
  detectedConvention: NamingConvention | null;

  /** Suggested name in the expected convention */
  suggestedName?: string;
}

// ============================================================================
// Path Match Types
// ============================================================================

/**
 * Result of a path pattern match
 */
export interface PathMatchResult {
  /** Whether the path matches the pattern */
  matches: boolean;

  /** Captured groups from the pattern (if any) */
  captures: Record<string, string>;

  /** The matched portion of the path */
  matchedPortion?: string;
}

/**
 * Information about a file path
 */
export interface PathInfo {
  /** Full file path */
  fullPath: string;

  /** Directory path (without file name) */
  directory: string;

  /** File name with extension */
  fileName: string;

  /** File name without extension */
  baseName: string;

  /** File extension (including the dot) */
  extension: string;

  /** Path segments (directories and file) */
  segments: string[];

  /** Depth of the path (number of directory levels) */
  depth: number;
}

/**
 * Options for path matching operations
 */
export interface PathMatchOptions {
  /** Whether to match case-insensitively */
  caseInsensitive?: boolean;

  /** Whether to use extended glob patterns */
  extendedGlob?: boolean;

  /** Base path for relative matching */
  basePath?: string;
}

// ============================================================================
// Structural Detector Abstract Class
// ============================================================================

/**
 * Abstract base class for structural detectors
 *
 * Provides path pattern matching helpers and utilities for detection
 * that operates on file and directory structures.
 *
 * @requirements 6.4 - THE Detector_System SHALL support detection methods: structural
 *
 * @example
 * ```typescript
 * class FileNamingDetector extends StructuralDetector {
 *   readonly id = 'structural/file-naming';
 *   readonly category = 'structural';
 *   readonly subcategory = 'naming-conventions';
 *   readonly name = 'File Naming Detector';
 *   readonly description = 'Detects file naming patterns';
 *   readonly supportedLanguages = ['typescript', 'javascript'];
 *
 *   async detect(context: DetectionContext): Promise<DetectionResult> {
 *     const fileName = this.getFileName(context.file);
 *     const convention = this.matchNamingConvention(fileName, 'PascalCase');
 *     // Analyze file naming patterns...
 *   }
 *
 *   generateQuickFix(violation: Violation): QuickFix | null {
 *     return null;
 *   }
 * }
 * ```
 */
export abstract class StructuralDetector extends BaseDetector {
  /**
   * Detection method is always 'structural' for structural detectors
   *
   * @requirements 6.4 - Detector declares detection method as 'structural'
   */
  readonly detectionMethod = 'structural' as const;

  // ============================================================================
  // Path Pattern Matching Methods
  // ============================================================================

  /**
   * Match a file path against a glob pattern
   *
   * Supports common glob patterns:
   * - `*` matches any characters except path separators
   * - `**` matches any characters including path separators
   * - `?` matches a single character
   * - `[abc]` matches any character in the brackets
   * - `[!abc]` matches any character not in the brackets
   * - `{a,b,c}` matches any of the alternatives
   *
   * @param path - The file path to match
   * @param pattern - The glob pattern to match against
   * @param options - Optional matching options
   * @returns PathMatchResult with match status and captures
   *
   * @example
   * ```typescript
   * const result = this.matchPath('src/components/Button.tsx', 'src/components/*.tsx');
   * // result.matches === true
   *
   * const result2 = this.matchPath('src/utils/helpers.ts', '**\/*.test.ts');
   * // result2.matches === false
   * ```
   */
  protected matchPath(
    path: string,
    pattern: string,
    options: PathMatchOptions = {}
  ): PathMatchResult {
    const normalizedPath = this.normalizePath(path);
    const normalizedPattern = this.normalizePath(pattern);

    const regex = this.globToRegex(normalizedPattern, options);
    const match = normalizedPath.match(regex);

    if (!match) {
      return { matches: false, captures: {} };
    }

    const captures: Record<string, string> = {};
    if (match.groups) {
      Object.assign(captures, match.groups);
    }

    return {
      matches: true,
      captures,
      matchedPortion: match[0],
    };
  }

  /**
   * Match a file name against a pattern
   *
   * Matches only the file name portion (not the directory path).
   *
   * @param fileName - The file name to match (with or without extension)
   * @param pattern - The pattern to match against (glob or regex string)
   * @param options - Optional matching options
   * @returns PathMatchResult with match status
   *
   * @example
   * ```typescript
   * const result = this.matchFileName('Button.tsx', '*.tsx');
   * // result.matches === true
   *
   * const result2 = this.matchFileName('useAuth.ts', 'use*.ts');
   * // result2.matches === true
   * ```
   */
  protected matchFileName(
    fileName: string,
    pattern: string,
    options: PathMatchOptions = {}
  ): PathMatchResult {
    // Extract just the file name if a full path was provided
    const name = this.getFileName(fileName) + this.getFileExtension(fileName);
    const regex = this.globToRegex(pattern, { ...options, isFileName: true });
    const match = name.match(regex);

    if (!match) {
      return { matches: false, captures: {} };
    }

    const captures: Record<string, string> = {};
    if (match.groups) {
      Object.assign(captures, match.groups);
    }

    return {
      matches: true,
      captures,
      matchedPortion: match[0],
    };
  }

  // ============================================================================
  // Path Component Extraction Methods
  // ============================================================================

  /**
   * Get the file extension from a path
   *
   * Returns the extension including the leading dot.
   * For files with multiple extensions (e.g., .test.ts), returns only the last extension.
   *
   * @param path - The file path
   * @returns The file extension (e.g., '.ts', '.tsx') or empty string if none
   *
   * @example
   * ```typescript
   * this.getFileExtension('src/Button.tsx'); // '.tsx'
   * this.getFileExtension('README'); // ''
   * this.getFileExtension('file.test.ts'); // '.ts'
   * ```
   */
  protected getFileExtension(path: string): string {
    const normalizedPath = this.normalizePath(path);
    const fileName = normalizedPath.split('/').pop() || '';
    const lastDotIndex = fileName.lastIndexOf('.');

    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return '';
    }

    return fileName.slice(lastDotIndex);
  }

  /**
   * Get the file name without extension from a path
   *
   * @param path - The file path
   * @returns The file name without extension
   *
   * @example
   * ```typescript
   * this.getFileName('src/components/Button.tsx'); // 'Button'
   * this.getFileName('README.md'); // 'README'
   * this.getFileName('file.test.ts'); // 'file.test'
   * ```
   */
  protected getFileName(path: string): string {
    const normalizedPath = this.normalizePath(path);
    const fileName = normalizedPath.split('/').pop() || '';
    const lastDotIndex = fileName.lastIndexOf('.');

    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return fileName;
    }

    return fileName.slice(0, lastDotIndex);
  }

  /**
   * Get the directory path from a file path
   *
   * Returns the path without the file name.
   *
   * @param path - The file path
   * @returns The directory path (empty string if file is in root)
   *
   * @example
   * ```typescript
   * this.getDirectoryPath('src/components/Button.tsx'); // 'src/components'
   * this.getDirectoryPath('index.ts'); // ''
   * this.getDirectoryPath('src/utils/'); // 'src/utils'
   * ```
   */
  protected getDirectoryPath(path: string): string {
    const normalizedPath = this.normalizePath(path);
    const lastSlashIndex = normalizedPath.lastIndexOf('/');

    if (lastSlashIndex === -1) {
      return '';
    }

    return normalizedPath.slice(0, lastSlashIndex);
  }

  /**
   * Get detailed information about a file path
   *
   * @param path - The file path to analyze
   * @returns PathInfo object with all path components
   *
   * @example
   * ```typescript
   * const info = this.getPathInfo('src/components/Button.tsx');
   * // info.directory === 'src/components'
   * // info.fileName === 'Button.tsx'
   * // info.baseName === 'Button'
   * // info.extension === '.tsx'
   * // info.segments === ['src', 'components', 'Button.tsx']
   * // info.depth === 2
   * ```
   */
  protected getPathInfo(path: string): PathInfo {
    const normalizedPath = this.normalizePath(path);
    const segments = normalizedPath.split('/').filter((s) => s.length > 0);
    const fileName = segments[segments.length - 1] || '';
    const extension = this.getFileExtension(normalizedPath);
    const baseName = this.getFileName(normalizedPath);
    const directory = this.getDirectoryPath(normalizedPath);

    return {
      fullPath: normalizedPath,
      directory,
      fileName,
      baseName,
      extension,
      segments,
      depth: segments.length - 1, // Depth is number of directories
    };
  }

  // ============================================================================
  // Directory Relationship Methods
  // ============================================================================

  /**
   * Check if a file is in a specific directory (or its subdirectories)
   *
   * @param path - The file path to check
   * @param directory - The directory to check against
   * @param recursive - Whether to check subdirectories (default: true)
   * @returns true if the file is in the directory
   *
   * @example
   * ```typescript
   * this.isInDirectory('src/components/Button.tsx', 'src/components'); // true
   * this.isInDirectory('src/components/ui/Button.tsx', 'src/components'); // true (recursive)
   * this.isInDirectory('src/components/ui/Button.tsx', 'src/components', false); // false
   * this.isInDirectory('src/utils/helpers.ts', 'src/components'); // false
   * ```
   */
  protected isInDirectory(
    path: string,
    directory: string,
    recursive: boolean = true
  ): boolean {
    const normalizedPath = this.normalizePath(path);
    const normalizedDir = this.normalizePath(directory).replace(/\/$/, '');

    const pathDir = this.getDirectoryPath(normalizedPath);

    if (recursive) {
      return pathDir === normalizedDir || pathDir.startsWith(normalizedDir + '/');
    }

    return pathDir === normalizedDir;
  }

  /**
   * Get the relative path from a base path
   *
   * @param path - The full file path
   * @param basePath - The base path to make relative to
   * @returns The relative path, or the original path if not under basePath
   *
   * @example
   * ```typescript
   * this.getRelativePath('src/components/Button.tsx', 'src'); // 'components/Button.tsx'
   * this.getRelativePath('src/components/Button.tsx', 'src/components'); // 'Button.tsx'
   * this.getRelativePath('other/file.ts', 'src'); // 'other/file.ts' (not under base)
   * ```
   */
  protected getRelativePath(path: string, basePath: string): string {
    const normalizedPath = this.normalizePath(path);
    const normalizedBase = this.normalizePath(basePath).replace(/\/$/, '');

    if (!normalizedPath.startsWith(normalizedBase + '/')) {
      return normalizedPath;
    }

    return normalizedPath.slice(normalizedBase.length + 1);
  }

  /**
   * Get the common base path of multiple paths
   *
   * @param paths - Array of file paths
   * @returns The common base path, or empty string if none
   *
   * @example
   * ```typescript
   * this.getCommonBasePath(['src/a/file.ts', 'src/b/file.ts']); // 'src'
   * this.getCommonBasePath(['src/components/Button.tsx', 'src/components/Input.tsx']); // 'src/components'
   * this.getCommonBasePath(['a/file.ts', 'b/file.ts']); // ''
   * ```
   */
  protected getCommonBasePath(paths: string[]): string {
    if (paths.length === 0) {
      return '';
    }

    if (paths.length === 1) {
      return this.getDirectoryPath(paths[0]!);
    }

    const normalizedPaths = paths.map((p) => this.normalizePath(p));
    const segments = normalizedPaths.map((p) => p.split('/'));
    const minLength = Math.min(...segments.map((s) => s.length));

    const commonSegments: string[] = [];

    for (let i = 0; i < minLength - 1; i++) {
      const segment = segments[0]![i];
      const allMatch = segments.every((s) => s[i] === segment);

      if (allMatch) {
        commonSegments.push(segment!);
      } else {
        break;
      }
    }

    return commonSegments.join('/');
  }

  /**
   * Get sibling files (files in the same directory)
   *
   * @param path - The file path
   * @param allFiles - Array of all file paths in the project
   * @returns Array of sibling file paths (excluding the input file)
   *
   * @example
   * ```typescript
   * const siblings = this.getSiblingFiles('src/Button.tsx', projectFiles);
   * // Returns other files in 'src/' directory
   * ```
   */
  protected getSiblingFiles(path: string, allFiles: string[]): string[] {
    const directory = this.getDirectoryPath(path);
    const normalizedPath = this.normalizePath(path);

    return allFiles.filter((file) => {
      const normalizedFile = this.normalizePath(file);
      return (
        normalizedFile !== normalizedPath &&
        this.getDirectoryPath(normalizedFile) === directory
      );
    });
  }

  // ============================================================================
  // Naming Convention Methods
  // ============================================================================

  /**
   * Check if a name matches a specific naming convention
   *
   * @param name - The name to check (file name, identifier, etc.)
   * @param convention - The naming convention to check against
   * @returns NamingConventionResult with match status and suggestions
   *
   * @example
   * ```typescript
   * this.matchNamingConvention('MyComponent', 'PascalCase'); // { matches: true, ... }
   * this.matchNamingConvention('myFunction', 'camelCase'); // { matches: true, ... }
   * this.matchNamingConvention('my-component', 'kebab-case'); // { matches: true, ... }
   * this.matchNamingConvention('my_variable', 'snake_case'); // { matches: true, ... }
   * this.matchNamingConvention('MAX_VALUE', 'SCREAMING_SNAKE_CASE'); // { matches: true, ... }
   * ```
   */
  protected matchNamingConvention(
    name: string,
    convention: NamingConvention
  ): NamingConventionResult {
    const detectedConvention = this.detectNamingConvention(name);
    const matches = detectedConvention === convention;

    const result: NamingConventionResult = {
      matches,
      detectedConvention,
    };

    if (!matches) {
      result.suggestedName = this.convertToConvention(name, convention);
    }

    return result;
  }

  /**
   * Detect the naming convention of a name
   *
   * @param name - The name to analyze
   * @returns The detected naming convention, or null if unknown
   *
   * @example
   * ```typescript
   * this.detectNamingConvention('MyComponent'); // 'PascalCase'
   * this.detectNamingConvention('myFunction'); // 'camelCase'
   * this.detectNamingConvention('my-component'); // 'kebab-case'
   * this.detectNamingConvention('my_variable'); // 'snake_case'
   * this.detectNamingConvention('MAX_VALUE'); // 'SCREAMING_SNAKE_CASE'
   * this.detectNamingConvention('mycomponent'); // 'flatcase'
   * ```
   */
  protected detectNamingConvention(name: string): NamingConvention | null {
    if (!name || name.length === 0) {
      return null;
    }

    // Check for SCREAMING_SNAKE_CASE (all uppercase with underscores, must have underscore)
    if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(name)) {
      return 'SCREAMING_SNAKE_CASE';
    }

    // Check for kebab-case (lowercase with hyphens, must have hyphen)
    if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name)) {
      return 'kebab-case';
    }

    // Check for snake_case (lowercase with underscores, must have underscore)
    if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)) {
      return 'snake_case';
    }

    // Check for PascalCase (starts with uppercase, no separators)
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name) && /[a-z]/.test(name)) {
      return 'PascalCase';
    }

    // Check for camelCase (starts with lowercase, has uppercase)
    if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) {
      return 'camelCase';
    }

    // Check for flatcase (all lowercase, no separators)
    if (/^[a-z][a-z0-9]*$/.test(name)) {
      return 'flatcase';
    }

    return null;
  }

  /**
   * Convert a name to a specific naming convention
   *
   * @param name - The name to convert
   * @param convention - The target naming convention
   * @returns The converted name
   *
   * @example
   * ```typescript
   * this.convertToConvention('myComponent', 'PascalCase'); // 'MyComponent'
   * this.convertToConvention('MyComponent', 'camelCase'); // 'myComponent'
   * this.convertToConvention('MyComponent', 'kebab-case'); // 'my-component'
   * this.convertToConvention('myComponent', 'snake_case'); // 'my_component'
   * this.convertToConvention('myComponent', 'SCREAMING_SNAKE_CASE'); // 'MY_COMPONENT'
   * ```
   */
  protected convertToConvention(name: string, convention: NamingConvention): string {
    // First, split the name into words
    const words = this.splitIntoWords(name);

    if (words.length === 0) {
      return name;
    }

    switch (convention) {
      case 'PascalCase':
        return words.map((w) => this.capitalize(w)).join('');

      case 'camelCase':
        return words
          .map((w, i) => (i === 0 ? w.toLowerCase() : this.capitalize(w)))
          .join('');

      case 'kebab-case':
        return words.map((w) => w.toLowerCase()).join('-');

      case 'snake_case':
        return words.map((w) => w.toLowerCase()).join('_');

      case 'SCREAMING_SNAKE_CASE':
        return words.map((w) => w.toUpperCase()).join('_');

      case 'flatcase':
        return words.map((w) => w.toLowerCase()).join('');

      default:
        return name;
    }
  }

  /**
   * Split a name into words based on common conventions
   *
   * @param name - The name to split
   * @returns Array of words
   */
  private splitIntoWords(name: string): string[] {
    // Handle kebab-case and snake_case
    if (name.includes('-') || name.includes('_')) {
      return name.split(/[-_]+/).filter((w) => w.length > 0);
    }

    // Handle PascalCase and camelCase
    const words: string[] = [];
    let currentWord = '';

    for (let i = 0; i < name.length; i++) {
      const char = name[i]!;
      const isUpperCase = char === char.toUpperCase() && char !== char.toLowerCase();

      if (isUpperCase && currentWord.length > 0) {
        words.push(currentWord);
        currentWord = char;
      } else {
        currentWord += char;
      }
    }

    if (currentWord.length > 0) {
      words.push(currentWord);
    }

    return words;
  }

  /**
   * Capitalize the first letter of a word
   */
  private capitalize(word: string): string {
    if (word.length === 0) {
      return word;
    }
    return word[0]!.toUpperCase() + word.slice(1).toLowerCase();
  }

  // ============================================================================
  // File Type Detection Methods
  // ============================================================================

  /**
   * Check if a file is a test file based on common patterns
   *
   * @param path - The file path to check
   * @returns true if the file appears to be a test file
   *
   * @example
   * ```typescript
   * this.isTestFile('Button.test.ts'); // true
   * this.isTestFile('Button.spec.tsx'); // true
   * this.isTestFile('__tests__/Button.ts'); // true
   * this.isTestFile('Button.tsx'); // false
   * ```
   */
  protected isTestFile(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const fileName = this.getFileName(normalizedPath);

    // Check for test/spec suffix
    if (/\.(test|spec)$/.test(fileName)) {
      return true;
    }

    // Check for __tests__ directory anywhere in path
    if (normalizedPath.includes('__tests__/') || normalizedPath.startsWith('__tests__/')) {
      return true;
    }

    // Check for test/ or tests/ directory at root
    if (/^tests?\//.test(normalizedPath)) {
      return true;
    }

    return false;
  }

  /**
   * Check if a file is a type definition file
   *
   * @param path - The file path to check
   * @returns true if the file is a type definition
   *
   * @example
   * ```typescript
   * this.isTypeDefinitionFile('types.d.ts'); // true
   * this.isTypeDefinitionFile('index.d.ts'); // true
   * this.isTypeDefinitionFile('Button.tsx'); // false
   * ```
   */
  protected isTypeDefinitionFile(path: string): boolean {
    return path.endsWith('.d.ts');
  }

  /**
   * Check if a file is an index/barrel file
   *
   * @param path - The file path to check
   * @returns true if the file is an index file
   *
   * @example
   * ```typescript
   * this.isIndexFile('index.ts'); // true
   * this.isIndexFile('src/index.tsx'); // true
   * this.isIndexFile('Button.tsx'); // false
   * ```
   */
  protected isIndexFile(path: string): boolean {
    const fileName = this.getFileName(path);
    return fileName === 'index';
  }

  /**
   * Check if a file is a configuration file
   *
   * @param path - The file path to check
   * @returns true if the file appears to be a config file
   *
   * @example
   * ```typescript
   * this.isConfigFile('tsconfig.json'); // true
   * this.isConfigFile('.eslintrc.js'); // true
   * this.isConfigFile('vite.config.ts'); // true
   * this.isConfigFile('Button.tsx'); // false
   * ```
   */
  protected isConfigFile(path: string): boolean {
    const fileName = this.getFileName(path) + this.getFileExtension(path);

    // Common config file patterns
    const configPatterns = [
      /^\..*rc(\.js|\.json|\.yaml|\.yml)?$/,  // .eslintrc, .prettierrc, etc.
      /^.*\.config\.(js|ts|mjs|cjs|json)$/,   // vite.config.ts, etc.
      /^tsconfig.*\.json$/,                    // tsconfig.json, tsconfig.build.json
      /^package\.json$/,
      /^\.env(\..*)?$/,                        // .env, .env.local, etc.
      /^jest\.config\.(js|ts|mjs|cjs)$/,
      /^webpack\.config\.(js|ts)$/,
      /^rollup\.config\.(js|ts|mjs)$/,
      /^babel\.config\.(js|json|cjs)$/,
    ];

    return configPatterns.some((pattern) => pattern.test(fileName));
  }

  // ============================================================================
  // Location Conversion Helpers
  // ============================================================================

  /**
   * Create a Location object for a file
   *
   * @param file - The file path
   * @param line - Line number (1-indexed, default: 1)
   * @param column - Column number (1-indexed, default: 1)
   * @returns A Location object
   */
  protected createFileLocation(
    file: string,
    line: number = 1,
    column: number = 1
  ): Location {
    return {
      file,
      line,
      column,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Normalize a file path to use forward slashes
   */
  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  /**
   * Convert a glob pattern to a regular expression
   */
  private globToRegex(
    pattern: string,
    options: PathMatchOptions & { isFileName?: boolean } = {}
  ): RegExp {
    let regexStr = '';
    let i = 0;

    while (i < pattern.length) {
      const char = pattern[i]!;
      const nextChar = pattern[i + 1];

      switch (char) {
        case '*':
          if (nextChar === '*') {
            // ** matches anything including path separators
            regexStr += '.*';
            i += 2;
            // Skip following slash if present
            if (pattern[i] === '/') {
              i++;
            }
          } else {
            // * matches anything except path separators
            regexStr += options.isFileName ? '.*' : '[^/]*';
            i++;
          }
          break;

        case '?':
          // ? matches a single character (not path separator)
          regexStr += options.isFileName ? '.' : '[^/]';
          i++;
          break;

        case '[':
          // Character class
          const closeBracket = pattern.indexOf(']', i);
          if (closeBracket === -1) {
            regexStr += '\\[';
            i++;
          } else {
            const charClass = pattern.slice(i, closeBracket + 1);
            // Handle negation [!...] -> [^...]
            if (charClass[1] === '!') {
              regexStr += '[^' + charClass.slice(2);
            } else {
              regexStr += charClass;
            }
            i = closeBracket + 1;
          }
          break;

        case '{':
          // Alternation {a,b,c}
          const closeBrace = pattern.indexOf('}', i);
          if (closeBrace === -1) {
            regexStr += '\\{';
            i++;
          } else {
            const alternatives = pattern.slice(i + 1, closeBrace).split(',');
            regexStr += '(?:' + alternatives.map((a) => this.escapeRegex(a)).join('|') + ')';
            i = closeBrace + 1;
          }
          break;

        case '.':
        case '+':
        case '^':
        case '$':
        case '(':
        case ')':
        case '|':
        case '\\':
          // Escape regex special characters
          regexStr += '\\' + char;
          i++;
          break;

        default:
          regexStr += char;
          i++;
      }
    }

    const flags = options.caseInsensitive ? 'i' : '';
    return new RegExp('^' + regexStr + '$', flags);
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}


// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a detector is a structural detector
 *
 * @param detector - The detector to check
 * @returns true if the detector is a StructuralDetector
 */
export function isStructuralDetector(
  detector: BaseDetector
): detector is StructuralDetector {
  return detector.detectionMethod === 'structural';
}
