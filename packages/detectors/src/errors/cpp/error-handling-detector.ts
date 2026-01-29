/**
 * C++ Error Handling Detector
 *
 * Detects C++ error handling patterns:
 * - Exception handling (try/catch/throw)
 * - std::expected (C++23)
 * - std::optional usage
 * - Error codes (errno, std::error_code)
 * - RAII patterns
 * - noexcept specifications
 * - Custom exception hierarchies
 *
 * @license Apache-2.0
 */

import type { PatternCategory } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface CppErrorPattern {
  id: string;
  name: string;
  category: PatternCategory;
  file: string;
  line: number;
  column: number;
  context: string;
  confidence: number;
  errorType: CppErrorType;
}

export type CppErrorType =
  | 'try-catch'
  | 'throw'
  | 'noexcept'
  | 'expected'
  | 'optional'
  | 'error-code'
  | 'custom-exception'
  | 'raii'
  | 'assert'
  | 'errno';

export interface CppErrorDetectorOptions {
  includeAsserts?: boolean;
  includeNoexcept?: boolean;
}

export interface CppErrorDetectionResult {
  patterns: CppErrorPattern[];
  customExceptions: CppCustomException[];
  issues: CppErrorIssue[];
  stats: CppErrorStats;
}

export interface CppCustomException {
  name: string;
  file: string;
  line: number;
  baseClass: string;
  hasWhat: boolean;
}

export interface CppErrorIssue {
  type: 'catch-all' | 'empty-catch' | 'throw-in-destructor' | 'missing-noexcept';
  message: string;
  file: string;
  line: number;
  suggestion: string;
}

export interface CppErrorStats {
  tryCatchBlocks: number;
  throwStatements: number;
  noexceptFunctions: number;
  expectedUsage: number;
  optionalUsage: number;
  errorCodeUsage: number;
  customExceptions: number;
  assertCalls: number;
}

// ============================================================================
// Regex Patterns
// ============================================================================

// Exception handling
const TRY_BLOCK_PATTERN = /\btry\s*\{/g;
const CATCH_PATTERN = /\bcatch\s*\(\s*([^)]+)\s*\)/g;
const CATCH_ALL_PATTERN = /\bcatch\s*\(\s*\.\.\.\s*\)/g;
const THROW_PATTERN = /\bthrow\s+([^;]+);/g;
const RETHROW_PATTERN = /\bthrow\s*;/g;

