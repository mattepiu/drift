/**
 * Base Detector - Abstract detector class
 *
 * Defines the common interface for all detectors. All concrete detectors
 * must extend this class and implement the required abstract methods.
 *
 * @requirements 6.1 - THE Detector_System SHALL define a BaseDetector interface that all detectors implement
 * @requirements 6.3 - THE Detector SHALL declare its category, supported languages, and detection method
 * @requirements 6.6 - THE Detector SHALL be independently testable with mock AST inputs
 */

import type { DetectionMethod, DetectorInfo } from '../registry/types.js';
import type {
  PatternCategory,
  Language,
  PatternMatch,
  Violation,
  QuickFix,
  AST,
} from 'driftdetect-core';


// ============================================================================
// Detection Context Types
// ============================================================================

/**
 * Import information extracted from a file
 *
 * Provides details about import statements for pattern detection.
 */
export interface ImportInfo {
  /** The source module path (as written in the import statement) */
  source: string;

  /** Resolved absolute path to the imported module (if resolvable) */
  resolvedPath?: string;

  /** Named imports (e.g., ['foo', 'bar'] for import { foo, bar }) */
  namedImports: string[];

  /** Default import name (if present) */
  defaultImport?: string;

  /** Namespace import name (if present, e.g., import * as ns) */
  namespaceImport?: string;

  /** Whether this is a type-only import */
  isTypeOnly: boolean;

  /** Whether this is a side-effect only import (import './styles.css') */
  sideEffectOnly: boolean;

  /** Line number where the import appears (1-indexed) */
  line: number;

  /** Column number where the import appears (1-indexed) */
  column: number;
}

/**
 * Export information extracted from a file
 *
 * Provides details about export statements for pattern detection.
 */
export interface ExportInfo {
  /** Name of the exported symbol */
  name: string;

  /** Whether this is a default export */
  isDefault: boolean;

  /** Whether this is a type-only export */
  isTypeOnly: boolean;

  /** Whether this is a re-export from another module */
  isReExport: boolean;

  /** Source module for re-exports */
  source?: string;

  /** Original name if exported with alias */
  originalName?: string;

  /** Line number where the export appears (1-indexed) */
  line: number;

  /** Column number where the export appears (1-indexed) */
  column: number;
}

/**
 * Project-wide context for detection
 *
 * Provides information about the overall project structure
 * that may be needed for pattern detection.
 */
export interface ProjectContext {
  /** Root directory of the project */
  rootDir: string;

  /** All project files (relative paths) */
  files: string[];

  /** Project configuration (from drift config) */
  config: Record<string, unknown>;

  /** Dependency graph information (if available) */
  dependencyGraph?: {
    /** Get dependencies of a file */
    getDependencies: (file: string) => string[];
    /** Get dependents of a file */
    getDependents: (file: string) => string[];
    /** Check for circular dependencies */
    hasCircularDependency: () => boolean;
  };

  /** Package.json contents (if available) */
  packageJson?: Record<string, unknown>;

  /** TypeScript config (if available) */
  tsConfig?: Record<string, unknown>;
}

/**
 * Context provided to detectors for pattern detection
 *
 * Contains all information needed to analyze a file for patterns.
 *
 * @requirements 6.6 - Detectors are independently testable with mock AST inputs
 */
export interface DetectionContext {
  /** File path being analyzed (relative to project root) */
  file: string;

  /** Full file content as a string */
  content: string;

  /** Parsed AST (null if parsing failed or not applicable) */
  ast: AST | null;

  /** Import statements extracted from the file */
  imports: ImportInfo[];

  /** Export statements extracted from the file */
  exports: ExportInfo[];

  /** Project-wide context */
  projectContext: ProjectContext;

  /** Language of the file */
  language: Language;

  /** File extension (e.g., '.ts', '.tsx') */
  extension: string;

  /** Whether the file is a test file */
  isTestFile: boolean;

  /** Whether the file is a type definition file */
  isTypeDefinition: boolean;
}

// ============================================================================
// Detection Result Types
// ============================================================================

/**
 * Result of running detection on a file
 *
 * Contains all patterns found and any violations detected.
 */
export interface DetectionResult {
  /** Patterns found in the file */
  patterns: PatternMatch[];

  /** Violations detected in the file */
  violations: Violation[];

  /** Overall confidence score for the detection (0.0 to 1.0) */
  confidence: number;

  /** Detection metadata */
  metadata?: DetectionMetadata;
}

/**
 * Metadata about the detection process
 */
export interface DetectionMetadata {
  /** Time taken for detection in milliseconds */
  duration?: number;

  /** Number of AST nodes analyzed */
  nodesAnalyzed?: number;

  /** Any warnings generated during detection */
  warnings?: string[];

  /** Additional detector-specific metadata */
  custom?: Record<string, unknown>;
}

// ============================================================================
// Base Detector Abstract Class
// ============================================================================

