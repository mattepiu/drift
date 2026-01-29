/**
 * Barrel Exports Detector - Index file pattern detection
 *
 * Detects index.ts/index.js usage patterns and export patterns.
 * Identifies barrel files that re-export from other modules and
 * analyzes consistency of barrel file usage across the project.
 *
 * @requirements 7.4 - THE Structural_Detector SHALL detect barrel/index file usage patterns
 */

import { StructuralDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of barrel file patterns
 */
export type BarrelPattern = 'consistent' | 'inconsistent' | 'none' | 'unknown';

/**
 * Types of export patterns found in barrel files
 */
export type ExportType = 
  | 'named-export'        // export { foo } from './foo'
  | 'namespace-export'    // export * from './foo'
  | 'default-reexport'    // export { default } from './foo'
  | 'named-reexport'      // export { foo as bar } from './foo'
  | 'direct-export'       // export const foo = ...
  | 'default-export';     // export default ...

/**
 * Common barrel file names
 */
export const BARREL_FILE_NAMES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.cjs',
] as const;

/**
 * Directories that typically should have barrel files
 */
export const BARREL_EXPECTED_DIRECTORIES = [
  'components',
  'hooks',
  'utils',
  'helpers',
  'services',
  'lib',
  'types',
  'models',
  'features',
  'modules',
  'pages',
  'api',
  'store',
  'contexts',
  'providers',
] as const;

/**
 * Information about a barrel file
 */
export interface BarrelFileInfo {
  /** File path */
  path: string;
  /** Directory containing the barrel file */
  directory: string;
  /** Number of exports in the barrel file */
  exportCount: number;
  /** Types of exports found */
  exportTypes: ExportType[];
  /** Files being re-exported */
  reexportedFiles: string[];
  /** Whether this is a valid barrel file (has re-exports) */
  isValidBarrel: boolean;
}

/**
 * Information about a directory's barrel status
 */
export interface DirectoryBarrelInfo {
  /** Directory path */
  directory: string;
  /** Whether the directory has a barrel file */
  hasBarrel: boolean;
  /** The barrel file path (if exists) */
  barrelFile: string | null;
  /** Number of sibling files in the directory */
  siblingFileCount: number;
  /** Whether this directory should have a barrel file */
  shouldHaveBarrel: boolean;
}

/**
 * Analysis of barrel file patterns in a project
 */
export interface BarrelAnalysis {
  /** Detected barrel pattern */
  pattern: BarrelPattern;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** All barrel files found */
  barrelFiles: BarrelFileInfo[];
  /** Directories with barrel files */
  directoriesWithBarrels: DirectoryBarrelInfo[];
  /** Directories missing barrel files (that should have them) */
  directoriesMissingBarrels: DirectoryBarrelInfo[];
  /** Total directories analyzed */
  totalDirectories: number;
  /** Percentage of directories with barrel files */
  barrelCoverage: number;
  /** Dominant export style */
  dominantExportStyle: ExportType | null;
}

/**
 * Export pattern found in a file
 */
export interface ExportPattern {
  /** Type of export */
  type: ExportType;
  /** The exported name(s) */
  names: string[];
  /** Source module (for re-exports) */
  source: string | null;
  /** Line number where the export is found */
  line: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file is a barrel/index file
 */
export function isBarrelFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = normalizedPath.split('/').pop() || '';
  const lowerFileName = fileName.toLowerCase();
  
