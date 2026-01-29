/**
 * Integration Types
 *
 * Types for the integration between @drift/lsp and driftdetect-core.
 */

import type { ViolationInfo, PatternInfo } from '../types/lsp-types.js';
import type { Pattern, PatternCategory } from 'driftdetect-core';

/**
 * Configuration for the core integration
 */
export interface CoreIntegrationConfig {
  /** Root directory for .drift folder */
  rootDir: string;

  /** Whether to auto-save pattern changes */
  autoSave: boolean;

  /** Whether to validate schemas */
  validateSchema: boolean;

  /** Whether to track history */
  trackHistory: boolean;

  /** Minimum confidence threshold for violations */
  minConfidence: number;

  /** Whether AI features are available */
  aiEnabled: boolean;
}

/**
 * Default core integration configuration
 */
export const DEFAULT_CORE_INTEGRATION_CONFIG: CoreIntegrationConfig = {
  rootDir: '.',
  autoSave: true,
  validateSchema: true,
  trackHistory: true,
  minConfidence: 0.5,
  aiEnabled: false,
};

/**
 * Result of scanning a document
 */
export interface ScanResult {
  /** URI of the scanned document */
  uri: string;

  /** Violations found in the document */
  violations: ViolationInfo[];

  /** Patterns detected in the document */
  patterns: PatternInfo[];

  /** Scan duration in milliseconds */
  duration: number;

  /** Any errors encountered during scanning */
  errors: ScanError[];
}

/**
 * Error encountered during scanning
 */
export interface ScanError {
  /** Error message */
  message: string;

  /** Error code */
  code?: string;

  /** Whether scanning can continue */
  recoverable: boolean;
}

/**
 * Options for scanning a document
 */
export interface ScanOptions {
  /** Force rescan even if cached */
  force?: boolean;

  /** Specific pattern categories to check */
  categories?: PatternCategory[];

  /** Specific pattern IDs to check */
  patternIds?: string[];

  /** Minimum confidence threshold */
  minConfidence?: number;
}

/**
 * Result of approving a pattern
 */
export interface ApproveResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Pattern ID that was approved */
  patternId: string;

  /** Number of violations removed */
  removedViolations: number;

  /** Error message if failed */
  error?: string;
}

/**
 * Result of ignoring a pattern
 */
export interface IgnoreResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Pattern ID that was ignored */
  patternId: string;

  /** Number of violations suppressed */
  suppressedViolations: number;

  /** Error message if failed */
  error?: string;
}

/**
 * Result of creating a variant
 */
export interface CreateVariantResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Variant ID that was created */
  variantId?: string;

  /** Pattern ID the variant applies to */
  patternId: string;

  /** Number of violations suppressed */
  suppressedViolations: number;

  /** Error message if failed */
  error?: string;
}

/**
 * Input for creating a variant
 */
export interface CreateVariantInput {
  /** Pattern ID this variant applies to */
  patternId: string;

  /** Human-readable name for the variant */
  name: string;

  /** Reason explaining why this deviation is intentional */
  reason: string;

  /** Scope of the variant: 'global', 'directory', or 'file' */
  scope: 'global' | 'directory' | 'file';

  /** Scope value (directory path or file path, depending on scope) */
  scopeValue?: string;

  /** File path where the variant applies */
  file: string;

  /** Line number where the variant applies */
  line: number;

  /** Column number where the variant applies */
  column: number;
}

/**
 * Convert a driftdetect-core Pattern to LSP PatternInfo
 */
export function patternToInfo(pattern: Pattern): PatternInfo {
  const info: PatternInfo = {
    id: pattern.id,
    name: pattern.name,
    description: pattern.description,
    category: pattern.category,
    subcategory: pattern.subcategory,
    confidence: pattern.confidence.score,
    frequency: pattern.confidence.frequency,
  };

  // Only set optional properties if they have values
  if (pattern.severity !== undefined) {
    info.severity = pattern.severity;
  }
  if (pattern.autoFixable !== undefined) {
    info.autoFixable = pattern.autoFixable;
  }

  return info;
}
