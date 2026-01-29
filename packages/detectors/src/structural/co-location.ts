/**
 * Co-location Detector - Test and style co-location detection
 *
 * Detects test co-location patterns (tests next to source vs separate directories)
 * and style co-location patterns (styles next to components vs separate directories).
 *
 * @requirements 7.3 - THE Structural_Detector SHALL detect co-location patterns (tests next to source vs separate)
 */

import { StructuralDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of co-location patterns
 */
export type CoLocationPattern = 'co-located' | 'separate' | 'mixed' | 'unknown';

/**
 * Common test file patterns
 */
export const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /_spec\.[jt]sx?$/,
] as const;

/**
 * Common test directory names
 */
export const TEST_DIRECTORIES = [
  '__tests__',
  'tests',
  'test',
  '__test__',
  'spec',
  'specs',
  '__specs__',
] as const;

/**
 * Common style file patterns
 */
export const STYLE_FILE_PATTERNS = [
  /\.module\.css$/,
  /\.module\.scss$/,
  /\.module\.sass$/,
  /\.module\.less$/,
  /\.styles?\.[jt]sx?$/,
  /\.css$/,
  /\.scss$/,
  /\.sass$/,
  /\.less$/,
  /\.styled\.[jt]sx?$/,
] as const;

/**
 * Common style directory names
 */
export const STYLE_DIRECTORIES = [
  'styles',
  'style',
  'css',
  'scss',
  '__styles__',
] as const;

/**
 * Information about a test file
 */
export interface TestFileInfo {
  /** Test file path */
  testFile: string;
  /** Corresponding source file (if found) */
  sourceFile: string | null;
  /** Whether the test is co-located with source */
  isCoLocated: boolean;
  /** Test directory (if in a test directory) */
  testDirectory: string | null;
}

/**
 * Information about a style file
 */
export interface StyleFileInfo {
  /** Style file path */
  styleFile: string;
  /** Corresponding component file (if found) */
  componentFile: string | null;
  /** Whether the style is co-located with component */
  isCoLocated: boolean;
  /** Style directory (if in a style directory) */
  styleDirectory: string | null;
}

/**
 * Analysis of test co-location patterns
 */
export interface TestCoLocationAnalysis {
  /** Detected pattern type */
  pattern: CoLocationPattern;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Co-located test files */
  coLocatedTests: TestFileInfo[];
  /** Separate test files (in test directories) */
  separateTests: TestFileInfo[];
  /** Total test files analyzed */
  totalTestFiles: number;
  /** Percentage of co-located tests */
  coLocationRatio: number;
}

/**
 * Analysis of style co-location patterns
 */
export interface StyleCoLocationAnalysis {
  /** Detected pattern type */
  pattern: CoLocationPattern;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Co-located style files */
  coLocatedStyles: StyleFileInfo[];
  /** Separate style files (in style directories) */
  separateStyles: StyleFileInfo[];
  /** Total style files analyzed */
  totalStyleFiles: number;
  /** Percentage of co-located styles */
  coLocationRatio: number;
}

/**
 * Combined co-location analysis
 */
export interface CoLocationAnalysis {
  /** Test co-location analysis */
  tests: TestCoLocationAnalysis;
  /** Style co-location analysis */
  styles: StyleCoLocationAnalysis;
  /** Overall confidence */
  confidence: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file is a test file
 */
export function isTestFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = normalizedPath.split('/').pop() || '';
  
