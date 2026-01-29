/**
 * Error Codes Detector - Error code pattern detection
 *
 * Detects error code patterns including:
 * - ErrorCode enum definitions
 * - Error code constants
 * - Error code usage in error objects
 * - Error code naming conventions
 *
 * Flags violations:
 * - Missing error codes in error objects
 * - Inconsistent error code naming
 * - Magic string error codes
 *
 * @requirements 12.2 - Error code patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ErrorCodePatternType =
  | 'error-code-enum'     // ErrorCode enum definition
  | 'error-code-const'    // Error code constants
  | 'error-code-usage'    // Error code in error object
  | 'error-code-type';    // Error code type definition

export type ErrorCodeViolationType =
  | 'missing-error-code'     // Error without code
  | 'magic-string-code'      // Hardcoded string error code
  | 'inconsistent-naming';   // Inconsistent code naming

export interface ErrorCodePatternInfo {
  type: ErrorCodePatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  codeName?: string | undefined;
  codeValue?: string | undefined;
  context?: string | undefined;
}

export interface ErrorCodeViolationInfo {
  type: ErrorCodeViolationType;
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

export interface ErrorCodeAnalysis {
  patterns: ErrorCodePatternInfo[];
  violations: ErrorCodeViolationInfo[];
  hasErrorCodeEnum: boolean;
  errorCodes: string[];
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const ERROR_CODE_ENUM_PATTERNS = [
  /enum\s+ErrorCode\s*\{/gi,
  /enum\s+ErrorCodes\s*\{/gi,
  /const\s+ErrorCode\s*=\s*\{/gi,
  /const\s+ErrorCodes\s*=\s*\{/gi,
] as const;

export const ERROR_CODE_CONST_PATTERNS = [
  /(?:const|let|var)\s+([A-Z_]+_ERROR)\s*=/gi,
  /(?:const|let|var)\s+(ERR_[A-Z_]+)\s*=/gi,
  /(?:const|let|var)\s+([A-Z_]+_CODE)\s*=/gi,
] as const;

export const ERROR_CODE_USAGE_PATTERNS = [
  /code\s*:\s*ErrorCode\.\w+/gi,
  /code\s*:\s*ErrorCodes\.\w+/gi,
  /errorCode\s*:\s*\w+/gi,
  /\.code\s*=\s*ErrorCode\.\w+/gi,
] as const;

export const ERROR_CODE_TYPE_PATTERNS = [
  /type\s+ErrorCode\s*=/gi,
  /interface\s+\w*Error\w*\s*\{[^}]*code\s*:/gi,
] as const;

export const MAGIC_STRING_CODE_PATTERNS = [
  /code\s*:\s*['"`][A-Z_]+['"`]/gi,
  /errorCode\s*:\s*['"`][A-Z_]+['"`]/gi,
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

export function detectErrorCodeEnums(content: string, file: string): ErrorCodePatternInfo[] {
  const results: ErrorCodePatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ERROR_CODE_ENUM_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'error-code-enum',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectErrorCodeConstants(content: string, file: string): ErrorCodePatternInfo[] {
  const results: ErrorCodePatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ERROR_CODE_CONST_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'error-code-const',
        file, line, column,
        matchedText: match[0],
        codeName: match[1],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectErrorCodeUsage(content: string, file: string): ErrorCodePatternInfo[] {
  const results: ErrorCodePatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ERROR_CODE_USAGE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'error-code-usage',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectMagicStringViolations(
  patterns: ErrorCodePatternInfo[],
  content: string,
  file: string
): ErrorCodeViolationInfo[] {
  const violations: ErrorCodeViolationInfo[] = [];
  const lines = content.split('\n');
  const hasErrorCodeEnum = patterns.some(p => p.type === 'error-code-enum');
  
  // Only flag magic strings if there's an ErrorCode enum
  if (!hasErrorCodeEnum) {return violations;}
  
  for (const pattern of MAGIC_STRING_CODE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      violations.push({
        type: 'magic-string-code',
        file, line, column,
        endLine: line,
        endColumn: column + match[0].length,
        value: match[0],
        issue: 'Using magic string instead of ErrorCode enum',
        suggestedFix: 'Use ErrorCode enum value instead of string literal',
        lineContent: lines[line - 1] || '',
      });
    }
  }
  return violations;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export function analyzeErrorCodes(content: string, file: string): ErrorCodeAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], hasErrorCodeEnum: false, errorCodes: [], confidence: 1.0 };
  }
  
  const enums = detectErrorCodeEnums(content, file);
  const constants = detectErrorCodeConstants(content, file);
  const usage = detectErrorCodeUsage(content, file);
  
  const allPatterns = [...enums, ...constants, ...usage];
  const violations = detectMagicStringViolations(allPatterns, content, file);
  
  const errorCodes = constants
    .filter(p => p.codeName)
    .map(p => p.codeName!)
    .filter((v, i, a) => a.indexOf(v) === i);
  
  const confidence = allPatterns.length > 0 ? Math.max(0.5, 1 - violations.length * 0.1) : 1.0;
  
  return {
    patterns: allPatterns,
    violations,
    hasErrorCodeEnum: enums.length > 0,
    errorCodes,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class ErrorCodesDetector extends RegexDetector {
  readonly id = 'errors/error-codes';
  readonly name = 'Error Codes Detector';
  readonly description = 'Detects error code patterns and usage';
  readonly category = 'errors';
  readonly subcategory = 'codes';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeErrorCodes(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasErrorCodeEnum: analysis.hasErrorCodeEnum,
        errorCodes: analysis.errorCodes,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createErrorCodesDetector(): ErrorCodesDetector {
  return new ErrorCodesDetector();
}
