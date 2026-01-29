/**
 * Rust Error Handling Detector
 *
 * Detects Rust error handling patterns:
 * - Result<T, E> usage
 * - ? operator propagation
 * - thiserror derives
 * - anyhow usage
 * - Custom error types
 * - Error mapping patterns
 * - Unwrap/expect anti-patterns
 *
 * @license Apache-2.0
 */

import type { PatternCategory } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface RustErrorPattern {
  id: string;
  name: string;
  category: PatternCategory;
  file: string;
  line: number;
  column: number;
  context: string;
  confidence: number;
  errorType: RustErrorType;
}

export type RustErrorType =
  | 'result-propagation'    // ? operator
  | 'error-mapping'         // map_err
  | 'custom-error'          // Custom error enum
  | 'thiserror'             // thiserror derive
  | 'anyhow'                // anyhow usage
  | 'unwrap'                // .unwrap() call
  | 'expect'                // .expect() call
  | 'panic'                 // panic! macro
  | 'error-chain'           // Error chaining
  | 'from-impl';            // From trait impl

export interface RustErrorDetectorOptions {
  includeUnwraps?: boolean;
  includeExpects?: boolean;
  includePanics?: boolean;
}

export interface RustErrorDetectionResult {
  patterns: RustErrorPattern[];
  customErrors: RustCustomError[];
  issues: RustErrorIssue[];
  stats: RustErrorStats;
}

export interface RustCustomError {
  name: string;
  file: string;
  line: number;
  variants: string[];
  derives: string[];
  hasThiserror: boolean;
}

export interface RustErrorIssue {
  type: 'unwrap-in-production' | 'panic-in-library' | 'missing-error-context' | 'swallowed-error';
  message: string;
  file: string;
  line: number;
  suggestion: string;
}

export interface RustErrorStats {
  resultTypes: number;
  questionMarks: number;
  mapErrors: number;
  customErrors: number;
  thiserrorDerives: number;
  anyhowUsage: number;
  unwrapCalls: number;
  expectCalls: number;
  panicCalls: number;
}

// ============================================================================
// Regex Patterns
// ============================================================================

// Result type patterns
const RESULT_TYPE_PATTERN = /Result\s*<\s*([^,>]+)\s*,\s*([^>]+)\s*>/g;
const QUESTION_MARK_PATTERN = /\?\s*[;,)}\]]/g;
const MAP_ERR_PATTERN = /\.map_err\s*\(\s*([^)]+)\s*\)/g;

// Error definition patterns
const THISERROR_DERIVE_PATTERN = /#\[derive\([^)]*Error[^)]*\)\]\s*(?:pub\s+)?enum\s+(\w+)/g;
const CUSTOM_ERROR_ENUM_PATTERN = /(?:pub\s+)?enum\s+(\w+Error)\s*\{/g;

// anyhow patterns
const ANYHOW_RESULT_PATTERN = /anyhow::Result\s*<\s*([^>]+)\s*>/g;
const ANYHOW_CONTEXT_PATTERN = /\.context\s*\(\s*"([^"]+)"\s*\)/g;

// Anti-patterns
const UNWRAP_PATTERN = /\.unwrap\s*\(\s*\)/g;
const EXPECT_PATTERN = /\.expect\s*\(\s*"([^"]+)"\s*\)/g;
const PANIC_PATTERN = /panic!\s*\(\s*"([^"]+)"/g;

// From trait implementation
const FROM_IMPL_PATTERN = /impl\s+From\s*<\s*(\w+)\s*>\s+for\s+(\w+)/g;

// ============================================================================
// Detector Implementation
// ============================================================================

/**
 * Detect Rust error handling patterns
 */
