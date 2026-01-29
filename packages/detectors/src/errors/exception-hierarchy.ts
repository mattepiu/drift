/**
 * Exception Hierarchy Detector - Exception taxonomy detection
 *
 * Detects exception hierarchy patterns including:
 * - AppError base class inheritance
 * - Custom error class definitions
 * - Error class naming conventions
 * - Error inheritance chains
 *
 * Flags violations:
 * - Throwing raw Error instead of custom errors
 * - Inconsistent error class naming
 * - Missing error inheritance
 *
 * @requirements 12.1 - Exception hierarchy patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ExceptionPatternType =
  | 'app-error-class'     // AppError base class
  | 'custom-error-class'  // Custom error extending Error
  | 'error-inheritance'   // Error class inheritance
  | 'error-factory';      // Error factory function

export type ExceptionViolationType =
  | 'raw-error-throw'        // throw new Error() instead of custom
  | 'inconsistent-naming'    // Error class not ending in Error
  | 'missing-inheritance';   // Custom error not extending base

export interface ExceptionPatternInfo {
  type: ExceptionPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  className?: string | undefined;
  baseClass?: string | undefined;
  context?: string | undefined;
}

export interface ExceptionViolationInfo {
  type: ExceptionViolationType;
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

export interface ExceptionAnalysis {
  patterns: ExceptionPatternInfo[];
  violations: ExceptionViolationInfo[];
  hasCustomErrors: boolean;
  hasAppError: boolean;
  errorClasses: string[];
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const APP_ERROR_PATTERNS = [
  // JavaScript/TypeScript
  /class\s+AppError\s+extends\s+Error/gi,
  /class\s+BaseError\s+extends\s+Error/gi,
  /class\s+ApplicationError\s+extends\s+Error/gi,
  // Python
  /class\s+AppError\s*\(\s*Exception\s*\)/gi,
  /class\s+BaseError\s*\(\s*Exception\s*\)/gi,
  /class\s+ApplicationError\s*\(\s*Exception\s*\)/gi,
] as const;

export const CUSTOM_ERROR_PATTERNS = [
  // JavaScript/TypeScript
  /class\s+(\w+Error)\s+extends\s+(?:App|Base|Application)?Error/gi,
  /class\s+(\w+Exception)\s+extends\s+(?:App|Base|Application)?Error/gi,
  // Python
  /class\s+(\w+Error)\s*\(\s*(?:App|Base|Application)?Error\s*\)/gi,
  /class\s+(\w+Exception)\s*\(\s*(?:App|Base|Application)?Exception\s*\)/gi,
  /class\s+(\w+Error)\s*\(\s*Exception\s*\)/gi,
] as const;

export const ERROR_INHERITANCE_PATTERNS = [
  // JavaScript/TypeScript
  /class\s+(\w+)\s+extends\s+(\w+Error)/gi,
  /class\s+(\w+)\s+extends\s+(\w+Exception)/gi,
  // Python
  /class\s+(\w+)\s*\(\s*(\w+Error)\s*\)/gi,
  /class\s+(\w+)\s*\(\s*(\w+Exception)\s*\)/gi,
] as const;

export const ERROR_FACTORY_PATTERNS = [
  // JavaScript/TypeScript
  /function\s+create\w*Error\s*\(/gi,
  /const\s+create\w*Error\s*=/gi,
  /export\s+(?:function|const)\s+\w*Error(?:Factory)?\s*[=(]/gi,
  // Python
  /def\s+create_\w*error\s*\(/gi,
  /def\s+make_\w*error\s*\(/gi,
] as const;

export const RAW_ERROR_PATTERNS = [
  // JavaScript/TypeScript
  /throw\s+new\s+Error\s*\(/gi,
  /throw\s+Error\s*\(/gi,
  // Python
  /raise\s+Exception\s*\(/gi,
  /raise\s+RuntimeError\s*\(/gi,
  /raise\s+ValueError\s*\(/gi,
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

export function detectAppErrorClasses(content: string, file: string): ExceptionPatternInfo[] {
  const results: ExceptionPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of APP_ERROR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'app-error-class',
        file, line, column,
        matchedText: match[0],
        className: match[0].match(/class\s+(\w+)/)?.[1],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectCustomErrorClasses(content: string, file: string): ExceptionPatternInfo[] {
  const results: ExceptionPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of CUSTOM_ERROR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      const classMatch = match[0].match(/class\s+(\w+)\s+extends\s+(\w+)/);
      results.push({
        type: 'custom-error-class',
        file, line, column,
        matchedText: match[0],
        className: classMatch?.[1],
        baseClass: classMatch?.[2],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectErrorInheritance(content: string, file: string): ExceptionPatternInfo[] {
  const results: ExceptionPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ERROR_INHERITANCE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      const classMatch = match[0].match(/class\s+(\w+)\s+extends\s+(\w+)/);
      results.push({
        type: 'error-inheritance',
        file, line, column,
        matchedText: match[0],
        className: classMatch?.[1],
        baseClass: classMatch?.[2],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectErrorFactories(content: string, file: string): ExceptionPatternInfo[] {
  const results: ExceptionPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ERROR_FACTORY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'error-factory',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectRawErrorViolations(
  patterns: ExceptionPatternInfo[],
  content: string,
  file: string
): ExceptionViolationInfo[] {
  const violations: ExceptionViolationInfo[] = [];
  const lines = content.split('\n');
  const hasCustomErrors = patterns.length > 0;
  
  // Only flag raw errors if the file has custom error classes
  if (!hasCustomErrors) {return violations;}
  
  for (const pattern of RAW_ERROR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      violations.push({
        type: 'raw-error-throw',
        file, line, column,
        endLine: line,
        endColumn: column + match[0].length,
        value: match[0],
        issue: 'Throwing raw Error instead of custom error class',
        suggestedFix: 'Use a custom error class that extends AppError',
        lineContent: lines[line - 1] || '',
      });
    }
  }
  return violations;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export function analyzeExceptionHierarchy(content: string, file: string): ExceptionAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], hasCustomErrors: false, hasAppError: false, errorClasses: [], confidence: 1.0 };
  }
  
  const appErrors = detectAppErrorClasses(content, file);
  const customErrors = detectCustomErrorClasses(content, file);
  const inheritance = detectErrorInheritance(content, file);
  const factories = detectErrorFactories(content, file);
  
  const allPatterns = [...appErrors, ...customErrors, ...inheritance, ...factories];
  const violations = detectRawErrorViolations(allPatterns, content, file);
  
  const errorClasses = allPatterns
    .filter(p => p.className)
    .map(p => p.className!)
    .filter((v, i, a) => a.indexOf(v) === i);
  
  const confidence = allPatterns.length > 0 ? Math.max(0.5, 1 - violations.length * 0.1) : 1.0;
  
  return {
    patterns: allPatterns,
    violations,
    hasCustomErrors: customErrors.length > 0 || inheritance.length > 0,
    hasAppError: appErrors.length > 0,
    errorClasses,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class ExceptionHierarchyDetector extends RegexDetector {
  readonly id = 'errors/exception-hierarchy';
  readonly name = 'Exception Hierarchy Detector';
  readonly description = 'Detects exception hierarchy and custom error patterns';
  readonly category = 'errors';
  readonly subcategory = 'hierarchy';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeExceptionHierarchy(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasCustomErrors: analysis.hasCustomErrors,
        hasAppError: analysis.hasAppError,
        errorClasses: analysis.errorClasses,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createExceptionHierarchyDetector(): ExceptionHierarchyDetector {
  return new ExceptionHierarchyDetector();
}