/**
 * Abstract base class for all detectors
 *
 * All concrete detectors must extend this class and implement
 * the required abstract methods and properties.
 *
 * @requirements 6.1 - THE Detector_System SHALL define a BaseDetector interface that all detectors implement
 * @requirements 6.3 - THE Detector SHALL declare its category, supported languages, and detection method
 *
 * @example
 * ```typescript
 * class FileNamingDetector extends BaseDetector {
 *   readonly id = 'structural/file-naming';
 *   readonly category = 'structural';
 *   readonly subcategory = 'naming-conventions';
 *   readonly name = 'File Naming Convention Detector';
 *   readonly description = 'Detects file naming patterns';
 *   readonly supportedLanguages = ['typescript', 'javascript'];
 *   readonly detectionMethod = 'structural';
 *
 *   async detect(context: DetectionContext): Promise<DetectionResult> {
 *     // Implementation
 *   }
 *
 *   generateQuickFix(violation: Violation): QuickFix | null {
 *     // Implementation
 *   }
 * }
 * ```
 */
export abstract class BaseDetector {
  // ============================================================================
  // Abstract Metadata Properties
  // ============================================================================

  /**
   * Unique identifier for this detector
   *
   * Should follow the format: category/detector-name
   * Example: 'structural/file-naming', 'components/props-patterns'
   *
   * @requirements 6.1 - Detector identification
   */
  abstract readonly id: string;

  /**
   * Category of patterns this detector identifies
   *
   * Must be one of the valid PatternCategory values.
   *
   * @requirements 6.3 - Detector declares its category
   */
  abstract readonly category: PatternCategory;

  /**
   * Subcategory for more specific classification
   *
   * Example: 'naming-conventions', 'import-ordering'
   *
   * @requirements 6.3 - Detector declares its subcategory
   */
  abstract readonly subcategory: string;

  /**
   * Human-readable name for display
   *
   * Example: 'File Naming Convention Detector'
   *
   * @requirements 6.1 - Detector metadata
   */
  abstract readonly name: string;

  /**
   * Detailed description of what this detector does
   *
   * Should explain what patterns are detected and why they matter.
   *
   * @requirements 6.1 - Detector metadata
   */
  abstract readonly description: string;

  /**
   * Languages this detector supports
   *
   * The detector will only be invoked for files of these languages.
   *
   * @requirements 6.3 - Detector declares supported languages
   */
  abstract readonly supportedLanguages: Language[];

  /**
   * Detection method used by this detector
   *
   * - ast: Uses AST analysis
   * - regex: Uses regular expression matching
   * - semantic: Uses semantic analysis (type information)
   * - structural: Uses file/directory structure analysis
   * - custom: Uses custom detection logic
   *
   * @requirements 6.3 - Detector declares detection method
   */
  abstract readonly detectionMethod: DetectionMethod;

  // ============================================================================
  // Abstract Methods
  // ============================================================================

  /**
   * Detect patterns and violations in the given context
   *
   * This is the main detection method that analyzes a file and returns
   * any patterns found and violations detected.
   *
   * @param context - Detection context containing file info, AST, imports, etc.
   * @returns Promise resolving to detection results
   *
   * @requirements 6.1 - Detector implements detect method
   * @requirements 6.6 - Detector is independently testable with mock AST inputs
   */
  abstract detect(context: DetectionContext): Promise<DetectionResult>;

  /**
   * Generate a quick fix for a violation
   *
   * Returns a QuickFix that can be applied to resolve the violation,
   * or null if no automatic fix is available.
   *
   * @param violation - The violation to generate a fix for
   * @returns QuickFix or null if no fix is available
   *
   * @requirements 6.1 - Detector implements generateQuickFix method
   */
  abstract generateQuickFix(violation: Violation): QuickFix | null;

  // ============================================================================
  // Optional Lifecycle Hooks
  // ============================================================================

  /**
   * Called when the detector is registered with the registry
   *
   * Override this method to perform initialization tasks when
   * the detector is first registered.
   */
  onRegister?(): void;

  /**
   * Called when a file changes in the workspace
   *
   * Override this method to handle file change events,
   * such as invalidating cached analysis results.
   *
   * @param file - Path to the changed file
   */
  onFileChange?(file: string): void;

  /**
   * Called when the detector is being unloaded
   *
   * Override this method to perform cleanup tasks.
   */
  onUnload?(): void;

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Check if this detector supports a given language
   *
   * @param language - Language to check
   * @returns true if the language is supported
   */
  supportsLanguage(language: Language): boolean {
    return this.supportedLanguages.includes(language);
  }

  /**
   * Get detector info for registry
   *
   * Returns a DetectorInfo object containing all metadata
   * about this detector.
   *
   * @returns DetectorInfo object
   */
  getInfo(): DetectorInfo {
    return {
      id: this.id,
      category: this.category,
      subcategory: this.subcategory,
      name: this.name,
      description: this.description,
      supportedLanguages: this.supportedLanguages,
      detectionMethod: this.detectionMethod,
    };
  }