export function detectRustErrorPatterns(
  source: string,
  filePath: string,
  options: RustErrorDetectorOptions = {}
): RustErrorDetectionResult {
  const patterns: RustErrorPattern[] = [];
  const customErrors: RustCustomError[] = [];
  const issues: RustErrorIssue[] = [];
  const stats: RustErrorStats = {
    resultTypes: 0,
    questionMarks: 0,
    mapErrors: 0,
    customErrors: 0,
    thiserrorDerives: 0,
    anyhowUsage: 0,
    unwrapCalls: 0,
    expectCalls: 0,
    panicCalls: 0,
  };

  const isTestFile = filePath.includes('test') || source.includes('#[cfg(test)]');
  const isLibrary = filePath.includes('lib.rs') || source.includes('pub mod');

  // Detect Result types
  let match;
  while ((match = RESULT_TYPE_PATTERN.exec(source)) !== null) {
    stats.resultTypes++;
    const line = getLineNumber(source, match.index);
    
    patterns.push({
      id: `rust-result-${filePath}:${line}`,
      name: 'rust-result-type',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `Result<${match[1]}, ${match[2]}>`,
      confidence: 0.95,
      errorType: 'result-propagation',
    });
  }

  // Detect ? operator usage
  QUESTION_MARK_PATTERN.lastIndex = 0;
  while ((match = QUESTION_MARK_PATTERN.exec(source)) !== null) {
    stats.questionMarks++;
    const line = getLineNumber(source, match.index);
    
    patterns.push({
      id: `rust-propagation-${filePath}:${line}`,
      name: 'rust-error-propagation',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'Error propagation with ?',
      confidence: 0.9,
      errorType: 'result-propagation',
    });
  }

  // Detect map_err usage
  MAP_ERR_PATTERN.lastIndex = 0;
  while ((match = MAP_ERR_PATTERN.exec(source)) !== null) {
    stats.mapErrors++;
    const line = getLineNumber(source, match.index);
    
    patterns.push({
      id: `rust-map-err-${filePath}:${line}`,
      name: 'rust-error-mapping',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `.map_err(${match[1]?.slice(0, 50)})`,
      confidence: 0.9,
      errorType: 'error-mapping',
    });
  }

  // Detect thiserror derives
  THISERROR_DERIVE_PATTERN.lastIndex = 0;
  while ((match = THISERROR_DERIVE_PATTERN.exec(source)) !== null) {
    stats.thiserrorDerives++;
    stats.customErrors++;
    const errorName = match[1] ?? 'Unknown';
    const line = getLineNumber(source, match.index);
    
    patterns.push({
      id: `rust-thiserror-${filePath}:${line}`,
      name: 'rust-thiserror-derive',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `#[derive(Error)] enum ${errorName}`,
      confidence: 0.95,
      errorType: 'thiserror',
    });

    customErrors.push({
      name: errorName,
      file: filePath,
      line,
      variants: extractEnumVariants(source, match.index),
      derives: ['Error'],
      hasThiserror: true,
    });
  }

  // Detect custom error enums (without thiserror)
  CUSTOM_ERROR_ENUM_PATTERN.lastIndex = 0;
  while ((match = CUSTOM_ERROR_ENUM_PATTERN.exec(source)) !== null) {
    const errorName = match[1] ?? 'Unknown';
    const line = getLineNumber(source, match.index);
    
    // Skip if already detected as thiserror
    if (!customErrors.some(e => e.name === errorName)) {
      stats.customErrors++;
      
      patterns.push({
        id: `rust-custom-error-${filePath}:${line}`,
        name: 'rust-custom-error',
        category: 'errors' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: `enum ${errorName}`,
        confidence: 0.85,
        errorType: 'custom-error',
      });

      customErrors.push({
        name: errorName,
        file: filePath,
        line,
        variants: extractEnumVariants(source, match.index),
        derives: [],
        hasThiserror: false,
      });
    }
  }

  // Detect anyhow usage
  ANYHOW_RESULT_PATTERN.lastIndex = 0;
  while ((match = ANYHOW_RESULT_PATTERN.exec(source)) !== null) {
    stats.anyhowUsage++;
    const line = getLineNumber(source, match.index);
    
    patterns.push({
      id: `rust-anyhow-${filePath}:${line}`,
      name: 'rust-anyhow-result',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `anyhow::Result<${match[1]}>`,
      confidence: 0.95,
      errorType: 'anyhow',
    });
  }

  // Detect .context() usage
  ANYHOW_CONTEXT_PATTERN.lastIndex = 0;
  while ((match = ANYHOW_CONTEXT_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    
    patterns.push({
      id: `rust-context-${filePath}:${line}`,
      name: 'rust-error-context',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `.context("${match[1]?.slice(0, 50)}")`,
      confidence: 0.9,
      errorType: 'error-chain',
    });
  }

  // Detect From implementations
  FROM_IMPL_PATTERN.lastIndex = 0;
  while ((match = FROM_IMPL_PATTERN.exec(source)) !== null) {
    const fromType = match[1] ?? 'Unknown';
    const forType = match[2] ?? 'Unknown';
    const line = getLineNumber(source, match.index);
    
    patterns.push({
      id: `rust-from-impl-${filePath}:${line}`,
      name: 'rust-from-impl',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `impl From<${fromType}> for ${forType}`,
      confidence: 0.9,
      errorType: 'from-impl',
    });
  }

  // Detect unwrap calls (anti-pattern in production code)
  if (options.includeUnwraps !== false) {
    UNWRAP_PATTERN.lastIndex = 0;
    while ((match = UNWRAP_PATTERN.exec(source)) !== null) {
      stats.unwrapCalls++;
      const line = getLineNumber(source, match.index);
      
      patterns.push({
        id: `rust-unwrap-${filePath}:${line}`,
        name: 'rust-unwrap',
        category: 'errors' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: '.unwrap()',
        confidence: 0.95,
        errorType: 'unwrap',
      });

      // Flag as issue if not in test code
      if (!isTestFile) {
        issues.push({
          type: 'unwrap-in-production',
          message: 'Unwrap in non-test code may panic at runtime',
          file: filePath,
          line,
          suggestion: 'Use ? operator, .ok(), .unwrap_or(), or proper error handling',
        });
      }
    }
  }

  // Detect expect calls
  if (options.includeExpects !== false) {
    EXPECT_PATTERN.lastIndex = 0;
    while ((match = EXPECT_PATTERN.exec(source)) !== null) {
      stats.expectCalls++;
      const line = getLineNumber(source, match.index);
      const message = match[1] ?? '';
      
      patterns.push({
        id: `rust-expect-${filePath}:${line}`,
        name: 'rust-expect',
        category: 'errors' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: `.expect("${message.slice(0, 50)}")`,
        confidence: 0.95,
        errorType: 'expect',
      });
    }
  }

  // Detect panic! calls
  if (options.includePanics !== false) {
    PANIC_PATTERN.lastIndex = 0;
    while ((match = PANIC_PATTERN.exec(source)) !== null) {
      stats.panicCalls++;
      const line = getLineNumber(source, match.index);
      const message = match[1] ?? '';
      
      patterns.push({
        id: `rust-panic-${filePath}:${line}`,
        name: 'rust-panic',
        category: 'errors' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: `panic!("${message.slice(0, 50)}")`,
        confidence: 0.95,
        errorType: 'panic',
      });

      // Flag as issue if in library code
      if (isLibrary && !isTestFile) {
        issues.push({
          type: 'panic-in-library',
          message: 'Panic in library code should be avoided',
          file: filePath,
          line,
          suggestion: 'Return Result<T, E> instead of panicking',
        });
      }
    }
  }

  return {
    patterns,
    customErrors,
    issues,
    stats,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getLineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function extractEnumVariants(source: string, startIndex: number): string[] {
  const variants: string[] = [];
  
  // Find the opening brace
  const braceIndex = source.indexOf('{', startIndex);
  if (braceIndex === -1) {return variants;}
  
  // Find matching closing brace
  let depth = 1;
  let i = braceIndex + 1;
  let enumBody = '';
  
  while (i < source.length && depth > 0) {
    if (source[i] === '{') {depth++;}
    else if (source[i] === '}') {depth--;}
    if (depth > 0) {enumBody += source[i];}
    i++;
  }
  
  // Extract variant names
  const variantPattern = /^\s*(\w+)/gm;
  let match;
  while ((match = variantPattern.exec(enumBody)) !== null) {
    const variant = match[1];
    if (variant && !['pub', 'fn', 'impl', 'type', 'const', 'let'].includes(variant)) {
      variants.push(variant);
    }
  }
  
  return variants;
}

/**
 * Check if source uses Rust error handling patterns
 */
export function hasRustErrorHandling(source: string): boolean {
  return RESULT_TYPE_PATTERN.test(source) ||
         source.includes('thiserror') ||
         source.includes('anyhow') ||
         source.includes('Error');
}

/**
 * Detect error handling framework
 */
export function detectErrorFramework(source: string): string[] {
  const frameworks: string[] = [];
  
  if (source.includes('thiserror')) {frameworks.push('thiserror');}
  if (source.includes('anyhow')) {frameworks.push('anyhow');}
  if (source.includes('eyre')) {frameworks.push('eyre');}
  if (source.includes('failure')) {frameworks.push('failure');}
  if (source.includes('snafu')) {frameworks.push('snafu');}
  
  return frameworks;
}
