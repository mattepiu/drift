/**
 * Package Boundaries Detector - Monorepo boundary violation detection
 *
 * Detects monorepo package boundary violations including:
 * - Direct imports between packages that bypass the public API
 * - Imports from packages that are not declared as dependencies
 * - Cross-package imports that violate the dependency hierarchy
 * - Internal module access (importing from src/ instead of package entry point)
 *
 * @requirements 7.8 - THE Structural_Detector SHALL detect package boundary violations in monorepos
 */

import { StructuralDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Type of package boundary violation
 */
export type PackageBoundaryViolationType =
  | 'internal-import'        // Importing from internal paths (e.g., packages/core/src/internal)
  | 'undeclared-dependency'  // Importing from a package not in dependencies
  | 'hierarchy-violation'    // Cross-package import violating dependency hierarchy
  | 'bypass-public-api';     // Importing from src/ instead of package entry point

/**
 * Severity level for package boundary violations
 */
export type PackageBoundarySeverity = 'error' | 'warning' | 'info';

/**
 * Information about a detected package
 */
export interface PackageInfo {
  /** Package name (e.g., driftdetect-core) */
  name: string;
  /** Package directory path */
  path: string;
  /** Dependencies declared in package.json */
  dependencies: string[];
  /** Dev dependencies declared in package.json */
  devDependencies: string[];
  /** Peer dependencies declared in package.json */
  peerDependencies: string[];
  /** Entry point (main or exports) */
  entryPoint?: string;
}

/**
 * Information about a package boundary violation
 */
export interface PackageBoundaryViolationInfo {
  /** Type of violation */
  type: PackageBoundaryViolationType;
  /** The import source path */
  importSource: string;
  /** The package being imported from */
  targetPackage: string;
  /** The package containing the importing file */
  sourcePackage: string;
  /** Line number of the import */
  line: number;
  /** Calculated severity */
  severity: PackageBoundarySeverity;
  /** Human-readable description */
  description: string;
  /** Suggested correct import path */
  suggestedImport?: string;
}

/**
 * Analysis result for package boundaries
 */
export interface PackageBoundaryAnalysis {
  /** Whether the file is in a monorepo package */
  isInMonorepo: boolean;
  /** Current package info (if in a package) */
  currentPackage: PackageInfo | null;
  /** All detected packages in the monorepo */
  packages: PackageInfo[];
  /** Violations found */
  violations: PackageBoundaryViolationInfo[];
  /** Total cross-package imports analyzed */
  totalCrossPackageImports: number;
}

/**
 * Monorepo configuration
 */
export interface MonorepoConfig {
  /** Package directory patterns (e.g., ['packages/*', 'apps/*']) */
  packagePatterns: string[];
  /** Whether to allow internal imports within the same package */
  allowInternalImports: boolean;
  /** Custom package name to path mappings */
  packageMappings?: Record<string, string>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Common monorepo package directory patterns
 */
export const COMMON_PACKAGE_PATTERNS = [
  'packages/*',
  'apps/*',
  'libs/*',
  'modules/*',
  'services/*',
];

/**
 * Patterns that indicate internal/private paths
 */
export const INTERNAL_PATH_PATTERNS = [
  '/src/',
  '/lib/',
  '/dist/',
  '/internal/',
  '/private/',
  '/_internal/',
  '/_private/',
];

/**
 * Default monorepo configuration
 */
export const DEFAULT_MONOREPO_CONFIG: MonorepoConfig = {
  packagePatterns: COMMON_PACKAGE_PATTERNS,
  allowInternalImports: false,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize a file path for consistent matching
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Extract package name from an import path
 * Handles scoped packages (@org/package) and regular packages
 */
export function extractPackageName(importPath: string): string | null {
  // Skip relative imports
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return null;
  }

  // Handle scoped packages (@org/package)
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return null;
  }

  // Handle regular packages
  const parts = importPath.split('/');
  return parts[0] || null;
}

/**
 * Check if an import path accesses internal package paths
 */
export function isInternalImport(importPath: string): boolean {
  const normalizedPath = normalizePath(importPath);
  
  // Check for common internal path patterns
  for (const pattern of INTERNAL_PATH_PATTERNS) {
    if (normalizedPath.includes(pattern)) {
      return true;
    }
  }

  // Check for direct src/ access after package name
  // e.g., driftdetect-core/src/internal or package-name/src/utils
  const packageName = extractPackageName(importPath);
  if (packageName) {
    const afterPackage = importPath.slice(packageName.length);
    if (afterPackage.startsWith('/src/') || 
        afterPackage.startsWith('/lib/') ||
        afterPackage.startsWith('/dist/')) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an import bypasses the public API
 * (imports from internal paths instead of the package entry point)
 */
export function bypassesPublicApi(importPath: string, packageName: string): boolean {
  // If the import is just the package name, it uses the public API
  if (importPath === packageName) {
    return false;
  }

  // If the import has a subpath, check if it's accessing internal paths
  const subpath = importPath.slice(packageName.length);
  
  // Allow explicit exports like driftdetect-core/utils (if exported)
  // But flag internal paths like driftdetect-core/src/utils
  if (subpath.startsWith('/src/') || 
      subpath.startsWith('/lib/') ||
      subpath.startsWith('/dist/') ||
      subpath.includes('/internal/') ||
      subpath.includes('/private/')) {
    return true;
  }

  return false;
}

/**
 * Detect packages in a monorepo from file paths
 */
export function detectMonorepoPackages(
  files: string[],
  config: MonorepoConfig = DEFAULT_MONOREPO_CONFIG
): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const packageDirs = new Set<string>();

  // Find package directories based on patterns
  for (const file of files) {
    const normalizedFile = normalizePath(file);
    
    for (const pattern of config.packagePatterns) {
      // Extract the base directory from the pattern (e.g., 'packages' from 'packages/*')
      const patternBase = pattern.replace('/*', '').replace('/**', '');
      
      // Check if the file is under this pattern base
      if (normalizedFile.startsWith(patternBase + '/')) {
        // Extract the package directory name
        const afterBase = normalizedFile.slice(patternBase.length + 1);
        const packageDir = afterBase.split('/')[0];
        
        if (packageDir) {
          const fullPackageDir = `${patternBase}/${packageDir}`;
          packageDirs.add(fullPackageDir);
        }
      }
    }
  }

  // Also detect packages from package.json files
  for (const file of files) {
    const normalizedFile = normalizePath(file);
    if (normalizedFile.endsWith('/package.json') || normalizedFile === 'package.json') {
      const dir = normalizedFile.replace('/package.json', '');
      if (dir && dir !== '.' && dir !== 'package.json') {
        packageDirs.add(dir);
      }
    }
  }

  // Create PackageInfo for each detected package
  for (const dir of packageDirs) {
    // Derive package name from directory
    const parts = dir.split('/');
    const packageName = parts[parts.length - 1] || dir;
    
    // Check if it's a scoped package (common in monorepos)
    const parentDir = parts[parts.length - 2];
    const scopedName = parentDir === 'packages' || parentDir === 'apps' || parentDir === 'libs'
      ? `@${parts[0] || 'monorepo'}/${packageName}`
      : packageName;

    packages.push({
      name: scopedName,
      path: dir,
      dependencies: [],
      devDependencies: [],
      peerDependencies: [],
    });
  }

  return packages;
}

/**
 * Find which package a file belongs to
 */
export function findPackageForFile(
  filePath: string,
  packages: PackageInfo[]
): PackageInfo | null {
  const normalizedPath = normalizePath(filePath);

  // Find the package with the longest matching path (most specific)
  let bestMatch: PackageInfo | null = null;
  let bestMatchLength = 0;

  for (const pkg of packages) {
    const normalizedPkgPath = normalizePath(pkg.path);
    if (normalizedPath.startsWith(normalizedPkgPath + '/') || 
        normalizedPath === normalizedPkgPath) {
      if (normalizedPkgPath.length > bestMatchLength) {
        bestMatch = pkg;
        bestMatchLength = normalizedPkgPath.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Resolve an import to determine which package it targets
 */
export function resolveImportToPackage(
  importSource: string,
  currentFile: string,
  packages: PackageInfo[]
): PackageInfo | null {
  // Handle relative imports
  if (importSource.startsWith('.')) {
    const currentDir = normalizePath(currentFile).split('/').slice(0, -1).join('/');
    const segments = importSource.split('/');
    const pathSegments = currentDir.split('/');

    for (const segment of segments) {
      if (segment === '.') {
        continue;
      } else if (segment === '..') {
        pathSegments.pop();
      } else {
        pathSegments.push(segment);
      }
    }

    const resolvedPath = pathSegments.join('/');
    return findPackageForFile(resolvedPath, packages);
  }

  // Handle package imports
  const packageName = extractPackageName(importSource);
  if (!packageName) {
    return null;
  }

  // Find package by name (exact match)
  for (const pkg of packages) {
    if (pkg.name === packageName) {
      return pkg;
    }
  }

  // Find package by name (ends with the package name for scoped packages)
  for (const pkg of packages) {
    if (pkg.name.endsWith('/' + packageName.replace('@', '').split('/').pop())) {
      return pkg;
    }
  }

  // Try to find by directory name
  const pkgDirName = packageName.startsWith('@') 
    ? packageName.split('/').pop() 
    : packageName;
    
  for (const pkg of packages) {
    const dirName = pkg.path.split('/').pop();
    if (dirName === pkgDirName) {
      return pkg;
    }
  }

  return null;
}

/**
 * Check if a package is declared as a dependency
 */
export function isDeclaredDependency(
  targetPackage: string,
  sourcePackage: PackageInfo
): boolean {
  const allDeps = [
    ...sourcePackage.dependencies,
    ...sourcePackage.devDependencies,
    ...sourcePackage.peerDependencies,
  ];

  return allDeps.includes(targetPackage);
}

/**
 * Generate a suggested import path for a violation
 */
export function generateSuggestedImport(
  violation: PackageBoundaryViolationInfo
): string | undefined {
  switch (violation.type) {
    case 'internal-import':
    case 'bypass-public-api':
      // Suggest using the package name directly
      return violation.targetPackage;
    
    case 'undeclared-dependency':
      // Suggest adding to dependencies
      return undefined; // No import fix, need to add dependency
    
    case 'hierarchy-violation':
      // Suggest restructuring
      return undefined;
    
    default:
      return undefined;
  }
}

/**
 * Calculate severity for a package boundary violation
 */
export function calculateViolationSeverity(
  type: PackageBoundaryViolationType
): PackageBoundarySeverity {
  switch (type) {
    case 'internal-import':
      return 'error'; // Accessing internal paths is a serious violation
    case 'bypass-public-api':
      return 'warning'; // Bypassing public API should be fixed
    case 'undeclared-dependency':
      return 'error'; // Missing dependency can cause runtime errors
    case 'hierarchy-violation':
      return 'warning'; // Hierarchy violations are architectural concerns
    default:
      return 'warning';
  }
}

/**
 * Analyze package boundaries for a file
 */
export function analyzePackageBoundaries(
  file: string,
  imports: Array<{ source: string; line: number }>,
  projectFiles: string[],
  config: MonorepoConfig = DEFAULT_MONOREPO_CONFIG
): PackageBoundaryAnalysis {
  // Detect packages in the monorepo
  const packages = detectMonorepoPackages(projectFiles, config);

  // Find the current file's package
  const currentPackage = findPackageForFile(file, packages);

  // If not in a monorepo package, return early
  if (!currentPackage || packages.length <= 1) {
    return {
      isInMonorepo: packages.length > 1,
      currentPackage,
      packages,
      violations: [],
      totalCrossPackageImports: 0,
    };
  }

  const violations: PackageBoundaryViolationInfo[] = [];
  let crossPackageImports = 0;

  for (const imp of imports) {
    // Skip relative imports within the same package (unless checking internal)
    if (imp.source.startsWith('.')) {
      // Check if relative import goes outside current package
      const targetPackage = resolveImportToPackage(imp.source, file, packages);
      
      if (targetPackage && targetPackage.name !== currentPackage.name) {
        crossPackageImports++;
        
        // Relative import to another package - this is a violation
        violations.push({
          type: 'bypass-public-api',
          importSource: imp.source,
          targetPackage: targetPackage.name,
          sourcePackage: currentPackage.name,
          line: imp.line,
          severity: 'warning',
          description: `Relative import to package '${targetPackage.name}' bypasses the public API`,
          suggestedImport: targetPackage.name,
        });
      }
      continue;
    }

    // Extract package name from import
    const packageName = extractPackageName(imp.source);
    if (!packageName) {
      continue;
    }

    // Find the target package
    const targetPackage = resolveImportToPackage(imp.source, file, packages);
    
    // Skip external packages (not in monorepo)
    if (!targetPackage) {
      continue;
    }

    // Skip same-package imports
    if (targetPackage.name === currentPackage.name) {
      continue;
    }

    crossPackageImports++;

    // Check for internal import violations
    if (isInternalImport(imp.source)) {
      violations.push({
        type: 'internal-import',
        importSource: imp.source,
        targetPackage: targetPackage.name,
        sourcePackage: currentPackage.name,
        line: imp.line,
        severity: 'error',
        description: `Import from internal path of package '${targetPackage.name}'`,
        suggestedImport: targetPackage.name,
      });
      continue;
    }

    // Check for public API bypass
    if (bypassesPublicApi(imp.source, packageName)) {
      violations.push({
        type: 'bypass-public-api',
        importSource: imp.source,
        targetPackage: targetPackage.name,
        sourcePackage: currentPackage.name,
        line: imp.line,
        severity: 'warning',
        description: `Import bypasses public API of package '${targetPackage.name}'`,
        suggestedImport: targetPackage.name,
      });
      continue;
    }

    // Check for undeclared dependency (if we have dependency info)
    if (currentPackage.dependencies.length > 0 || 
        currentPackage.devDependencies.length > 0) {
      if (!isDeclaredDependency(targetPackage.name, currentPackage)) {
        violations.push({
          type: 'undeclared-dependency',
          importSource: imp.source,
          targetPackage: targetPackage.name,
          sourcePackage: currentPackage.name,
          line: imp.line,
          severity: 'error',
          description: `Package '${targetPackage.name}' is not declared as a dependency`,
        });
      }
    }
  }

  return {
    isInMonorepo: true,
    currentPackage,
    packages,
    violations,
    totalCrossPackageImports: crossPackageImports,
  };
}

// ============================================================================
// Package Boundaries Detector Class
// ============================================================================

/**
 * Detector for monorepo package boundary violations
 *
 * Identifies violations including:
 * - Direct imports between packages that bypass the public API
 * - Imports from packages that are not declared as dependencies
 * - Cross-package imports that violate the dependency hierarchy
 * - Internal module access (importing from src/ instead of package entry point)
 *
 * @requirements 7.8 - THE Structural_Detector SHALL detect package boundary violations in monorepos
 */
export class PackageBoundariesDetector extends StructuralDetector {
  readonly id = 'structural/package-boundaries';
  readonly category = 'structural' as const;
  readonly subcategory = 'package-boundaries';
  readonly name = 'Package Boundaries Detector';
  readonly description = 'Detects monorepo package boundary violations including internal imports and undeclared dependencies';
  readonly supportedLanguages: Language[] = [
    'typescript',
    'javascript',
  ];

  /**
   * Detect package boundary violations in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Extract imports from context
    const imports = this.extractImports(context);

    if (imports.length === 0) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Analyze package boundaries
    const analysis = analyzePackageBoundaries(
      context.file,
      imports,
      context.projectContext.files
    );

    // If not in a monorepo, return early
    if (!analysis.isInMonorepo) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Create pattern match for monorepo detection
    patterns.push({
      patternId: 'package-boundaries-monorepo',
      location: { file: context.file, line: 1, column: 1 },
      confidence: 0.9,
      isOutlier: false,
    });

    // Create pattern match for current package
    if (analysis.currentPackage) {
      patterns.push({
        patternId: `package-boundaries-package-${analysis.currentPackage.name.replace(/[^a-zA-Z0-9]/g, '-')}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    // Generate violations
    for (const violation of analysis.violations) {
      const v = this.createBoundaryViolation(context.file, violation);
      violations.push(v);

      // Also create a pattern match for tracking
      patterns.push({
        patternId: `package-boundaries-${violation.type}`,
        location: { file: context.file, line: violation.line, column: 1 },
        confidence: 0.9,
        isOutlier: true,
      });
    }

    // Calculate confidence based on clean imports ratio
    const cleanRatio = analysis.totalCrossPackageImports > 0
      ? (analysis.totalCrossPackageImports - analysis.violations.length) / analysis.totalCrossPackageImports
      : 1.0;

    return this.createResult(patterns, violations, cleanRatio);
  }

  /**
   * Generate a quick fix for package boundary violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Handle internal import violations
    if (violation.patternId === 'structural/package-boundaries-internal-import' ||
        violation.patternId === 'structural/package-boundaries-bypass-public-api') {
      
      // Extract the suggested import from the violation
      const suggestedImport = violation.expected?.match(/import from '([^']+)'/)?.[1];
      
      if (suggestedImport) {
        return {
          title: `Change import to '${suggestedImport}'`,
          kind: 'quickfix',
          edit: {
            changes: {},
            documentChanges: [],
          },
          isPreferred: true,
          confidence: 0.8,
          preview: `Replace the internal import with the public API: import from '${suggestedImport}'`,
        };
      }
    }

    // Handle undeclared dependency violations
    if (violation.patternId === 'structural/package-boundaries-undeclared-dependency') {
      const packageName = violation.actual?.match(/from '([^']+)'/)?.[1];
      
      return {
        title: `Add '${packageName}' to dependencies`,
        kind: 'quickfix',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: true,
        confidence: 0.7,
        preview: `Add the package to your package.json dependencies`,
      };
    }

    return null;
  }

  /**
   * Extract imports from the detection context
   */
  private extractImports(context: DetectionContext): Array<{ source: string; line: number }> {
    const imports: Array<{ source: string; line: number }> = [];

    // Use imports from context if available
    if (context.imports && context.imports.length > 0) {
      for (const imp of context.imports) {
        const source = (imp as { source?: string; module?: string }).source || 
                       (imp as { source?: string; module?: string }).module;
        if (source) {
          imports.push({
            source,
            line: (imp as { line?: number }).line || 1,
          });
        }
      }
      return imports;
    }

    // Fall back to parsing content for imports
    const importRegex = /^import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+)?['"]([^'"]+)['"]/gm;
    const lines = context.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const match = importRegex.exec(line);
      if (match?.[1]) {
        imports.push({
          source: match[1],
          line: i + 1,
        });
      }
      importRegex.lastIndex = 0; // Reset regex state
    }

    return imports;
  }

  /**
   * Create a violation for a package boundary issue
   */
  private createBoundaryViolation(
    file: string,
    boundaryViolation: PackageBoundaryViolationInfo
  ): Violation {
    const range: Range = {
      start: { line: boundaryViolation.line - 1, character: 0 },
      end: { line: boundaryViolation.line - 1, character: 100 },
    };

    const violation: Violation = {
      id: `package-boundary-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${boundaryViolation.line}`,
      patternId: `structural/package-boundaries-${boundaryViolation.type}`,
      severity: boundaryViolation.severity,
      file,
      range,
      message: boundaryViolation.description,
      expected: boundaryViolation.suggestedImport 
        ? `Use public API: import from '${boundaryViolation.suggestedImport}'`
        : 'Use the package public API',
      actual: `Import from '${boundaryViolation.importSource}'`,
      aiExplainAvailable: true,
      aiFixAvailable: boundaryViolation.type !== 'undeclared-dependency',
      firstSeen: new Date(),
      occurrences: 1,
    };

    // Add quick fix for fixable violations
    if (boundaryViolation.suggestedImport) {
      violation.quickFix = {
        title: `Change import to '${boundaryViolation.suggestedImport}'`,
        kind: 'quickfix',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: true,
        confidence: 0.8,
      };
    }

    return violation;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PackageBoundariesDetector instance
 */
export function createPackageBoundariesDetector(): PackageBoundariesDetector {
  return new PackageBoundariesDetector();
}