  // Check file name patterns
  for (const pattern of TEST_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a file is in a test directory
 */
export function isInTestDirectory(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  
  for (const segment of segments) {
    const lowerSegment = segment.toLowerCase();
    if (TEST_DIRECTORIES.some(dir => lowerSegment === dir.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get the test directory from a file path (if any)
 */
export function getTestDirectory(filePath: string): string | null {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const lowerSegment = segment.toLowerCase();
    if (TEST_DIRECTORIES.some(dir => lowerSegment === dir.toLowerCase())) {
      return segments.slice(0, i + 1).join('/');
    }
  }
  
  return null;
}

/**
 * Check if a file is a style file
 */
export function isStyleFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = normalizedPath.split('/').pop() || '';
  
  // Check file name patterns
  for (const pattern of STYLE_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a file is in a style directory
 */
export function isInStyleDirectory(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  
  for (const segment of segments) {
    const lowerSegment = segment.toLowerCase();
    if (STYLE_DIRECTORIES.some(dir => lowerSegment === dir.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get the style directory from a file path (if any)
 */
export function getStyleDirectory(filePath: string): string | null {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const lowerSegment = segment.toLowerCase();
    if (STYLE_DIRECTORIES.some(dir => lowerSegment === dir.toLowerCase())) {
      return segments.slice(0, i + 1).join('/');
    }
  }
  
  return null;
}

/**
 * Extract the base name from a test file (remove test suffix)
 */
export function extractTestBaseName(testFile: string): string {
  const normalizedPath = testFile.replace(/\\/g, '/');
  const fileName = normalizedPath.split('/').pop() || '';
  
  // Remove test suffixes
  const baseName = fileName
    .replace(/\.test\.[jt]sx?$/, '')
    .replace(/\.spec\.[jt]sx?$/, '')
    .replace(/_test\.[jt]sx?$/, '')
    .replace(/_spec\.[jt]sx?$/, '');
  
  return baseName;
}

/**
 * Extract the base name from a style file (remove style suffix)
 */
export function extractStyleBaseName(styleFile: string): string {
  const normalizedPath = styleFile.replace(/\\/g, '/');
  const fileName = normalizedPath.split('/').pop() || '';
  
  // Remove style suffixes
  const baseName = fileName
    .replace(/\.module\.css$/, '')
    .replace(/\.module\.scss$/, '')
    .replace(/\.module\.sass$/, '')
    .replace(/\.module\.less$/, '')
    .replace(/\.styles?\.[jt]sx?$/, '')
    .replace(/\.styled\.[jt]sx?$/, '')
    .replace(/\.css$/, '')
    .replace(/\.scss$/, '')
    .replace(/\.sass$/, '')
    .replace(/\.less$/, '');
  
  return baseName;
}

/**
 * Get the directory of a file
 */
export function getFileDirectory(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const lastSlash = normalizedPath.lastIndexOf('/');
  return lastSlash === -1 ? '' : normalizedPath.slice(0, lastSlash);
}

/**
 * Find the corresponding source file for a test file
 */
export function findSourceFileForTest(testFile: string, allFiles: string[]): string | null {
  const baseName = extractTestBaseName(testFile);
  const testDir = getFileDirectory(testFile);
  const testDirName = getTestDirectory(testFile);
  
  // Common source file extensions
  const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  
  // First, look in the same directory (co-located)
  for (const ext of sourceExtensions) {
    const candidate = `${testDir}/${baseName}${ext}`;
    if (allFiles.some(f => f.replace(/\\/g, '/') === candidate)) {
      return candidate;
    }
  }
  
  // If test is in a test directory, look in parent or sibling directories
  if (testDirName) {
    // Get the path before the test directory
    const parentPath = testDirName.split('/').slice(0, -1).join('/');
    
    for (const ext of sourceExtensions) {
      // Check parent directory
      const parentCandidate = parentPath ? `${parentPath}/${baseName}${ext}` : `${baseName}${ext}`;
      if (allFiles.some(f => f.replace(/\\/g, '/') === parentCandidate)) {
        return parentCandidate;
      }
      
      // Check src sibling directory
      const srcCandidate = parentPath ? `${parentPath}/src/${baseName}${ext}` : `src/${baseName}${ext}`;
      if (allFiles.some(f => f.replace(/\\/g, '/') === srcCandidate)) {
        return srcCandidate;
      }
    }
  }
  
  // Search for any file with the same base name
  for (const file of allFiles) {
    const normalizedFile = file.replace(/\\/g, '/');
    const fileName = normalizedFile.split('/').pop() || '';
    
    for (const ext of sourceExtensions) {
      if (fileName === `${baseName}${ext}` && !isTestFile(normalizedFile)) {
        return normalizedFile;
      }
    }
  }
  
  return null;
}

/**
 * Find the corresponding component file for a style file
 */
export function findComponentFileForStyle(styleFile: string, allFiles: string[]): string | null {
  const baseName = extractStyleBaseName(styleFile);
  const styleDir = getFileDirectory(styleFile);
  const styleDirName = getStyleDirectory(styleFile);
  
  // Common component file extensions
  const componentExtensions = ['.tsx', '.jsx', '.ts', '.js'];
  
  // First, look in the same directory (co-located)
  for (const ext of componentExtensions) {
    const candidate = `${styleDir}/${baseName}${ext}`;
    if (allFiles.some(f => f.replace(/\\/g, '/') === candidate)) {
      return candidate;
    }
  }
  
  // If style is in a style directory, look in parent or sibling directories
  if (styleDirName) {
    // Get the path before the style directory
    const parentPath = styleDirName.split('/').slice(0, -1).join('/');
    
    for (const ext of componentExtensions) {
      // Check parent directory
      const parentCandidate = parentPath ? `${parentPath}/${baseName}${ext}` : `${baseName}${ext}`;
      if (allFiles.some(f => f.replace(/\\/g, '/') === parentCandidate)) {
        return parentCandidate;
      }
      
      // Check components sibling directory
      const componentsCandidate = parentPath ? `${parentPath}/components/${baseName}${ext}` : `components/${baseName}${ext}`;
      if (allFiles.some(f => f.replace(/\\/g, '/') === componentsCandidate)) {
        return componentsCandidate;
      }
    }
  }
  
  // Search for any file with the same base name
  for (const file of allFiles) {
    const normalizedFile = file.replace(/\\/g, '/');
    const fileName = normalizedFile.split('/').pop() || '';
    
    for (const ext of componentExtensions) {
      if (fileName === `${baseName}${ext}` && !isStyleFile(normalizedFile)) {
        return normalizedFile;
      }
    }
  }
  
  return null;
}

/**
 * Analyze test co-location patterns in a project
 */
export function analyzeTestCoLocation(files: string[]): TestCoLocationAnalysis {
  const testFiles = files.filter(f => isTestFile(f));
  const coLocatedTests: TestFileInfo[] = [];
  const separateTests: TestFileInfo[] = [];
  
  for (const testFile of testFiles) {
    const normalizedPath = testFile.replace(/\\/g, '/');
    const sourceFile = findSourceFileForTest(testFile, files);
    const testDirectory = getTestDirectory(testFile);
    const isInTestDir = isInTestDirectory(testFile);
    
    // A test is co-located if it's NOT in a test directory
    // and is in the same directory as its source file
    const testDir = getFileDirectory(normalizedPath);
    const sourceDir = sourceFile ? getFileDirectory(sourceFile) : null;
    const isCoLocated = !isInTestDir && (sourceDir === null || testDir === sourceDir);
    
    const info: TestFileInfo = {
      testFile: normalizedPath,
      sourceFile,
      isCoLocated,
      testDirectory,
    };
    
    if (isCoLocated) {
      coLocatedTests.push(info);
    } else {
      separateTests.push(info);
    }
  }
  
  const totalTestFiles = testFiles.length;
  const coLocationRatio = totalTestFiles > 0 ? coLocatedTests.length / totalTestFiles : 0;
  
  // Determine pattern type
  let pattern: CoLocationPattern;
  let confidence: number;
  
  if (totalTestFiles === 0) {
    pattern = 'unknown';
    confidence = 0;
  } else if (coLocationRatio >= 0.8) {
    pattern = 'co-located';
    confidence = coLocationRatio;
  } else if (coLocationRatio <= 0.2) {
    pattern = 'separate';
    confidence = 1 - coLocationRatio;
  } else {
    pattern = 'mixed';
    confidence = 0.5 + Math.abs(coLocationRatio - 0.5);
  }
  
  return {
    pattern,
    confidence,
    coLocatedTests,
    separateTests,
    totalTestFiles,
    coLocationRatio,
  };
}

/**
 * Analyze style co-location patterns in a project
 */
export function analyzeStyleCoLocation(files: string[]): StyleCoLocationAnalysis {
  const styleFiles = files.filter(f => isStyleFile(f));
  const coLocatedStyles: StyleFileInfo[] = [];
  const separateStyles: StyleFileInfo[] = [];
  
  for (const styleFile of styleFiles) {
    const normalizedPath = styleFile.replace(/\\/g, '/');
    const componentFile = findComponentFileForStyle(styleFile, files);
    const styleDirectory = getStyleDirectory(styleFile);
    const isInStyleDir = isInStyleDirectory(styleFile);
    
    // A style is co-located if it's NOT in a style directory
    // and is in the same directory as its component file
    const styleDir = getFileDirectory(normalizedPath);
    const componentDir = componentFile ? getFileDirectory(componentFile) : null;
    const isCoLocated = !isInStyleDir && (componentDir === null || styleDir === componentDir);
    
    const info: StyleFileInfo = {
      styleFile: normalizedPath,
      componentFile,
      isCoLocated,
      styleDirectory,
    };
    
    if (isCoLocated) {
      coLocatedStyles.push(info);
    } else {
      separateStyles.push(info);
    }
  }
  
  const totalStyleFiles = styleFiles.length;
  const coLocationRatio = totalStyleFiles > 0 ? coLocatedStyles.length / totalStyleFiles : 0;
  
  // Determine pattern type
  let pattern: CoLocationPattern;
  let confidence: number;
  
  if (totalStyleFiles === 0) {
    pattern = 'unknown';
    confidence = 0;
  } else if (coLocationRatio >= 0.8) {
    pattern = 'co-located';
    confidence = coLocationRatio;
  } else if (coLocationRatio <= 0.2) {
    pattern = 'separate';
    confidence = 1 - coLocationRatio;
  } else {
    pattern = 'mixed';
    confidence = 0.5 + Math.abs(coLocationRatio - 0.5);
  }
  
  return {
    pattern,
    confidence,
    coLocatedStyles,
    separateStyles,
    totalStyleFiles,
    coLocationRatio,
  };
}

/**
 * Analyze all co-location patterns in a project
 */
export function analyzeCoLocation(files: string[]): CoLocationAnalysis {
  const tests = analyzeTestCoLocation(files);
  const styles = analyzeStyleCoLocation(files);
  
  // Calculate overall confidence as weighted average
  const totalFiles = tests.totalTestFiles + styles.totalStyleFiles;
  let confidence: number;
  
  if (totalFiles === 0) {
    confidence = 0;
  } else {
    const testWeight = tests.totalTestFiles / totalFiles;
    const styleWeight = styles.totalStyleFiles / totalFiles;
    confidence = tests.confidence * testWeight + styles.confidence * styleWeight;
  }
  
  return {
    tests,
    styles,
    confidence,
  };
}

// ============================================================================
// Co-location Detector Class
// ============================================================================

/**
 * Detector for co-location patterns
 *
 * Identifies whether a project uses co-located tests/styles (next to source)
 * or separate directories for tests and styles.
 *
 * @requirements 7.3 - THE Structural_Detector SHALL detect co-location patterns
 */
export class CoLocationDetector extends StructuralDetector {
  readonly id = 'structural/co-location';
  readonly category = 'structural' as const;
  readonly subcategory = 'co-location';
  readonly name = 'Co-location Detector';
  readonly description = 'Detects test and style co-location patterns (co-located vs separate directories)';
  readonly supportedLanguages: Language[] = [
    'typescript',
    'javascript',
    'css',
    'scss',
  ];

  /**
   * Detect co-location patterns in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Analyze the entire project's co-location patterns
    const analysis = analyzeCoLocation(context.projectContext.files);

    // Create pattern matches for detected patterns
    if (analysis.tests.pattern !== 'unknown') {
      patterns.push(this.createTestCoLocationPattern(context.file, analysis.tests));
    }

    if (analysis.styles.pattern !== 'unknown') {
      patterns.push(this.createStyleCoLocationPattern(context.file, analysis.styles));
    }

    // Generate violations for inconsistent co-location
    const testViolation = this.checkTestCoLocationConsistency(context.file, analysis.tests);
    if (testViolation) {
      violations.push(testViolation);
    }

    const styleViolation = this.checkStyleCoLocationConsistency(context.file, analysis.styles);
    if (styleViolation) {
      violations.push(styleViolation);
    }

    return this.createResult(patterns, violations, analysis.confidence);
  }

  /**
   * Generate a quick fix for co-location violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Co-location violations typically require manual refactoring
    if (violation.patternId === 'structural/co-location-test-inconsistency') {
      return {
        title: 'Move test file to follow project pattern',
        kind: 'refactor',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: false,
        confidence: 0.5,
        preview: `Consider moving test file to follow the ${violation.expected} pattern`,
      };
    }

    if (violation.patternId === 'structural/co-location-style-inconsistency') {
      return {
        title: 'Move style file to follow project pattern',
        kind: 'refactor',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: false,
        confidence: 0.5,
        preview: `Consider moving style file to follow the ${violation.expected} pattern`,
      };
    }

    return null;
  }

  /**
   * Create a pattern match for test co-location
   */
  private createTestCoLocationPattern(
    file: string,
    analysis: TestCoLocationAnalysis
  ): PatternMatch {
    return {
      patternId: `co-location-test-${analysis.pattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for style co-location
   */
  private createStyleCoLocationPattern(
    file: string,
    analysis: StyleCoLocationAnalysis
  ): PatternMatch {
    return {
      patternId: `co-location-style-${analysis.pattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    };
  }

  /**
   * Check if the current file follows the project's test co-location pattern
   */
  private checkTestCoLocationConsistency(
    file: string,
    analysis: TestCoLocationAnalysis
  ): Violation | null {
    // Only check test files
    if (!isTestFile(file)) {
      return null;
    }

    // Skip if pattern is unknown or mixed (no clear pattern to enforce)
    if (analysis.pattern === 'unknown' || analysis.pattern === 'mixed') {
      return null;
    }

    const normalizedPath = file.replace(/\\/g, '/');
    const isInTestDir = isInTestDirectory(file);
    const isFileCoLocated = !isInTestDir;

    // Check if file follows the dominant pattern
    const followsPattern = 
      (analysis.pattern === 'co-located' && isFileCoLocated) ||
      (analysis.pattern === 'separate' && !isFileCoLocated);

    if (followsPattern) {
      return null;
    }

    const range: Range = {
      start: { line: 1, character: 1 },
      end: { line: 1, character: 1 },
    };

    let message: string;
    let expected: string;
    let actual: string;

    if (analysis.pattern === 'co-located') {
      message = `Test file '${normalizedPath}' is in a separate test directory but project uses co-located tests. Consider moving it next to its source file.`;
      expected = 'co-located tests (test files next to source files)';
      actual = 'test file in separate test directory';
    } else {
      message = `Test file '${normalizedPath}' is co-located with source but project uses separate test directories. Consider moving it to a test directory.`;
      expected = 'separate test directories (__tests__/, tests/)';
      actual = 'test file co-located with source';
    }

    return {
      id: `co-location-test-${normalizedPath.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/co-location-test-inconsistency',
      severity: 'info',
      file,
      range,
      message,
      expected,
      actual,
      aiExplainAvailable: true,
      aiFixAvailable: false,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  /**
   * Check if the current file follows the project's style co-location pattern
   */
  private checkStyleCoLocationConsistency(
    file: string,
    analysis: StyleCoLocationAnalysis
  ): Violation | null {
    // Only check style files
    if (!isStyleFile(file)) {
      return null;
    }

    // Skip if pattern is unknown or mixed (no clear pattern to enforce)
    if (analysis.pattern === 'unknown' || analysis.pattern === 'mixed') {
      return null;
    }

    const normalizedPath = file.replace(/\\/g, '/');
    const isInStyleDir = isInStyleDirectory(file);
    const isFileCoLocated = !isInStyleDir;

    // Check if file follows the dominant pattern
    const followsPattern = 
      (analysis.pattern === 'co-located' && isFileCoLocated) ||
      (analysis.pattern === 'separate' && !isFileCoLocated);

    if (followsPattern) {
      return null;
    }

    const range: Range = {
      start: { line: 1, character: 1 },
      end: { line: 1, character: 1 },
    };

    let message: string;
    let expected: string;
    let actual: string;

    if (analysis.pattern === 'co-located') {
      message = `Style file '${normalizedPath}' is in a separate styles directory but project uses co-located styles. Consider moving it next to its component.`;
      expected = 'co-located styles (style files next to components)';
      actual = 'style file in separate styles directory';
    } else {
      message = `Style file '${normalizedPath}' is co-located with component but project uses separate style directories. Consider moving it to a styles directory.`;
      expected = 'separate style directories (styles/, css/)';
      actual = 'style file co-located with component';
    }

    return {
      id: `co-location-style-${normalizedPath.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/co-location-style-inconsistency',
      severity: 'info',
      file,
      range,
      message,
      expected,
      actual,
      aiExplainAvailable: true,
      aiFixAvailable: false,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new CoLocationDetector instance
 */
export function createCoLocationDetector(): CoLocationDetector {
  return new CoLocationDetector();
}
