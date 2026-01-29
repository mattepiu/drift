/**
 * Error Format Detector - Error response format pattern detection
 *
 * Detects error response format patterns including:
 * - Standard error format ({ error: { message, code, details } })
 * - HTTP Problem Details (RFC 7807) ({ type, title, status, detail, instance })
 * - JSON:API error format ({ errors: [{ status, title, detail, source }] })
 * - GraphQL error format ({ errors: [{ message, locations, path, extensions }] })
 * - Custom error formats with code/message patterns
 * - Error inheritance patterns (AppError, HttpError, etc.)
 *
 * Flags violations:
 * - Inconsistent error format across endpoints
 * - Missing required error fields (message, code)
 * - Mixing different error formats
 * - Raw error strings instead of structured errors
 * - Missing error codes for categorization
 * - Inconsistent error code naming conventions
 *
 * @requirements 10.4 - THE API_Detector SHALL detect error response format consistency
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/** Types of error formats detected */
export type ErrorFormat =
  | 'standard'        // { error: { message, code, details } }
  | 'problem-details' // RFC 7807 { type, title, status, detail, instance }
  | 'json-api'        // { errors: [{ status, title, detail, source }] }
  | 'graphql'         // { errors: [{ message, locations, path, extensions }] }
  | 'simple'          // { error: string } or { message: string }
  | 'custom';         // Custom error format

/** Types of error format patterns detected */
export type ErrorFormatPatternType =
  | 'error-object'        // Structured error object
  | 'error-array'         // Array of errors
  | 'error-class'         // Error class definition
  | 'error-throw'         // throw new Error patterns
  | 'error-response'      // Error response in API handler
  | 'error-catch';        // Error handling in catch block

/** Types of error format violations detected */
export type ErrorFormatViolationType =
  | 'inconsistent-format'     // Inconsistent error format
  | 'missing-message'         // Missing error message
  | 'missing-code'            // Missing error code
  | 'raw-error-string'        // Raw string instead of object
  | 'mixed-formats'           // Mixing different error formats
  | 'inconsistent-codes'      // Inconsistent error code naming
  | 'missing-status'          // Missing HTTP status code
  | 'generic-error';          // Generic Error instead of custom


/** Information about a detected error format pattern */
export interface ErrorFormatPatternInfo {
  type: ErrorFormatPatternType;
  format: ErrorFormat;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  fields?: string[] | undefined;
  errorCode?: string | undefined;
  errorClass?: string | undefined;
  context?: string | undefined;
}

/** Information about a detected error format violation */
export interface ErrorFormatViolationInfo {
  type: ErrorFormatViolationType;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  value: string;
  issue: string;
  suggestedFix?: string | undefined;
  lineContent: string;
}