  return BARREL_FILE_NAMES.some(name => lowerFileName === name.toLowerCase());
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
 * Get the file name from a path
 */
export function getFileName(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.split('/').pop() || '';
}

/**
 * Check if a directory name suggests it should have a barrel file
 */
export function shouldDirectoryHaveBarrel(directoryPath: string): boolean {
  const normalizedPath = directoryPath.replace(/\\/g, '/');
  const dirName = normalizedPath.split('/').pop()?.toLowerCase() || '';
  
  return BARREL_EXPECTED_DIRECTORIES.some(expected => 
    dirName === expected || 
    dirName === `${expected}s` ||
    dirName.endsWith(expected)
  );
}

/**
 * Parse export patterns from file content
 */
export function parseExportPatterns(content: string): ExportPattern[] {
  const patterns: ExportPattern[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNumber = i + 1;
    
    // Skip comments and empty lines
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
      continue;
    }
    
    // Namespace re-export: export * from './module'
    const namespaceMatch = line.match(/export\s+\*\s+from\s+['"]([^'"]+)['"]/);
    if (namespaceMatch) {
      patterns.push({
        type: 'namespace-export',
        names: ['*'],
        source: namespaceMatch[1] || null,
        line: lineNumber,
      });
      continue;
    }
    
    // Named re-export: export { foo, bar } from './module'
    const namedReexportMatch = line.match(/export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (namedReexportMatch) {
      const names = namedReexportMatch[1]!
        .split(',')
        .map(n => n.trim())
        .filter(n => n.length > 0);
      
      const hasDefault = names.some(n => n === 'default' || n.startsWith('default '));
      const hasRename = names.some(n => n.includes(' as '));
      
      let type: ExportType = 'named-export';
      if (hasDefault) {
        type = 'default-reexport';
      } else if (hasRename) {
        type = 'named-reexport';
      }
      
      patterns.push({
        type,
        names,
        source: namedReexportMatch[2] || null,
        line: lineNumber,
      });
      continue;
    }
    
    // Direct named export: export const/let/var/function/class
    const directExportMatch = line.match(/export\s+(const|let|var|function|class|interface|type|enum)\s+(\w+)/);
    if (directExportMatch) {
      patterns.push({
        type: 'direct-export',
        names: [directExportMatch[2]!],
        source: null,
        line: lineNumber,
      });
      continue;
    }
    
    // Default export: export default
    if (line.match(/export\s+default\s+/)) {
      patterns.push({
        type: 'default-export',
        names: ['default'],
        source: null,
        line: lineNumber,
      });
      continue;
    }
    
    // Named export without from: export { foo, bar }
    const namedExportMatch = line.match(/export\s+\{([^}]+)\}(?!\s+from)/);
    if (namedExportMatch && !line.includes('from')) {
      const names = namedExportMatch[1]!
        .split(',')
        .map(n => n.trim())
        .filter(n => n.length > 0);
      
      patterns.push({
        type: 'direct-export',
        names,
        source: null,
        line: lineNumber,
      });
    }
  }
  
  return patterns;
}

/**
 * Analyze a barrel file's content
 */
export function analyzeBarrelFile(filePath: string, content: string): BarrelFileInfo {
  const directory = getFileDirectory(filePath);
  const exportPatterns = parseExportPatterns(content);
  
  const exportTypes = [...new Set(exportPatterns.map(p => p.type))];
  const reexportedFiles = exportPatterns
    .filter(p => p.source !== null)
    .map(p => p.source!)
    .filter((v, i, a) => a.indexOf(v) === i); // unique
  
  // A valid barrel file should have re-exports (not just direct exports)
  const hasReexports = exportPatterns.some(p => p.source !== null);
  
  return {
    path: filePath,
    directory,
    exportCount: exportPatterns.length,
    exportTypes,
    reexportedFiles,
    isValidBarrel: hasReexports,
  };
}

/**
 * Extract unique directories from file paths
 */
export function extractDirectories(files: string[]): Map<string, string[]> {
  const directories = new Map<string, string[]>();
  
  for (const file of files) {
    const normalizedPath = file.replace(/\\/g, '/');
    const directory = getFileDirectory(normalizedPath);
    
    if (directory) {
      if (!directories.has(directory)) {
        directories.set(directory, []);
      }
      directories.get(directory)!.push(normalizedPath);
    }
  }
  
  return directories;
}

/**
 * Analyze barrel file patterns in a project
 */
export function analyzeBarrelPatterns(files: string[], fileContents: Map<string, string> = new Map()): BarrelAnalysis {
  const directories = extractDirectories(files);
  const barrelFiles: BarrelFileInfo[] = [];
  const directoriesWithBarrels: DirectoryBarrelInfo[] = [];
  const directoriesMissingBarrels: DirectoryBarrelInfo[] = [];
  
  // Find all barrel files
  for (const file of files) {
    if (isBarrelFile(file)) {
      const content = fileContents.get(file) || '';
      const barrelInfo = analyzeBarrelFile(file, content);
      barrelFiles.push(barrelInfo);
    }
  }
  
  // Analyze each directory
  for (const [directory, directoryFiles] of directories) {
    const barrelFile = directoryFiles.find(f => isBarrelFile(f)) || null;
    const siblingFileCount = directoryFiles.filter(f => !isBarrelFile(f)).length;
    const shouldHaveBarrel = shouldDirectoryHaveBarrel(directory) && siblingFileCount > 0;
    
    const info: DirectoryBarrelInfo = {
      directory,
      hasBarrel: barrelFile !== null,
      barrelFile,
      siblingFileCount,
      shouldHaveBarrel,
    };
    
    if (barrelFile) {
      directoriesWithBarrels.push(info);
    } else if (shouldHaveBarrel) {
      directoriesMissingBarrels.push(info);
    }
  }
  
  // Calculate barrel coverage
  const relevantDirectories = [...directoriesWithBarrels, ...directoriesMissingBarrels];
  const barrelCoverage = relevantDirectories.length > 0
    ? directoriesWithBarrels.length / relevantDirectories.length
    : 0;
  
  // Determine pattern type
  let pattern: BarrelPattern;
  let confidence: number;
  
  if (barrelFiles.length === 0) {
    pattern = 'none';
    confidence = 0.5;
  } else if (barrelCoverage >= 0.8) {
    pattern = 'consistent';
    confidence = barrelCoverage;
  } else if (barrelCoverage >= 0.3) {
    pattern = 'inconsistent';
    confidence = 0.5 + (barrelCoverage * 0.3);
  } else {
    pattern = 'unknown';
    confidence = 0.3;
  }
  
  // Determine dominant export style
  const exportTypeCounts = new Map<ExportType, number>();
  for (const barrel of barrelFiles) {
    for (const exportType of barrel.exportTypes) {
      exportTypeCounts.set(exportType, (exportTypeCounts.get(exportType) || 0) + 1);
    }
  }
  
  let dominantExportStyle: ExportType | null = null;
  let maxCount = 0;
  for (const [type, count] of exportTypeCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantExportStyle = type;
    }
  }
  
  return {
    pattern,
    confidence,
    barrelFiles,
    directoriesWithBarrels,
    directoriesMissingBarrels,
    totalDirectories: directories.size,
    barrelCoverage,
    dominantExportStyle,
  };
}