// noexcept
const NOEXCEPT_PATTERN = /\bnoexcept\s*(?:\([^)]*\))?\s*(?:->|{|;)/g;
const NOEXCEPT_FALSE_PATTERN = /\bnoexcept\s*\(\s*false\s*\)/g;

// std::expected (C++23)
const EXPECTED_PATTERN = /std::expected\s*<\s*([^,>]+)\s*,\s*([^>]+)\s*>/g;
const UNEXPECTED_PATTERN = /std::unexpected\s*\(/g;

// std::optional
const OPTIONAL_PATTERN = /std::optional\s*<\s*([^>]+)\s*>/g;
const NULLOPT_PATTERN = /std::nullopt/g;
const HAS_VALUE_PATTERN = /\.has_value\s*\(\s*\)/g;
const VALUE_OR_PATTERN = /\.value_or\s*\(/g;

// Error codes
const ERROR_CODE_PATTERN = /std::error_code\s+\w+/g;
const MAKE_ERROR_CODE_PATTERN = /std::make_error_code\s*\(/g;
const SYSTEM_ERROR_PATTERN = /std::system_error\s*\(/g;
const ERRNO_PATTERN = /\berrno\b/g;

// Custom exceptions
const EXCEPTION_CLASS_PATTERN = /class\s+(\w+)\s*:\s*(?:public|private|protected)\s+(std::\w*exception|\w+Exception)/g;
const WHAT_METHOD_PATTERN = /(?:const\s+)?char\s*\*\s*what\s*\(\s*\)\s*(?:const)?\s*(?:noexcept)?\s*(?:override)?/g;

// RAII patterns
const UNIQUE_PTR_PATTERN = /std::unique_ptr\s*<\s*([^>]+)\s*>/g;
const SHARED_PTR_PATTERN = /std::shared_ptr\s*<\s*([^>]+)\s*>/g;
const LOCK_GUARD_PATTERN = /std::(?:lock_guard|unique_lock|scoped_lock)\s*<\s*([^>]+)\s*>/g;

// Assertions
const ASSERT_PATTERN = /\bassert\s*\(/g;
const STATIC_ASSERT_PATTERN = /static_assert\s*\(/g;

// Anti-patterns
const EMPTY_CATCH_PATTERN = /catch\s*\([^)]+\)\s*\{\s*\}/g;
const DESTRUCTOR_THROW_PATTERN = /~\w+\s*\([^)]*\)[^{]*\{[^}]*\bthrow\b/g;

// ============================================================================
// Detector Implementation
// ============================================================================

/**
 * Detect C++ error handling patterns
 */
export function detectCppErrorPatterns(
  source: string,
  filePath: string,
  options: CppErrorDetectorOptions = {}
): CppErrorDetectionResult {
  const patterns: CppErrorPattern[] = [];
  const customExceptions: CppCustomException[] = [];
  const issues: CppErrorIssue[] = [];
  const stats: CppErrorStats = {
    tryCatchBlocks: 0,
    throwStatements: 0,
    noexceptFunctions: 0,
    expectedUsage: 0,
    optionalUsage: 0,
    errorCodeUsage: 0,
    customExceptions: 0,
    assertCalls: 0,
  };

  // Exception handling patterns
  detectExceptionPatterns(source, filePath, patterns, stats);

  // noexcept patterns
  if (options.includeNoexcept !== false) {
    detectNoexceptPatterns(source, filePath, patterns, stats);
  }

  // std::expected patterns (C++23)
  detectExpectedPatterns(source, filePath, patterns, stats);

  // std::optional patterns
  detectOptionalPatterns(source, filePath, patterns, stats);

  // Error code patterns
  detectErrorCodePatterns(source, filePath, patterns, stats);

  // Custom exception classes
  detectCustomExceptions(source, filePath, patterns, customExceptions, stats);

  // RAII patterns
  detectRaiiPatterns(source, filePath, patterns);

  // Assertions
  if (options.includeAsserts !== false) {
    detectAssertPatterns(source, filePath, patterns, stats);
  }

  // Anti-patterns and issues
  detectErrorIssues(source, filePath, issues);

  return { patterns, customExceptions, issues, stats };
}


// ============================================================================
// Pattern Detection Functions
// ============================================================================

function detectExceptionPatterns(
  source: string,
  filePath: string,
  patterns: CppErrorPattern[],
  stats: CppErrorStats
): void {
  let match;

  // Try blocks
  while ((match = TRY_BLOCK_PATTERN.exec(source)) !== null) {
    stats.tryCatchBlocks++;
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-try-${filePath}:${line}`,
      name: 'cpp-try-block',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'try block',
      confidence: 0.95,
      errorType: 'try-catch',
    });
  }

  // Catch blocks
  CATCH_PATTERN.lastIndex = 0;
  while ((match = CATCH_PATTERN.exec(source)) !== null) {
    const exceptionType = match[1]?.trim() ?? 'unknown';
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-catch-${filePath}:${line}`,
      name: 'cpp-catch-block',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `catch(${exceptionType})`,
      confidence: 0.95,
      errorType: 'try-catch',
    });
  }

  // Catch-all (...)
  CATCH_ALL_PATTERN.lastIndex = 0;
  while ((match = CATCH_ALL_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-catch-all-${filePath}:${line}`,
      name: 'cpp-catch-all',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'catch(...)',
      confidence: 0.95,
      errorType: 'try-catch',
    });
  }

  // Throw statements
  THROW_PATTERN.lastIndex = 0;
  while ((match = THROW_PATTERN.exec(source)) !== null) {
    stats.throwStatements++;
    const thrown = match[1]?.trim().slice(0, 50) ?? 'unknown';
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-throw-${filePath}:${line}`,
      name: 'cpp-throw',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `throw ${thrown}`,
      confidence: 0.95,
      errorType: 'throw',
    });
  }

  // Rethrow
  RETHROW_PATTERN.lastIndex = 0;
  while ((match = RETHROW_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-rethrow-${filePath}:${line}`,
      name: 'cpp-rethrow',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'throw; (rethrow)',
      confidence: 0.95,
      errorType: 'throw',
    });
  }
}

function detectNoexceptPatterns(
  source: string,
  filePath: string,
  patterns: CppErrorPattern[],
  stats: CppErrorStats
): void {
  let match;

  // noexcept specifier
  while ((match = NOEXCEPT_PATTERN.exec(source)) !== null) {
    stats.noexceptFunctions++;
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-noexcept-${filePath}:${line}`,
      name: 'cpp-noexcept',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'noexcept function',
      confidence: 0.9,
      errorType: 'noexcept',
    });
  }

  // noexcept(false)
  NOEXCEPT_FALSE_PATTERN.lastIndex = 0;
  while ((match = NOEXCEPT_FALSE_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-noexcept-false-${filePath}:${line}`,
      name: 'cpp-noexcept-false',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'noexcept(false)',
      confidence: 0.9,
      errorType: 'noexcept',
    });
  }
}

function detectExpectedPatterns(
  source: string,
  filePath: string,
  patterns: CppErrorPattern[],
  stats: CppErrorStats
): void {
  let match;

  // std::expected
  while ((match = EXPECTED_PATTERN.exec(source)) !== null) {
    stats.expectedUsage++;
    const valueType = match[1]?.trim() ?? 'T';
    const errorType = match[2]?.trim() ?? 'E';
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-expected-${filePath}:${line}`,
      name: 'cpp-expected',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `std::expected<${valueType}, ${errorType}>`,
      confidence: 0.95,
      errorType: 'expected',
    });
  }

  // std::unexpected
  UNEXPECTED_PATTERN.lastIndex = 0;
  while ((match = UNEXPECTED_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-unexpected-${filePath}:${line}`,
      name: 'cpp-unexpected',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'std::unexpected()',
      confidence: 0.95,
      errorType: 'expected',
    });
  }
}

function detectOptionalPatterns(
  source: string,
  filePath: string,
  patterns: CppErrorPattern[],
  stats: CppErrorStats
): void {
  let match;

  // std::optional
  while ((match = OPTIONAL_PATTERN.exec(source)) !== null) {
    stats.optionalUsage++;
    const valueType = match[1]?.trim() ?? 'T';
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-optional-${filePath}:${line}`,
      name: 'cpp-optional',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `std::optional<${valueType}>`,
      confidence: 0.9,
      errorType: 'optional',
    });
  }

  // std::nullopt
  NULLOPT_PATTERN.lastIndex = 0;
  while ((match = NULLOPT_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-nullopt-${filePath}:${line}`,
      name: 'cpp-nullopt',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'std::nullopt',
      confidence: 0.9,
      errorType: 'optional',
    });
  }

  // .has_value()
  HAS_VALUE_PATTERN.lastIndex = 0;
  while ((match = HAS_VALUE_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-has-value-${filePath}:${line}`,
      name: 'cpp-has-value',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: '.has_value()',
      confidence: 0.85,
      errorType: 'optional',
    });
  }

  // .value_or()
  VALUE_OR_PATTERN.lastIndex = 0;
  while ((match = VALUE_OR_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-value-or-${filePath}:${line}`,
      name: 'cpp-value-or',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: '.value_or()',
      confidence: 0.85,
      errorType: 'optional',
    });
  }
}

function detectErrorCodePatterns(
  source: string,
  filePath: string,
  patterns: CppErrorPattern[],
  stats: CppErrorStats
): void {
  let match;

  // std::error_code
  while ((match = ERROR_CODE_PATTERN.exec(source)) !== null) {
    stats.errorCodeUsage++;
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-error-code-${filePath}:${line}`,
      name: 'cpp-error-code',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'std::error_code',
      confidence: 0.9,
      errorType: 'error-code',
    });
  }

  // std::make_error_code
  MAKE_ERROR_CODE_PATTERN.lastIndex = 0;
  while ((match = MAKE_ERROR_CODE_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-make-error-code-${filePath}:${line}`,
      name: 'cpp-make-error-code',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'std::make_error_code()',
      confidence: 0.9,
      errorType: 'error-code',
    });
  }

  // std::system_error
  SYSTEM_ERROR_PATTERN.lastIndex = 0;
  while ((match = SYSTEM_ERROR_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-system-error-${filePath}:${line}`,
      name: 'cpp-system-error',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'std::system_error()',
      confidence: 0.9,
      errorType: 'error-code',
    });
  }

  // errno
  ERRNO_PATTERN.lastIndex = 0;
  while ((match = ERRNO_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-errno-${filePath}:${line}`,
      name: 'cpp-errno',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'errno',
      confidence: 0.85,
      errorType: 'errno',
    });
  }
}

function detectCustomExceptions(
  source: string,
  filePath: string,
  patterns: CppErrorPattern[],
  customExceptions: CppCustomException[],
  stats: CppErrorStats
): void {
  let match;

  // Custom exception classes
  while ((match = EXCEPTION_CLASS_PATTERN.exec(source)) !== null) {
    stats.customExceptions++;
    const name = match[1] ?? 'Unknown';
    const baseClass = match[2] ?? 'std::exception';
    const line = getLineNumber(source, match.index);

    // Check if it has what() method
    const classEnd = findClassEnd(source, match.index);
    const classBody = source.slice(match.index, classEnd);
    const hasWhat = WHAT_METHOD_PATTERN.test(classBody);

    patterns.push({
      id: `cpp-custom-exception-${filePath}:${line}`,
      name: 'cpp-custom-exception',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `class ${name} : ${baseClass}`,
      confidence: 0.95,
      errorType: 'custom-exception',
    });

    customExceptions.push({
      name,
      file: filePath,
      line,
      baseClass,
      hasWhat,
    });
  }
}

function detectRaiiPatterns(
  source: string,
  filePath: string,
  patterns: CppErrorPattern[]
): void {
  let match;

  // unique_ptr
  while ((match = UNIQUE_PTR_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-unique-ptr-${filePath}:${line}`,
      name: 'cpp-unique-ptr',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'std::unique_ptr (RAII)',
      confidence: 0.9,
      errorType: 'raii',
    });
  }

  // shared_ptr
  SHARED_PTR_PATTERN.lastIndex = 0;
  while ((match = SHARED_PTR_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-shared-ptr-${filePath}:${line}`,
      name: 'cpp-shared-ptr',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'std::shared_ptr (RAII)',
      confidence: 0.9,
      errorType: 'raii',
    });
  }

  // lock_guard, unique_lock, scoped_lock
  LOCK_GUARD_PATTERN.lastIndex = 0;
  while ((match = LOCK_GUARD_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-lock-guard-${filePath}:${line}`,
      name: 'cpp-lock-guard',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'Lock guard (RAII)',
      confidence: 0.9,
      errorType: 'raii',
    });
  }
}