  /**
   * Create an empty detection result
   *
   * Utility method for creating a result with no patterns or violations.
   *
   * @param confidence - Optional confidence score (defaults to 1.0)
   * @returns Empty DetectionResult
   */
  protected createEmptyResult(confidence: number = 1.0): DetectionResult {
    return {
      patterns: [],
      violations: [],
      confidence,
    };
  }

  /**
   * Create a detection result with patterns
   *
   * Utility method for creating a result with patterns.
   *
   * @param patterns - Patterns found
   * @param confidence - Confidence score
   * @returns DetectionResult with patterns
   */
  protected createPatternResult(
    patterns: PatternMatch[],
    confidence: number = 1.0
  ): DetectionResult {
    return {
      patterns,
      violations: [],
      confidence,
    };
  }

  /**
   * Create a detection result with violations
   *
   * Utility method for creating a result with violations.
   *
   * @param violations - Violations found
   * @param confidence - Confidence score
   * @returns DetectionResult with violations
   */
  protected createViolationResult(
    violations: Violation[],
    confidence: number = 1.0
  ): DetectionResult {
    return {
      patterns: [],
      violations,
      confidence,
    };
  }

  /**
   * Create a full detection result
   *
   * Utility method for creating a result with both patterns and violations.
   *
   * @param patterns - Patterns found
   * @param violations - Violations found
   * @param confidence - Confidence score
   * @param metadata - Optional metadata
   * @returns Complete DetectionResult
   */
  protected createResult(
    patterns: PatternMatch[],
    violations: Violation[],
    confidence: number = 1.0,
    metadata?: DetectionMetadata
  ): DetectionResult {
    const result: DetectionResult = {
      patterns,
      violations,
      confidence,
    };

    if (metadata !== undefined) {
      result.metadata = metadata;
    }

    return result;
  }

  /**
   * Convert a common violation info object to a standard Violation
   *
   * Many detectors use internal violation info types. This helper converts
   * them to the standard Violation format expected by the detection result.
   *
   * @param info - Common violation info object
   * @returns Standard Violation object
   */
  protected convertViolationInfo(info: {
    type?: string | undefined;
    file: string;
    line: number;
    column: number;
    endLine?: number | undefined;
    endColumn?: number | undefined;
    value?: string | undefined;
    issue?: string | undefined;
    message?: string | undefined;
    suggestedFix?: string | undefined;
    severity?: 'error' | 'warning' | 'info' | 'hint' | undefined;
    lineContent?: string | undefined;
  }): Violation {
    const violation: Violation = {
      id: `${this.id}-${info.file}-${info.line}-${info.column}`,
      patternId: this.id,
      severity: info.severity || 'warning',
      file: info.file,
      range: {
        start: { line: info.line - 1, character: info.column - 1 },
        end: { line: (info.endLine || info.line) - 1, character: (info.endColumn || info.column) - 1 },
      },
      message: info.issue || info.message || info.type || 'Pattern violation detected',
      expected: info.suggestedFix || 'Follow established patterns',
      actual: info.value || info.lineContent || 'Non-conforming code',
      aiExplainAvailable: true,
      aiFixAvailable: !!info.suggestedFix,
      firstSeen: new Date(),
      occurrences: 1,
    };
    
    if (info.type) {
      violation.explanation = `Violation type: ${info.type}`;
    }
    
    return violation;
  }

  /**
   * Convert an array of common violation info objects to standard Violations
   *
   * @param infos - Array of common violation info objects
   * @returns Array of standard Violation objects
   */
  protected convertViolationInfos(infos: Array<{
    type?: string | undefined;
    file: string;
    line: number;
    column: number;
    endLine?: number | undefined;
    endColumn?: number | undefined;
    value?: string | undefined;
    issue?: string | undefined;
    message?: string | undefined;
    suggestedFix?: string | undefined;
    severity?: 'error' | 'warning' | 'info' | 'hint' | undefined;
    lineContent?: string | undefined;
  }>): Violation[] {
    return infos.map(info => this.convertViolationInfo(info));
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an object is a valid BaseDetector
 *
 * @param obj - Object to check
 * @returns true if the object is a BaseDetector
 */
export function isBaseDetector(obj: unknown): obj is BaseDetector {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const detector = obj as BaseDetector;

  return (
    typeof detector.id === 'string' &&
    typeof detector.category === 'string' &&
    typeof detector.subcategory === 'string' &&
    typeof detector.name === 'string' &&
    typeof detector.description === 'string' &&
    Array.isArray(detector.supportedLanguages) &&
    typeof detector.detectionMethod === 'string' &&
    typeof detector.detect === 'function' &&
    typeof detector.generateQuickFix === 'function'
  );
}

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Factory function type for creating detectors
 *
 * Used for lazy loading detectors.
 */
export type DetectorFactory = () => BaseDetector | Promise<BaseDetector>;

/**
 * Configuration options for detector instantiation
 */
export interface DetectorOptions {
  /** Whether to enable verbose logging */
  verbose?: boolean;

  /** Custom configuration for the detector */
  config?: Record<string, unknown>;

  /** Timeout for detection operations in milliseconds */
  timeout?: number;
}