/**
 * Check if a directory should have a barrel file based on project patterns
 */
export function checkDirectoryNeedsBarrel(
  directory: string,
  files: string[],
  analysis: BarrelAnalysis
): boolean {
  // If project doesn't use barrels consistently, don't enforce
  if (analysis.pattern !== 'consistent') {
    return false;
  }
  
  // Check if directory has multiple exportable files
  const directoryFiles = files.filter(f => {
    const fileDir = getFileDirectory(f);
    return fileDir === directory && !isBarrelFile(f);
  });
  
  // Need at least 2 files to warrant a barrel
  if (directoryFiles.length < 2) {
    return false;
  }
  
  // Check if this is a type of directory that typically has barrels
  return shouldDirectoryHaveBarrel(directory);
}

// ============================================================================
// Barrel Exports Detector Class
// ============================================================================

/**
 * Detector for barrel/index file patterns
 *
 * Identifies barrel files (index.ts/index.js) that re-export from other modules
 * and analyzes consistency of barrel file usage across the project.
 *
 * @requirements 7.4 - THE Structural_Detector SHALL detect barrel/index file usage patterns
 */
export class BarrelExportsDetector extends StructuralDetector {
  readonly id = 'structural/barrel-exports';
  readonly category = 'structural' as const;
  readonly subcategory = 'barrel-exports';
  readonly name = 'Barrel Exports Detector';
  readonly description = 'Detects barrel/index file usage patterns and export consistency';
  readonly supportedLanguages: Language[] = [
    'typescript',
    'javascript',
  ];

  /**
   * Detect barrel file patterns in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Build file contents map for barrel files
    const fileContents = new Map<string, string>();
    if (isBarrelFile(context.file)) {
      fileContents.set(context.file, context.content);
    }

    // Analyze the entire project's barrel patterns
    const analysis = analyzeBarrelPatterns(context.projectContext.files, fileContents);

    // Create pattern match for the detected barrel usage
    if (analysis.pattern !== 'unknown') {
      patterns.push(this.createBarrelPattern(context.file, analysis));
    }

    // Create pattern for dominant export style
    if (analysis.dominantExportStyle) {
      patterns.push(this.createExportStylePattern(context.file, analysis));
    }

    // Check if current file is a barrel file
    if (isBarrelFile(context.file)) {
      const barrelInfo = analyzeBarrelFile(context.file, context.content);
      
      // Check for empty or invalid barrel files
      if (!barrelInfo.isValidBarrel && barrelInfo.exportCount === 0) {
        violations.push(this.createEmptyBarrelViolation(context.file));
      }
      
      // Check for inconsistent export style
      const styleViolation = this.checkExportStyleConsistency(
        context.file,
        barrelInfo,
        analysis
      );
      if (styleViolation) {
        violations.push(styleViolation);
      }
    }

    // Check if current file's directory is missing a barrel file
    const missingBarrelViolation = this.checkMissingBarrel(context.file, analysis);
    if (missingBarrelViolation) {
      violations.push(missingBarrelViolation);
    }

    return this.createResult(patterns, violations, analysis.confidence);
  }

  /**
   * Generate a quick fix for barrel export violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    if (violation.patternId === 'structural/barrel-exports-missing') {
      return {
        title: 'Create barrel file (index.ts)',
        kind: 'quickfix',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: true,
        confidence: 0.7,
        preview: 'Create an index.ts file to re-export modules from this directory',
      };
    }

    if (violation.patternId === 'structural/barrel-exports-empty') {
      return {
        title: 'Add exports to barrel file',
        kind: 'quickfix',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: true,
        confidence: 0.6,
        preview: 'Add re-exports for sibling modules',
      };
    }

    if (violation.patternId === 'structural/barrel-exports-style') {
      return {
        title: 'Update export style to match project pattern',
        kind: 'refactor',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: false,
        confidence: 0.5,
        preview: `Consider using ${violation.expected} for consistency`,
      };
    }

    return null;
  }

  /**
   * Create a pattern match for barrel file usage
   */
  private createBarrelPattern(
    file: string,
    analysis: BarrelAnalysis
  ): PatternMatch {
    return {
      patternId: `barrel-exports-${analysis.pattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for export style
   */
  private createExportStylePattern(
    file: string,
    analysis: BarrelAnalysis
  ): PatternMatch {
    return {
      patternId: `barrel-exports-style-${analysis.dominantExportStyle}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence * 0.8,
      isOutlier: false,
    };
  }