function detectAssertPatterns(
  source: string,
  filePath: string,
  patterns: CppErrorPattern[],
  stats: CppErrorStats
): void {
  let match;

  // assert()
  while ((match = ASSERT_PATTERN.exec(source)) !== null) {
    stats.assertCalls++;
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-assert-${filePath}:${line}`,
      name: 'cpp-assert',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'assert()',
      confidence: 0.9,
      errorType: 'assert',
    });
  }

  // static_assert
  STATIC_ASSERT_PATTERN.lastIndex = 0;
  while ((match = STATIC_ASSERT_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    patterns.push({
      id: `cpp-static-assert-${filePath}:${line}`,
      name: 'cpp-static-assert',
      category: 'errors' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: 'static_assert()',
      confidence: 0.95,
      errorType: 'assert',
    });
  }
}

function detectErrorIssues(
  source: string,
  filePath: string,
  issues: CppErrorIssue[]
): void {
  let match;

  // Empty catch blocks
  while ((match = EMPTY_CATCH_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    issues.push({
      type: 'empty-catch',
      message: 'Empty catch block swallows exceptions',
      file: filePath,
      line,
      suggestion: 'Log the exception or rethrow it',
    });
  }

  // Throw in destructor
  DESTRUCTOR_THROW_PATTERN.lastIndex = 0;
  while ((match = DESTRUCTOR_THROW_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    issues.push({
      type: 'throw-in-destructor',
      message: 'Throwing in destructor can cause std::terminate',
      file: filePath,
      line,
      suggestion: 'Mark destructor noexcept and handle errors internally',
    });
  }

  // Catch-all without rethrow (potential issue)
  CATCH_ALL_PATTERN.lastIndex = 0;
  while ((match = CATCH_ALL_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);
    const afterCatch = source.slice(match.index, match.index + 200);
    if (!afterCatch.includes('throw;')) {
      issues.push({
        type: 'catch-all',
        message: 'Catch-all without rethrow may hide errors',
        file: filePath,
        line,
        suggestion: 'Consider catching specific exceptions or rethrowing',
      });
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getLineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function findClassEnd(source: string, startIndex: number): number {
  const braceIndex = source.indexOf('{', startIndex);
  if (braceIndex === -1) {return startIndex + 100;}

  let depth = 1;
  let i = braceIndex + 1;

  while (i < source.length && depth > 0) {
    if (source[i] === '{') {depth++;}
    else if (source[i] === '}') {depth--;}
    i++;
  }

  return i;
}

/**
 * Check if source uses C++ error handling patterns
 */
export function hasCppErrorHandling(source: string): boolean {
  return TRY_BLOCK_PATTERN.test(source) ||
         THROW_PATTERN.test(source) ||
         EXPECTED_PATTERN.test(source) ||
         ERROR_CODE_PATTERN.test(source);
}

/**
 * Detect error handling style
 */
export function detectErrorStyle(source: string): string[] {
  const styles: string[] = [];

  if (TRY_BLOCK_PATTERN.test(source)) {styles.push('exceptions');}
  if (EXPECTED_PATTERN.test(source)) {styles.push('expected');}
  if (OPTIONAL_PATTERN.test(source)) {styles.push('optional');}
  if (ERROR_CODE_PATTERN.test(source)) {styles.push('error-codes');}
  if (ERRNO_PATTERN.test(source)) {styles.push('errno');}

  return styles;
}
