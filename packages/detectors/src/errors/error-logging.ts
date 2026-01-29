/**
 * Error Logging Detector - Error logging pattern detection
 *
 * Detects error logging patterns including:
 * - Logger usage for errors
 * - Error context logging
 * - Stack trace logging
 * - Structured error logging
 *
 * Flags violations:
 * - Console.log for errors
 * - Missing error context
 * - Inconsistent logging
 *
 * @requirements 12.7 - Error logging patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ErrorLoggingPatternType =
  | 'logger-error'        // logger.error()
  | 'structured-log'      // Structured error logging
  | 'context-log'         // Error with context
  | 'stack-trace-log';    // Stack trace logging

export type ErrorLoggingViolationType =
  | 'console-error'         // Using console.error
  | 'missing-context'       // Error without context
  | 'inconsistent-logging'; // Mixed logging patterns

export interface ErrorLoggingPatternInfo {
  type: ErrorLoggingPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  loggerName?: string | undefined;
  context?: string | undefined;
}

export interface ErrorLoggingViolationInfo {
  type: ErrorLoggingViolationType;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  value: string;
  issue: string;
  suggestedFix?: string;
  lineContent: string;
}

export interface ErrorLoggingAnalysis {
  patterns: ErrorLoggingPatternInfo[];
  violations: ErrorLoggingViolationInfo[];
  hasStructuredLogging: boolean;
  usesLogger: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const LOGGER_ERROR_PATTERNS = [
  // JavaScript/TypeScript
  /logger\.error\s*\(/gi,
  /log\.error\s*\(/gi,
  /logging\.error\s*\(/gi,
  /winston\.error\s*\(/gi,
  /pino\.error\s*\(/gi,
  // Python
  /logger\.exception\s*\(/gi,
  /self\.logger\.error\s*\(/gi,
  /self\._logger\.error\s*\(/gi,
] as const;

export const STRUCTURED_LOG_PATTERNS = [
  // JavaScript/TypeScript
  /logger\.error\s*\(\s*\{/gi,
  /log\.error\s*\(\s*\{/gi,
  /error\s*:\s*\{[^}]*message/gi,
  /logError\s*\(\s*\{/gi,
  // Python - extra dict
  /logger\.error\s*\([^)]+,\s*extra\s*=/gi,
  /logger\.exception\s*\([^)]+,\s*extra\s*=/gi,
] as const;

export const CONTEXT_LOG_PATTERNS = [
  // JavaScript/TypeScript
  /logger\.error\s*\([^)]*,\s*\{/gi,
  /log\.error\s*\([^)]*,\s*\{/gi,
  /error\s*,\s*\{\s*context/gi,
  /error\s*,\s*\{\s*metadata/gi,
  // Python
  /exc_info\s*=\s*True/gi,
  /stack_info\s*=\s*True/gi,
] as const;

export const STACK_TRACE_PATTERNS = [
  // JavaScript/TypeScript
  /\.stack\b/gi,
  /stackTrace/gi,
  /Error\.captureStackTrace/gi,
  /error\.stack/gi,
  // Python
  /traceback\.format_exc/gi,
  /traceback\.print_exc/gi,
  /sys\.exc_info/gi,
  /__traceback__/gi,
] as const;

export const CONSOLE_ERROR_PATTERNS = [
  // JavaScript/TypeScript
  /console\.error\s*\(/gi,
  /console\.log\s*\([^)]*error/gi,
  /console\.warn\s*\([^)]*error/gi,
  // Python - print for errors (anti-pattern)
  /print\s*\([^)]*[Ee]rror/gi,
  /print\s*\([^)]*[Ee]xception/gi,
] as const;

export const EXCLUDED_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /node_modules\//,
  /\.d\.ts$/,
];

// ============================================================================
// Helper Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(p => p.test(filePath));
}

function isInsideComment(content: string, index: number): boolean {
  const before = content.slice(0, index);
  const lastNewline = before.lastIndexOf('\n');
  const line = before.slice(lastNewline + 1);
  if (line.includes('//') && index - lastNewline - 1 > line.indexOf('//')) {return true;}
  return before.lastIndexOf('/*') > before.lastIndexOf('*/');
}

function getPosition(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

// ============================================================================
// Detection Functions
// ============================================================================

export function detectLoggerError(content: string, file: string): ErrorLoggingPatternInfo[] {
  const results: ErrorLoggingPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of LOGGER_ERROR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'logger-error',
        file, line, column,
        matchedText: match[0],
        loggerName: match[0].split('.')[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectStructuredLogging(content: string, file: string): ErrorLoggingPatternInfo[] {
  const results: ErrorLoggingPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of STRUCTURED_LOG_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'structured-log',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectContextLogging(content: string, file: string): ErrorLoggingPatternInfo[] {
  const results: ErrorLoggingPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of CONTEXT_LOG_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'context-log',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectStackTraceLogging(content: string, file: string): ErrorLoggingPatternInfo[] {
  const results: ErrorLoggingPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of STACK_TRACE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'stack-trace-log',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectConsoleErrorViolations(
  patterns: ErrorLoggingPatternInfo[],
  content: string,
  file: string
): ErrorLoggingViolationInfo[] {
  const violations: ErrorLoggingViolationInfo[] = [];
  const lines = content.split('\n');
  const usesLogger = patterns.some(p => p.type === 'logger-error');
  
  // Only flag console.error if there's a logger being used
  if (!usesLogger) {return violations;}
  
  for (const pattern of CONSOLE_ERROR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      violations.push({
        type: 'console-error',
        file, line, column,
        endLine: line,
        endColumn: column + match[0].length,
        value: match[0],
        issue: 'Using console for error logging instead of logger',
        suggestedFix: 'Use logger.error() for consistent error logging',
        lineContent: lines[line - 1] || '',
      });
    }
  }
  return violations;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export function analyzeErrorLogging(content: string, file: string): ErrorLoggingAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], hasStructuredLogging: false, usesLogger: false, confidence: 1.0 };
  }
  
  const loggerError = detectLoggerError(content, file);
  const structured = detectStructuredLogging(content, file);
  const contextLog = detectContextLogging(content, file);
  const stackTrace = detectStackTraceLogging(content, file);
  
  const allPatterns = [...loggerError, ...structured, ...contextLog, ...stackTrace];
  const violations = detectConsoleErrorViolations(allPatterns, content, file);
  
  const confidence = allPatterns.length > 0 ? Math.max(0.5, 1 - violations.length * 0.1) : 1.0;
  
  return {
    patterns: allPatterns,
    violations,
    hasStructuredLogging: structured.length > 0,
    usesLogger: loggerError.length > 0,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class ErrorLoggingDetector extends RegexDetector {
  readonly id = 'errors/error-logging';
  readonly name = 'Error Logging Detector';
  readonly description = 'Detects error logging patterns';
  readonly category = 'errors';
  readonly subcategory = 'logging';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeErrorLogging(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasStructuredLogging: analysis.hasStructuredLogging,
        usesLogger: analysis.usesLogger,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createErrorLoggingDetector(): ErrorLoggingDetector {
  return new ErrorLoggingDetector();
}