  /**
   * Create a violation for an empty barrel file
   */
  private createEmptyBarrelViolation(file: string): Violation {
    const range: Range = {
      start: { line: 1, character: 1 },
      end: { line: 1, character: 1 },
    };

    return {
      id: `barrel-exports-empty-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/barrel-exports-empty',
      severity: 'warning',
      file,
      range,
      message: `Barrel file '${getFileName(file)}' is empty or has no re-exports. Consider adding exports or removing the file.`,
      expected: 'Barrel file with re-exports (e.g., export * from "./module")',
      actual: 'Empty or non-functional barrel file',
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  /**
   * Check for inconsistent export style in a barrel file
   */
  private checkExportStyleConsistency(
    file: string,
    barrelInfo: BarrelFileInfo,
    analysis: BarrelAnalysis
  ): Violation | null {
    // Skip if no dominant style or barrel has no exports
    if (!analysis.dominantExportStyle || barrelInfo.exportCount === 0) {
      return null;
    }

    // Skip if pattern is not consistent (no clear style to enforce)
    if (analysis.pattern !== 'consistent') {
      return null;
    }

    // Check if this barrel uses the dominant style
    const usesDominantStyle = barrelInfo.exportTypes.includes(analysis.dominantExportStyle);
    
    // If it uses the dominant style, no violation
    if (usesDominantStyle) {
      return null;
    }

    // If it only has direct exports (not re-exports), skip
    const hasReexports = barrelInfo.exportTypes.some(t => 
      t === 'namespace-export' || t === 'named-export' || t === 'named-reexport' || t === 'default-reexport'
    );
    if (!hasReexports) {
      return null;
    }

    const range: Range = {
      start: { line: 1, character: 1 },
      end: { line: 1, character: 1 },
    };

    const actualStyles = barrelInfo.exportTypes.join(', ');

    return {
      id: `barrel-exports-style-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/barrel-exports-style',
      severity: 'info',
      file,
      range,
      message: `Barrel file uses '${actualStyles}' but project predominantly uses '${analysis.dominantExportStyle}'. Consider using consistent export style.`,
      expected: `${analysis.dominantExportStyle} export style`,
      actual: `${actualStyles} export style`,
      aiExplainAvailable: true,
      aiFixAvailable: false,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  /**
   * Check if the current file's directory is missing a barrel file
   */
  private checkMissingBarrel(
    file: string,
    analysis: BarrelAnalysis
  ): Violation | null {
    // Skip if project doesn't use barrels consistently
    if (analysis.pattern !== 'consistent') {
      return null;
    }

    // Skip if this file is itself a barrel file
    if (isBarrelFile(file)) {
      return null;
    }

    const directory = getFileDirectory(file);
    
    // Check if this directory is in the missing barrels list
    const missingInfo = analysis.directoriesMissingBarrels.find(
      d => d.directory === directory
    );

    if (!missingInfo) {
      return null;
    }

    const range: Range = {
      start: { line: 1, character: 1 },
      end: { line: 1, character: 1 },
    };

    const dirName = directory.split('/').pop() || directory;

    return {
      id: `barrel-exports-missing-${directory.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/barrel-exports-missing',
      severity: 'info',
      file,
      range,
      message: `Directory '${dirName}' has ${missingInfo.siblingFileCount} files but no barrel file. Consider adding an index.ts to re-export modules.`,
      expected: 'Directory with barrel file (index.ts) for re-exports',
      actual: `Directory with ${missingInfo.siblingFileCount} files and no barrel`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new BarrelExportsDetector instance
 */
export function createBarrelExportsDetector(): BarrelExportsDetector {
  return new BarrelExportsDetector();
}