/** Analysis of error format patterns in a file */
export interface ErrorFormatAnalysis {
  errorPatterns: ErrorFormatPatternInfo[];
  violations: ErrorFormatViolationInfo[];
  dominantFormat: ErrorFormat | null;
  usesConsistentFormat: boolean;
  errorCodes: string[];
  errorClasses: string[];
  patternAdherenceConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Standard error fields */
export const STANDARD_ERROR_FIELDS = {
  message: ['message', 'msg', 'errorMessage', 'description'],
  code: ['code', 'errorCode', 'error_code', 'statusCode', 'status_code'],
  details: ['details', 'detail', 'data', 'metadata', 'context', 'info'],
  stack: ['stack', 'stackTrace', 'trace'],
} as const;

/** RFC 7807 Problem Details fields */
export const PROBLEM_DETAILS_FIELDS = ['type', 'title', 'status', 'detail', 'instance'] as const;

/** JSON:API error fields */
export const JSON_API_ERROR_FIELDS = ['status', 'title', 'detail', 'source', 'code', 'meta', 'links'] as const;

/** GraphQL error fields */
export const GRAPHQL_ERROR_FIELDS = ['message', 'locations', 'path', 'extensions'] as const;

/** Common error code patterns */
export const ERROR_CODE_PATTERNS = {
  screaming_snake: /^[A-Z][A-Z0-9_]*$/,
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  kebab: /^[a-z][a-z0-9-]*$/,
  dotted: /^[a-z][a-z0-9.]*$/,
  prefixed: /^(ERR_|ERROR_|E_)[A-Z0-9_]+$/,
} as const;

/** Common error class names */
export const ERROR_CLASS_PATTERNS = [
  /class\s+(\w*Error)\s+extends\s+(?:Error|AppError|BaseError|HttpError|CustomError)/g,
  /class\s+(\w*Exception)\s+extends/g,
] as const;

/** Error response patterns */
export const ERROR_RESPONSE_PATTERNS = [
  /\{\s*error\s*:\s*\{([^}]+)\}\s*\}/gi,
  /\{\s*errors\s*:\s*\[([^\]]+)\]\s*\}/gi,
  /\{\s*error\s*:\s*["'`]([^"'`]+)["'`]\s*\}/gi,
  /\{\s*message\s*:\s*["'`]([^"'`]+)["'`]\s*,?\s*(?:code|status)/gi,
] as const;

/** Error throw patterns */
export const ERROR_THROW_PATTERNS = [
  /throw\s+new\s+(\w+Error)\s*\(/gi,
  /throw\s+new\s+Error\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gi,
  /throw\s+(\w+)\s*;/gi,
  /throw\s+\{([^}]+)\}/gi,
] as const;

/** Error catch patterns */
export const ERROR_CATCH_PATTERNS = [
  /catch\s*\(\s*(\w+)(?:\s*:\s*\w+)?\s*\)\s*\{/gi,
  /\.catch\s*\(\s*(?:\(\s*)?(\w+)(?:\s*:\s*\w+)?(?:\s*\))?\s*=>/gi,
] as const;

/** File patterns to exclude */
export const EXCLUDED_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
  /\.d\.ts$/,
  /node_modules\//,
  /\.mock\.[jt]sx?$/,
];


// ============================================================================
// Helper Functions
// ============================================================================

/** Check if a file should be excluded from detection */
export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/** Check if position is inside a comment */
function isInsideComment(content: string, index: number): boolean {
  const beforeIndex = content.slice(0, index);
  const lastNewline = beforeIndex.lastIndexOf('\n');
  const currentLine = beforeIndex.slice(lastNewline + 1);
  if (currentLine.includes('//')) {
    const commentStart = currentLine.indexOf('//');
    const positionInLine = index - lastNewline - 1;
    if (positionInLine > commentStart) {return true;}
  }
  const lastBlockCommentStart = beforeIndex.lastIndexOf('/*');
  const lastBlockCommentEnd = beforeIndex.lastIndexOf('*/');
  if (lastBlockCommentStart > lastBlockCommentEnd) {return true;}
  return false;
}

/** Get line and column from index */
function getPositionFromIndex(content: string, index: number): { line: number; column: number } {
  const beforeMatch = content.slice(0, index);
  const lineNumber = beforeMatch.split('\n').length;
  const lastNewline = beforeMatch.lastIndexOf('\n');
  const column = index - lastNewline;
  return { line: lineNumber, column };
}

/** Extract field names from an object literal string */
export function extractFieldNames(objectContent: string): string[] {
  const fields: string[] = [];
  const fieldPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g;
  let match;
  while ((match = fieldPattern.exec(objectContent)) !== null) {
    if (match[1]) {fields.push(match[1]);}
  }
  return fields;
}

/** Detect the error format from fields */
export function detectErrorFormat(fields: string[]): ErrorFormat {
  const lowerFields = fields.map(f => f.toLowerCase());
  
  // Check for Problem Details (RFC 7807)
  const problemDetailsMatches = PROBLEM_DETAILS_FIELDS.filter(f => lowerFields.includes(f.toLowerCase()));
  if (problemDetailsMatches.length >= 3) {return 'problem-details';}
  
  // Check for JSON:API error format
  const jsonApiMatches = JSON_API_ERROR_FIELDS.filter(f => lowerFields.includes(f.toLowerCase()));
  if (jsonApiMatches.length >= 3 && (lowerFields.includes('source') || lowerFields.includes('meta'))) {
    return 'json-api';
  }
  
  // Check for GraphQL error format
  const graphqlMatches = GRAPHQL_ERROR_FIELDS.filter(f => lowerFields.includes(f.toLowerCase()));
  if (graphqlMatches.length >= 2 && (lowerFields.includes('locations') || lowerFields.includes('path'))) {
    return 'graphql';
  }
  
  // Check for standard error format
  const hasMessage = STANDARD_ERROR_FIELDS.message.some(f => lowerFields.includes(f.toLowerCase()));
  const hasCode = STANDARD_ERROR_FIELDS.code.some(f => lowerFields.includes(f.toLowerCase()));
  const hasDetails = STANDARD_ERROR_FIELDS.details.some(f => lowerFields.includes(f.toLowerCase()));
  
  if ((hasMessage && hasCode) || (hasMessage && hasDetails) || (hasCode && hasDetails)) {
    return 'standard';
  }
  
  // Simple format (just message or error string)
  if (hasMessage && fields.length <= 2) {return 'simple';}
  
  // Custom format
  if (fields.length >= 2) {return 'custom';}
  
  return 'simple';
}

/** Detect error code naming convention */
export function detectErrorCodeConvention(code: string): string | null {
  for (const [convention, pattern] of Object.entries(ERROR_CODE_PATTERNS)) {
    if (pattern.test(code)) {return convention;}
  }
  return null;
}

/** Check if a string looks like an error code */
export function isErrorCode(value: string): boolean {
  if (value.length < 3 || value.length > 50) {return false;}
  return Object.values(ERROR_CODE_PATTERNS).some(pattern => pattern.test(value));
}


// ============================================================================
// Detection Functions
// ============================================================================

/** Detect error object patterns */
export function detectErrorObjects(content: string, file: string): ErrorFormatPatternInfo[] {
  const results: ErrorFormatPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ERROR_RESPONSE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      const objectContent = match[1] || match[0];
      const fields = extractFieldNames(objectContent);
      const format = detectErrorFormat(fields);
      
      // Extract error code if present
      const codeMatch = objectContent.match(/code\s*:\s*["'`]([^"'`]+)["'`]/i);
      const errorCode = codeMatch?.[1];
      
      results.push({
        type: match[0].includes('errors') ? 'error-array' : 'error-object',
        format,
        file,
        line,
        column,
        matchedText: match[0],
        fields,
        errorCode,
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect error class definitions */
export function detectErrorClasses(content: string, file: string): ErrorFormatPatternInfo[] {
  const results: ErrorFormatPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ERROR_CLASS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      const className = match[1];
      
      // Find class body to extract fields
      const classStart = match.index;
      let braceCount = 0;
      let classEnd = classStart;
      let foundBrace = false;
      
      for (let i = classStart; i < content.length && i < classStart + 2000; i++) {
        if (content[i] === '{') { braceCount++; foundBrace = true; }
        if (content[i] === '}') {
          braceCount--;
          if (foundBrace && braceCount === 0) { classEnd = i + 1; break; }
        }
      }
      
      const classBody = content.slice(classStart, classEnd);
      const fields = extractFieldNames(classBody);
      
      results.push({
        type: 'error-class',
        format: 'standard',
        file,
        line,
        column,
        matchedText: match[0],
        fields,
        errorClass: className,
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect error throw patterns */
export function detectErrorThrows(content: string, file: string): ErrorFormatPatternInfo[] {
  const results: ErrorFormatPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ERROR_THROW_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      const errorClass = match[1];
      const isGenericError = errorClass === 'Error' || match[0].includes('new Error(');
      
      results.push({
        type: 'error-throw',
        format: isGenericError ? 'simple' : 'standard',
        file,
        line,
        column,
        matchedText: match[0],
        errorClass: isGenericError ? 'Error' : errorClass,
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect error response patterns in API handlers */
export function detectErrorResponses(content: string, file: string): ErrorFormatPatternInfo[] {
  const results: ErrorFormatPatternInfo[] = [];
  const lines = content.split('\n');
  
  // Patterns for error responses in API handlers
  const apiErrorPatterns = [
    /res\.status\s*\(\s*[45]\d{2}\s*\)\s*\.json\s*\(\s*\{([^}]+)\}/gi,
    /Response\.json\s*\(\s*\{([^}]+)\}\s*,\s*\{\s*status\s*:\s*[45]\d{2}/gi,
    /NextResponse\.json\s*\(\s*\{([^}]+)\}\s*,\s*\{\s*status\s*:\s*[45]\d{2}/gi,
    /return\s+new\s+Response\s*\([^,]+,\s*\{\s*status\s*:\s*[45]\d{2}/gi,
  ];
  
  for (const pattern of apiErrorPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      const objectContent = match[1] || match[0];
      const fields = extractFieldNames(objectContent);
      const format = detectErrorFormat(fields);
      const codeMatch = objectContent.match(/code\s*:\s*["'`]([^"'`]+)["'`]/i);
      
      results.push({
        type: 'error-response',
        format,
        file,
        line,
        column,
        matchedText: match[0],
        fields,
        errorCode: codeMatch?.[1],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}


// ============================================================================
// Violation Detection Functions
// ============================================================================

/** Detect inconsistent error format violations */
export function detectInconsistentFormatViolations(
  patterns: ErrorFormatPatternInfo[],
  file: string
): ErrorFormatViolationInfo[] {
  const violations: ErrorFormatViolationInfo[] = [];
  const formatCounts: Record<ErrorFormat, number> = {
    'standard': 0, 'problem-details': 0, 'json-api': 0,
    'graphql': 0, 'simple': 0, 'custom': 0,
  };
  
  for (const pattern of patterns) {
    formatCounts[pattern.format]++;
  }
  
  // Find dominant format (excluding simple)
  let dominantFormat: ErrorFormat | null = null;
  let maxCount = 0;
  for (const [format, count] of Object.entries(formatCounts)) {
    if (format !== 'simple' && count > maxCount) {
      maxCount = count;
      dominantFormat = format as ErrorFormat;
    }
  }
  
  // Flag patterns that don't match dominant format
  if (dominantFormat && maxCount >= 2) {
    for (const pattern of patterns) {
      if (pattern.format !== dominantFormat && pattern.format !== 'simple') {
        violations.push({
          type: 'mixed-formats',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: pattern.format,
          issue: `Error uses ${pattern.format} format but project predominantly uses ${dominantFormat}`,
          suggestedFix: `Convert to ${dominantFormat} format for consistency`,
          lineContent: pattern.context || '',
        });
      }
    }
  }
  return violations;
}

/** Detect missing required field violations */
export function detectMissingFieldViolations(
  patterns: ErrorFormatPatternInfo[],
  file: string
): ErrorFormatViolationInfo[] {
  const violations: ErrorFormatViolationInfo[] = [];
  
  for (const pattern of patterns) {
    if (pattern.type !== 'error-object' && pattern.type !== 'error-response') {continue;}
    const fields = pattern.fields || [];
    const lowerFields = fields.map(f => f.toLowerCase());
    
    // Check for missing message
    const hasMessage = STANDARD_ERROR_FIELDS.message.some(f => lowerFields.includes(f.toLowerCase()));
    if (!hasMessage && pattern.format !== 'simple') {
      violations.push({
        type: 'missing-message',
        file,
        line: pattern.line,
        column: pattern.column,
        endLine: pattern.line,
        endColumn: pattern.column + pattern.matchedText.length,
        value: pattern.matchedText,
        issue: 'Error object is missing a message field',
        suggestedFix: 'Add a "message" field to describe the error',
        lineContent: pattern.context || '',
      });
    }
    
    // Check for missing code in standard format
    if (pattern.format === 'standard') {
      const hasCode = STANDARD_ERROR_FIELDS.code.some(f => lowerFields.includes(f.toLowerCase()));
      if (!hasCode) {
        violations.push({
          type: 'missing-code',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: pattern.matchedText,
          issue: 'Error object is missing a code field for categorization',
          suggestedFix: 'Add a "code" field (e.g., "VALIDATION_ERROR")',
          lineContent: pattern.context || '',
        });
      }
    }
  }
  return violations;
}

/** Detect raw error string violations */
export function detectRawErrorStringViolations(
  content: string,
  file: string
): ErrorFormatViolationInfo[] {
  const violations: ErrorFormatViolationInfo[] = [];
  const lines = content.split('\n');
  
  // Patterns for raw error strings
  const rawErrorPatterns = [
    /res\.status\s*\(\s*[45]\d{2}\s*\)\s*\.send\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gi,
    /res\.status\s*\(\s*[45]\d{2}\s*\)\s*\.json\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gi,
    /Response\.json\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{\s*status\s*:\s*[45]\d{2}/gi,
  ];
  
  for (const pattern of rawErrorPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      violations.push({
        type: 'raw-error-string',
        file,
        line,
        column,
        endLine: line,
        endColumn: column + match[0].length,
        value: match[0],
        issue: 'Raw error string instead of structured error object',
        suggestedFix: 'Use structured error: { error: { message: "...", code: "..." } }',
        lineContent: lines[line - 1] || '',
      });
    }
  }
  return violations;
}

/** Detect generic Error usage violations */
export function detectGenericErrorViolations(
  patterns: ErrorFormatPatternInfo[],
  file: string
): ErrorFormatViolationInfo[] {
  const violations: ErrorFormatViolationInfo[] = [];
  
  // Check if file has custom error classes
  const hasCustomErrors = patterns.some(p => 
    p.type === 'error-class' || 
    (p.type === 'error-throw' && p.errorClass !== 'Error')
  );
  
  if (hasCustomErrors) {
    for (const pattern of patterns) {
      if (pattern.type === 'error-throw' && pattern.errorClass === 'Error') {
        violations.push({
          type: 'generic-error',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: pattern.matchedText,
          issue: 'Using generic Error instead of custom error class',
          suggestedFix: 'Use a custom error class (e.g., AppError, ValidationError)',
          lineContent: pattern.context || '',
        });
      }
    }
  }
  return violations;
}

/** Detect inconsistent error code naming violations */
export function detectInconsistentCodeViolations(
  patterns: ErrorFormatPatternInfo[],
  file: string
): ErrorFormatViolationInfo[] {
  const violations: ErrorFormatViolationInfo[] = [];
  const codeConventions: Record<string, number> = {};
  const codesWithConventions: Array<{ pattern: ErrorFormatPatternInfo; convention: string }> = [];
  
  // Collect error codes and their conventions
  for (const pattern of patterns) {
    if (pattern.errorCode) {
      const convention = detectErrorCodeConvention(pattern.errorCode);
      if (convention) {
        codeConventions[convention] = (codeConventions[convention] || 0) + 1;
        codesWithConventions.push({ pattern, convention });
      }
    }
  }
  
  // Find dominant convention
  let dominantConvention: string | null = null;
  let maxCount = 0;
  for (const [convention, count] of Object.entries(codeConventions)) {
    if (count > maxCount) {
      maxCount = count;
      dominantConvention = convention;
    }
  }
  
  // Flag codes that don't match dominant convention
  if (dominantConvention && maxCount >= 2) {
    for (const { pattern, convention } of codesWithConventions) {
      if (convention !== dominantConvention) {
        violations.push({
          type: 'inconsistent-codes',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: pattern.errorCode || '',
          issue: `Error code uses ${convention} but project uses ${dominantConvention}`,
          suggestedFix: `Convert to ${dominantConvention} convention`,
          lineContent: pattern.context || '',
        });
      }
    }
  }
  return violations;
}


// ============================================================================
// Main Analysis Function
// ============================================================================

/** Analyze error format patterns in file content */
export function analyzeErrorFormat(content: string, file: string): ErrorFormatAnalysis {
  if (shouldExcludeFile(file)) {
    return {
      errorPatterns: [],
      violations: [],
      dominantFormat: null,
      usesConsistentFormat: true,
      errorCodes: [],
      errorClasses: [],
      patternAdherenceConfidence: 1.0,
    };
  }
  
  // Detect all patterns
  const errorObjects = detectErrorObjects(content, file);
  const errorClasses = detectErrorClasses(content, file);
  const errorThrows = detectErrorThrows(content, file);
  const errorResponses = detectErrorResponses(content, file);
  
  const allPatterns = [...errorObjects, ...errorClasses, ...errorThrows, ...errorResponses];
  
  // Detect violations
  const formatViolations = detectInconsistentFormatViolations(allPatterns, file);
  const fieldViolations = detectMissingFieldViolations(allPatterns, file);
  const rawStringViolations = detectRawErrorStringViolations(content, file);
  const genericErrorViolations = detectGenericErrorViolations(allPatterns, file);
  const codeViolations = detectInconsistentCodeViolations(allPatterns, file);
  
  const allViolations = [
    ...formatViolations,
    ...fieldViolations,
    ...rawStringViolations,
    ...genericErrorViolations,
    ...codeViolations,
  ];
  
  // Determine dominant format
  const formatCounts: Record<ErrorFormat, number> = {
    'standard': 0, 'problem-details': 0, 'json-api': 0,
    'graphql': 0, 'simple': 0, 'custom': 0,
  };
  for (const pattern of allPatterns) {
    formatCounts[pattern.format]++;
  }
  
  let dominantFormat: ErrorFormat | null = null;
  let maxCount = 0;
  for (const [format, count] of Object.entries(formatCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantFormat = format as ErrorFormat;
    }
  }
  
  // Collect error codes and classes
  const errorCodeSet = new Set<string>();
  const errorClassSet = new Set<string>();
  for (const pattern of allPatterns) {
    if (pattern.errorCode) {errorCodeSet.add(pattern.errorCode);}
    if (pattern.errorClass) {errorClassSet.add(pattern.errorClass);}
  }
  
  // Calculate confidence
  const totalPatterns = allPatterns.length;
  const violationCount = allViolations.length;
  const confidence = totalPatterns > 0 
    ? Math.max(0, 1 - (violationCount / totalPatterns) * 0.2)
    : 1.0;
  
  // Check consistency
  const nonSimpleFormats = Object.entries(formatCounts)
    .filter(([format, count]) => format !== 'simple' && count > 0);
  const usesConsistentFormat = nonSimpleFormats.length <= 1;
  
  return {
    errorPatterns: allPatterns,
    violations: allViolations,
    dominantFormat,
    usesConsistentFormat,
    errorCodes: Array.from(errorCodeSet),
    errorClasses: Array.from(errorClassSet),
    patternAdherenceConfidence: confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

/** Error Format Detector - Detects error response format patterns */
export class ErrorFormatDetector extends RegexDetector {
  readonly id = 'api/error-format';
  readonly name = 'Error Format Detector';
  readonly description = 'Detects error response format patterns and consistency';
  readonly category = 'api';
  readonly subcategory = 'errors';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (shouldExcludeFile(file)) {
      return this.createEmptyResult();
    }
    
    const analysis = analyzeErrorFormat(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.patternAdherenceConfidence, {
      custom: {
        errorPatterns: analysis.errorPatterns,
        dominantFormat: analysis.dominantFormat,
        usesConsistentFormat: analysis.usesConsistentFormat,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

/** Create a new ErrorFormatDetector instance */
export function createErrorFormatDetector(): ErrorFormatDetector {
  return new ErrorFormatDetector();
}