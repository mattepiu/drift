/**
 * Memory Citation Type
 * 
 * Citations link memories to specific code locations.
 * The hash enables drift detection - when code changes,
 * we can detect that the citation is stale.
 */

/**
 * A citation to a specific code location
 */
export interface MemoryCitation {
  /** File path relative to project root */
  file: string;
  /** Starting line number (1-indexed) */
  lineStart: number;
  /** Ending line number (1-indexed) */
  lineEnd: number;
  /** Sanitized code snippet (PII removed) */
  snippet?: string;
  /** SHA-256 hash of the cited content (first 16 chars) for drift detection */
  hash: string;
  /** When this citation was last validated */
  validatedAt?: string;
  /** Whether the citation is still valid (hash matches) */
  valid?: boolean;
}

/**
 * Citation validation result
 */
export interface CitationValidationResult {
  citation: MemoryCitation;
  isValid: boolean;
  currentHash?: string;
  driftDetected: boolean;
  suggestion?: string;
}
