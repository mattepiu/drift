/**
 * Directory Structure Detector - Directory pattern detection
 *
 * Detects feature-based vs layer-based organization
 * and consistent directory patterns.
 *
 * @requirements 7.2 - THE Structural_Detector SHALL detect directory structure patterns (feature-based vs layer-based)
 */

import { StructuralDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of directory organization patterns
 */
export type DirectoryOrganization = 'feature-based' | 'layer-based' | 'hybrid' | 'unknown';

/**
 * Common layer-based directory names
 */
export const LAYER_DIRECTORIES = [
  'controllers',
  'services',
  'models',
  'repositories',
  'handlers',
  'middleware',
  'utils',
  'helpers',
  'lib',
  'config',
  'types',
  'interfaces',
  'constants',
  'validators',
  'schemas',
  'routes',
  'api',
  'views',
  'templates',
  'assets',
  'styles',
  'hooks',
  'store',
  'reducers',
  'actions',
  'selectors',
  'sagas',
  'thunks',
  'providers',
  'contexts',
] as const;

/**
 * Common feature-based directory indicators
 * Note: 'components' is excluded because it's commonly used in both
 * feature-based AND layer-based architectures
 */
export const FEATURE_DIRECTORIES = [
  'features',
  'modules',
  'domains',
  'pages',
  'screens',
  // 'components' removed - it's valid in layer-based architectures too
  'apps',
  'packages',
] as const;

/**
 * Directories that are valid in BOTH feature-based and layer-based architectures
 * These should not be flagged as inconsistencies
 */
export const UNIVERSAL_DIRECTORIES = [
  'components',
  'shared',
  'common',
  'core',
  'ui',
] as const;

/**
 * Information about a directory in the project
 */
export interface DirectoryInfo {
  /** Directory path (relative to project root) */
  path: string;
  /** Directory name (last segment) */
  name: string;
  /** Depth from project root */
  depth: number;
  /** Number of files directly in this directory */
  fileCount: number;
  /** Child directories */
  children: string[];
  /** Whether this appears to be a layer directory */
  isLayerDirectory: boolean;
  /** Whether this appears to be a feature container */
  isFeatureContainer: boolean;
}

/**
 * Analysis of directory structure patterns
 */
export interface DirectoryStructureAnalysis {
  /** Detected organization type */
  organization: DirectoryOrganization;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Layer directories found */
  layerDirectories: DirectoryInfo[];
  /** Feature directories found */
  featureDirectories: DirectoryInfo[];
  /** Directories that don't fit the dominant pattern */
  inconsistentDirectories: DirectoryInfo[];
  /** Total directories analyzed */
  totalDirectories: number;
  /** Depth statistics */
  depthStats: {
    maxDepth: number;
    avgDepth: number;
  };
}

/**
 * Pattern for consistent directory naming
 */
export interface DirectoryPattern {
  /** Pattern name */
  name: string;
  /** Directories matching this pattern */
  directories: string[];
  /** Count of matches */
  count: number;
  /** Depth at which this pattern appears */
  depth: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract unique directories from file paths
 */
export function extractDirectories(files: string[]): Map<string, DirectoryInfo> {
  const directories = new Map<string, DirectoryInfo>();

  for (const file of files) {
    const normalizedPath = file.replace(/\\/g, '/');
    const segments = normalizedPath.split('/').filter(s => s.length > 0);
    
    // Build directory paths from segments (excluding the file itself)
    let currentPath = '';
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      
      if (!directories.has(currentPath)) {
        directories.set(currentPath, {
          path: currentPath,
          name: segment,
          depth: i + 1,
          fileCount: 0,
          children: [],
          isLayerDirectory: isLayerDirectory(segment),
          isFeatureContainer: isFeatureContainer(segment),
        });
      }
    }

    // Count files in the immediate parent directory
    const parentPath = segments.slice(0, -1).join('/');
    if (parentPath && directories.has(parentPath)) {
      directories.get(parentPath)!.fileCount++;
    }
  }

  // Build parent-child relationships
  for (const [path, info] of directories) {
    const parentPath = path.split('/').slice(0, -1).join('/');
    if (parentPath && directories.has(parentPath)) {
      directories.get(parentPath)!.children.push(info.name);
    }
  }

  return directories;
}

/**
 * Check if a directory name matches layer-based patterns
 */
export function isLayerDirectory(name: string): boolean {
  const lowerName = name.toLowerCase();
  return LAYER_DIRECTORIES.some(layer => 
    lowerName === layer || 
    lowerName === `${layer}s` || // plural form
    lowerName.endsWith(layer)
  );
}

/**
 * Check if a directory name indicates a feature container
 */
export function isFeatureContainer(name: string): boolean {
  const lowerName = name.toLowerCase();
  return FEATURE_DIRECTORIES.some(feature => 
    lowerName === feature || 
    lowerName === `${feature}s`
  );
}

/**
 * Check if a directory is valid in both architectures (shouldn't be flagged)
 */
export function isUniversalDirectory(name: string): boolean {
  const lowerName = name.toLowerCase();
  return UNIVERSAL_DIRECTORIES.some(dir => 
    lowerName === dir || 
    lowerName === `${dir}s`
  );
}

/**
 * Detect if a directory structure follows feature-based organization
 * Feature-based: /features/auth/components, /features/auth/services
 */
export function detectFeatureBasedStructure(directories: Map<string, DirectoryInfo>): DirectoryInfo[] {
  const featureDirectories: DirectoryInfo[] = [];

  for (const [path, info] of directories) {
    // Check if this is a feature container with multiple feature subdirectories
    if (info.isFeatureContainer && info.children.length > 0) {
      featureDirectories.push(info);
      continue;
    }

    // Check if parent is a feature container and this has layer-like children
    const parentPath = path.split('/').slice(0, -1).join('/');
    const parent = directories.get(parentPath);
    if (parent?.isFeatureContainer) {
      // This is likely a feature directory (e.g., /features/auth)
      const hasLayerChildren = info.children.some(child => isLayerDirectory(child));
      if (hasLayerChildren || info.fileCount > 0) {
        featureDirectories.push(info);
      }
    }
  }

  return featureDirectories;
}

/**
 * Detect if a directory structure follows layer-based organization
 * Layer-based: /controllers, /services, /models at root or src level
 */
export function detectLayerBasedStructure(directories: Map<string, DirectoryInfo>): DirectoryInfo[] {
  const layerDirectories: DirectoryInfo[] = [];

  for (const [, info] of directories) {
    // Layer directories typically appear at depth 1-2 (root or src level)
    if (info.isLayerDirectory && info.depth <= 3) {
      layerDirectories.push(info);
    }
  }

  return layerDirectories;
}

/**
 * Analyze directory structure and determine organization type
 */
export function analyzeDirectoryStructure(files: string[]): DirectoryStructureAnalysis {
  const directories = extractDirectories(files);
  
  if (directories.size === 0) {
    return {
      organization: 'unknown',
      confidence: 0,
      layerDirectories: [],
      featureDirectories: [],
      inconsistentDirectories: [],
      totalDirectories: 0,
      depthStats: { maxDepth: 0, avgDepth: 0 },
    };
  }

  const layerDirectories = detectLayerBasedStructure(directories);
  const featureDirectories = detectFeatureBasedStructure(directories);

  // Calculate depth statistics
  const depths = Array.from(directories.values()).map(d => d.depth);
  const maxDepth = Math.max(...depths);
  const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;

  // Determine organization type based on what we found
  let organization: DirectoryOrganization;
  let confidence: number;
  const inconsistentDirectories: DirectoryInfo[] = [];

  const layerScore = layerDirectories.length;
  const featureScore = featureDirectories.length;
  const totalSignificant = layerScore + featureScore;

  if (totalSignificant === 0) {
    organization = 'unknown';
    confidence = 0.3;
  } else if (featureScore > 0 && layerScore > 0) {
    // Both patterns present - could be hybrid or inconsistent
    const featureRatio = featureScore / totalSignificant;
    const layerRatio = layerScore / totalSignificant;

    if (featureRatio > 0.7) {
      organization = 'feature-based';
      confidence = featureRatio;
      // Layer directories in a feature-based project might be inconsistent
      inconsistentDirectories.push(...layerDirectories.filter(d => d.depth <= 2));
    } else if (layerRatio > 0.7) {
      organization = 'layer-based';
      confidence = layerRatio;
      // Feature directories in a layer-based project might be inconsistent
      inconsistentDirectories.push(...featureDirectories);
    } else {
      organization = 'hybrid';
      confidence = 0.6; // Hybrid patterns have moderate confidence
    }
  } else if (featureScore > 0) {
    organization = 'feature-based';
    confidence = Math.min(0.5 + (featureScore * 0.1), 0.95);
  } else {
    organization = 'layer-based';
    confidence = Math.min(0.5 + (layerScore * 0.1), 0.95);
  }

  return {
    organization,
    confidence,
    layerDirectories,
    featureDirectories,
    inconsistentDirectories,
    totalDirectories: directories.size,
    depthStats: { maxDepth, avgDepth },
  };
}

/**
 * Detect consistent directory naming patterns
 */
export function detectDirectoryPatterns(files: string[]): DirectoryPattern[] {
  const directories = extractDirectories(files);
  const patternCounts = new Map<string, { dirs: string[]; depth: number }>();

  for (const [path, info] of directories) {
    // Group by directory name (normalized)
    const normalizedName = info.name.toLowerCase();
    
    if (!patternCounts.has(normalizedName)) {
      patternCounts.set(normalizedName, { dirs: [], depth: info.depth });
    }
    patternCounts.get(normalizedName)!.dirs.push(path);
  }

  // Convert to patterns, filtering out single occurrences
  const patterns: DirectoryPattern[] = [];
  for (const [name, data] of patternCounts) {
    if (data.dirs.length > 1) {
      patterns.push({
        name,
        directories: data.dirs,
        count: data.dirs.length,
        depth: data.depth,
      });
    }
  }

  // Sort by count descending
  return patterns.sort((a, b) => b.count - a.count);
}

// ============================================================================
// Directory Structure Detector Class
// ============================================================================

/**
 * Detector for directory structure patterns
 *
 * Identifies whether a project uses feature-based, layer-based, or hybrid
 * directory organization and detects inconsistencies.
 *
 * @requirements 7.2 - THE Structural_Detector SHALL detect directory structure patterns
 */
export class DirectoryStructureDetector extends StructuralDetector {
  readonly id = 'structural/directory-structure';
  readonly category = 'structural' as const;
  readonly subcategory = 'directory-organization';
  readonly name = 'Directory Structure Detector';
  readonly description = 'Detects directory organization patterns (feature-based vs layer-based) and identifies inconsistencies';
  readonly supportedLanguages: Language[] = [
    'typescript',
    'javascript',
    'python',
    'css',
    'scss',
    'json',
    'yaml',
    'markdown',
  ];

  /**
   * Detect directory structure patterns in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Analyze the entire project's directory structure
    const analysis = analyzeDirectoryStructure(context.projectContext.files);

    // Create pattern match for the detected organization
    if (analysis.organization !== 'unknown') {
      patterns.push(this.createOrganizationPattern(context.file, analysis));
    }

    // Create patterns for consistent directory naming
    const directoryPatterns = detectDirectoryPatterns(context.projectContext.files);
    for (const pattern of directoryPatterns.slice(0, 5)) { // Top 5 patterns
      patterns.push(this.createDirectoryPattern(context.file, pattern, analysis));
    }

    // Generate violations for inconsistent directories
    for (const inconsistent of analysis.inconsistentDirectories) {
      const violation = this.createInconsistencyViolation(
        context.file,
        inconsistent,
        analysis.organization
      );
      if (violation) {
        violations.push(violation);
      }
    }

    // Check if current file's directory follows the pattern
    const fileViolation = this.checkFileDirectoryConsistency(context.file, analysis);
    if (fileViolation) {
      violations.push(fileViolation);
    }

    return this.createResult(patterns, violations, analysis.confidence);
  }

  /**
   * Generate a quick fix for directory structure violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Directory structure violations typically require manual refactoring
    // We can suggest the fix but not automatically apply it
    if (violation.patternId === 'structural/directory-structure-inconsistency') {
      return {
        title: 'Reorganize directory structure',
        kind: 'refactor',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: false,
        confidence: 0.5,
        preview: `Consider reorganizing to follow the ${violation.expected} pattern`,
      };
    }

    return null;
  }

  /**
   * Create a pattern match for the detected organization type
   */
  private createOrganizationPattern(
    file: string,
    analysis: DirectoryStructureAnalysis
  ): PatternMatch {
    return {
      patternId: `directory-structure-${analysis.organization}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for a consistent directory naming pattern
   */
  private createDirectoryPattern(
    file: string,
    pattern: DirectoryPattern,
    analysis: DirectoryStructureAnalysis
  ): PatternMatch {
    const confidence = Math.min(pattern.count / analysis.totalDirectories + 0.3, 0.95);
    return {
      patternId: `directory-pattern-${pattern.name}`,
      location: { file, line: 1, column: 1 },
      confidence,
      isOutlier: false,
    };
  }

  /**
   * Create a violation for an inconsistent directory
   */
  private createInconsistencyViolation(
    file: string,
    inconsistent: DirectoryInfo,
    dominantOrganization: DirectoryOrganization
  ): Violation | null {
    // Only report if the file is in or near the inconsistent directory
    if (!file.includes(inconsistent.path)) {
      return null;
    }
    
    // Don't flag universal directories (components, shared, common, etc.)
    // These are valid in both feature-based and layer-based architectures
    if (isUniversalDirectory(inconsistent.name)) {
      return null;
    }

    const range: Range = {
      start: { line: 1, character: 1 },
      end: { line: 1, character: 1 },
    };

    let message: string;
    let expected: string;
    let actual: string;

    if (dominantOrganization === 'feature-based') {
      message = `Directory '${inconsistent.path}' uses layer-based organization but project uses feature-based. Consider moving to a feature directory.`;
      expected = 'feature-based organization (e.g., /features/auth/services/)';
      actual = `layer-based directory at root level (/${inconsistent.name}/)`;
    } else {
      message = `Directory '${inconsistent.path}' appears to be a feature directory but project uses layer-based organization.`;
      expected = 'layer-based organization (e.g., /services/, /controllers/)';
      actual = `feature-based directory (/${inconsistent.name}/)`;
    }

    return {
      id: `directory-structure-${inconsistent.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/directory-structure-inconsistency',
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
   * Check if the current file's directory follows the project's organization pattern
   */
  private checkFileDirectoryConsistency(
    file: string,
    analysis: DirectoryStructureAnalysis
  ): Violation | null {
    if (analysis.organization === 'unknown' || analysis.organization === 'hybrid') {
      return null;
    }

    const normalizedPath = file.replace(/\\/g, '/');
    const segments = normalizedPath.split('/').filter(s => s.length > 0);
    
    // Skip files at root level
    if (segments.length <= 1) {
      return null;
    }

    // Check if file is in a directory that matches the expected pattern
    const directoryName = segments[segments.length - 2];
    if (!directoryName) {
      return null;
    }

    const isInLayerDir = isLayerDirectory(directoryName);
    const isInFeatureDir = segments.some(s => isFeatureContainer(s));

    // Feature-based project but file is in a root-level layer directory
    if (analysis.organization === 'feature-based' && isInLayerDir && !isInFeatureDir) {
      // Only flag if it's at a shallow depth (root-level layer dirs)
      const depth = segments.length - 1;
      if (depth <= 2) {
        const range: Range = {
          start: { line: 1, character: 1 },
          end: { line: 1, character: 1 },
        };

        return {
          id: `directory-structure-file-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
          patternId: 'structural/directory-structure-file-location',
          severity: 'info',
          file,
          range,
          message: `File is in a layer-based directory '${directoryName}' but project uses feature-based organization. Consider organizing by feature.`,
          expected: 'File in feature directory (e.g., /features/[feature-name]/)',
          actual: `File in layer directory (/${directoryName}/)`,
          aiExplainAvailable: true,
          aiFixAvailable: false,
          firstSeen: new Date(),
          occurrences: 1,
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
 * Create a new DirectoryStructureDetector instance
 */
export function createDirectoryStructureDetector(): DirectoryStructureDetector {
  return new DirectoryStructureDetector();
}
