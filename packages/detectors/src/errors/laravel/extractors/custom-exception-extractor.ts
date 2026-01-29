/**
 * Laravel Custom Exception Extractor
 *
 * Extracts custom exception classes and exception usages from Laravel code.
 *
 * @module errors/laravel/extractors/custom-exception-extractor
 */

import type {
  CustomExceptionInfo,
  ExceptionPropertyInfo,
  ExceptionThrowInfo,
  TryCatchBlockInfo,
  AbortUsageInfo,
  CustomExceptionExtractionResult,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Custom exception class
 */
const EXCEPTION_CLASS_PATTERN = /class\s+(\w+Exception)\s+extends\s+([\w\\]+(?:Exception)?)\s*\{/g;

/**
 * Exception property
 */
const EXCEPTION_PROPERTY_PATTERN = /(public|protected|private)\s+(?:(\??\w+)\s+)?\$(\w+)/g;

/**
 * render method in exception
 */
const RENDER_METHOD_PATTERN = /public\s+function\s+render\s*\(/;

/**
 * report method in exception
 */
const REPORT_METHOD_PATTERN = /public\s+function\s+report\s*\(/;

/**
 * HTTP status code property
 */
const STATUS_CODE_PATTERN = /(?:protected|public)\s+\$(?:statusCode|code)\s*=\s*(\d+)/;

/**
 * Error code property
 */
const ERROR_CODE_PATTERN = /(?:protected|public)\s+\$errorCode\s*=\s*['"]([^'"]+)['"]/;

/**
 * throw new Exception
 */
const THROW_PATTERN = /throw\s+new\s+([A-Z][\w\\]*(?:Exception)?)\s*\(([^)]*)\)/g;

/**
 * try-catch block
 */
const TRY_CATCH_PATTERN = /try\s*\{([\s\S]*?)\}\s*catch\s*\(\s*([A-Z][\w\\|]+)\s+\$(\w+)\s*\)\s*\{([\s\S]*?)\}(?:\s*finally\s*\{([\s\S]*?)\})?/g;

/**
 * abort() function
 */
const ABORT_PATTERN = /abort\s*\(\s*(\d+)(?:\s*,\s*['"]([^'"]+)['"])?\s*\)/g;

/**
 * abort_if() function
 */
const ABORT_IF_PATTERN = /abort_if\s*\([^,]+,\s*(\d+)(?:\s*,\s*['"]([^'"]+)['"])?\s*\)/g;

/**
 * abort_unless() function
 */
const ABORT_UNLESS_PATTERN = /abort_unless\s*\([^,]+,\s*(\d+)(?:\s*,\s*['"]([^'"]+)['"])?\s*\)/g;

/**
 * Log:: usage in catch
 */
const LOG_PATTERN = /Log::(emergency|alert|critical|error|warning|notice|info|debug)\s*\(/;

/**
 * throw $e or throw $exception
 */
const RETHROW_PATTERN = /throw\s+\$\w+\s*;/;

// ============================================================================
// Custom Exception Extractor
// ============================================================================

/**
 * Extracts custom exception classes and usages
 */
export class CustomExceptionExtractor {
  /**
   * Extract all exception-related patterns from content
   */
  extract(content: string, file: string): CustomExceptionExtractionResult {
    const exceptions = this.extractExceptions(content, file);
    const throws = this.extractThrows(content, file);
    const tryCatches = this.extractTryCatches(content, file);
    const aborts = this.extractAborts(content, file);

    const confidence = this.calculateConfidence(exceptions, throws, tryCatches, aborts);

    return {
      exceptions,
      throws,
      tryCatches,
      aborts,
      confidence,
    };
  }

  /**
   * Check if content contains exception patterns
   */
  hasExceptions(content: string): boolean {
    return (
      content.includes('Exception') ||
      content.includes('throw new') ||
      content.includes('try {') ||
      content.includes('abort(')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract custom exception classes
   */
  private extractExceptions(content: string, file: string): CustomExceptionInfo[] {
    const exceptions: CustomExceptionInfo[] = [];
    EXCEPTION_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = EXCEPTION_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const extendsClass = match[2] || 'Exception';
      const line = this.getLineNumber(content, match.index);

      // Extract class body
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      // Extract namespace
      const namespace = this.extractNamespace(content);

      // Check for render/report methods
      const hasRender = RENDER_METHOD_PATTERN.test(classBody);
      const hasReport = REPORT_METHOD_PATTERN.test(classBody);

      // Extract status code
      const statusMatch = classBody.match(STATUS_CODE_PATTERN);
      const statusCode = statusMatch ? parseInt(statusMatch[1] || '0', 10) : null;

      // Extract error code
      const errorMatch = classBody.match(ERROR_CODE_PATTERN);
      const errorCode = errorMatch ? errorMatch[1] || null : null;

      // Extract properties
      const properties = this.extractProperties(classBody);

      exceptions.push({
        name,
        fqn: namespace ? `${namespace}\\${name}` : name,
        namespace,
        extends: extendsClass,
        hasRender,
        hasReport,
        statusCode,
        errorCode,
        properties,
        file,
        line,
      });
    }

    return exceptions;
  }

  /**
   * Extract exception throws
   */
  private extractThrows(content: string, file: string): ExceptionThrowInfo[] {
    const throws: ExceptionThrowInfo[] = [];
    THROW_PATTERN.lastIndex = 0;

    let match;
    while ((match = THROW_PATTERN.exec(content)) !== null) {
      const exceptionClass = match[1] || '';
      const argsStr = match[2] || '';
      const line = this.getLineNumber(content, match.index);

      // Try to extract message
      const messageMatch = argsStr.match(/^['"]([^'"]+)['"]/);
      const message = messageMatch ? messageMatch[1] || null : null;

      // Parse arguments
      const args = argsStr
        .split(',')
        .map(a => a.trim())
        .filter(Boolean);

      throws.push({
        exceptionClass,
        message,
        arguments: args,
        file,
        line,
      });
    }

    return throws;
  }

  /**
   * Extract try-catch blocks
   */
  private extractTryCatches(content: string, file: string): TryCatchBlockInfo[] {
    const tryCatches: TryCatchBlockInfo[] = [];
    TRY_CATCH_PATTERN.lastIndex = 0;

    let match;
    while ((match = TRY_CATCH_PATTERN.exec(content)) !== null) {
      const catchTypes = (match[2] || '').split('|').map(t => t.trim());
      const catchBody = match[4] || '';
      const finallyBody = match[5] || '';
      const line = this.getLineNumber(content, match.index);

      // Check if exception is logged
      const logs = LOG_PATTERN.test(catchBody);

      // Check if exception is rethrown
      const rethrows = RETHROW_PATTERN.test(catchBody);

      tryCatches.push({
        catchTypes,
        hasFinally: !!finallyBody,
        rethrows,
        logs,
        file,
        line,
      });
    }

    return tryCatches;
  }

  /**
   * Extract abort usages
   */
  private extractAborts(content: string, file: string): AbortUsageInfo[] {
    const aborts: AbortUsageInfo[] = [];

    // abort()
    ABORT_PATTERN.lastIndex = 0;
    let match;
    while ((match = ABORT_PATTERN.exec(content)) !== null) {
      aborts.push({
        type: 'abort',
        statusCode: parseInt(match[1] || '0', 10),
        message: match[2] || null,
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    // abort_if()
    ABORT_IF_PATTERN.lastIndex = 0;
    while ((match = ABORT_IF_PATTERN.exec(content)) !== null) {
      aborts.push({
        type: 'abort_if',
        statusCode: parseInt(match[1] || '0', 10),
        message: match[2] || null,
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    // abort_unless()
    ABORT_UNLESS_PATTERN.lastIndex = 0;
    while ((match = ABORT_UNLESS_PATTERN.exec(content)) !== null) {
      aborts.push({
        type: 'abort_unless',
        statusCode: parseInt(match[1] || '0', 10),
        message: match[2] || null,
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    return aborts;
  }

  /**
   * Extract properties from class body
   */
  private extractProperties(classBody: string): ExceptionPropertyInfo[] {
    const properties: ExceptionPropertyInfo[] = [];
    EXCEPTION_PROPERTY_PATTERN.lastIndex = 0;

    let match;
    while ((match = EXCEPTION_PROPERTY_PATTERN.exec(classBody)) !== null) {
      const visibility = match[1] as ExceptionPropertyInfo['visibility'];
      const type = match[2] || null;
      const name = match[3] || '';

      if (name) {
        properties.push({
          name,
          type,
          visibility,
        });
      }
    }

    return properties;
  }

  /**
   * Extract namespace
   */
  private extractNamespace(content: string): string | null {
    const match = content.match(/namespace\s+([\w\\]+)\s*;/);
    return match ? match[1] || null : null;
  }

  /**
   * Extract class body
   */
  private extractClassBody(content: string, startIndex: number): string {
    let depth = 1;
    let i = startIndex;

    while (i < content.length && depth > 0) {
      if (content[i] === '{') {depth++;}
      else if (content[i] === '}') {depth--;}
      i++;
    }

    return content.substring(startIndex, i - 1);
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    exceptions: CustomExceptionInfo[],
    throws: ExceptionThrowInfo[],
    tryCatches: TryCatchBlockInfo[],
    aborts: AbortUsageInfo[]
  ): number {
    if (exceptions.length === 0 && throws.length === 0 && tryCatches.length === 0 && aborts.length === 0) {
      return 0;
    }

    let confidence = 0.5;

    if (exceptions.length > 0) {confidence += 0.2;}
    if (throws.length > 0) {confidence += 0.15;}
    if (tryCatches.length > 0) {confidence += 0.1;}
    if (aborts.length > 0) {confidence += 0.05;}

    return Math.min(confidence, 1.0);
  }

  /**
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new custom exception extractor
 */
export function createCustomExceptionExtractor(): CustomExceptionExtractor {
  return new CustomExceptionExtractor();
}
