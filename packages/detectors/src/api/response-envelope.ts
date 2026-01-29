/**
 * Response Envelope Detector - Response format pattern detection
 *
 * Detects response envelope patterns including:
 * - Standard response envelope patterns ({ data, error, meta, success, message })
 * - JSON:API format ({ data, errors, meta, links, included })
 * - HAL format ({ _links, _embedded })
 * - Pagination metadata ({ page, limit, total, hasMore, nextCursor })
 * - Success/error response structures
 * - Response.json() usage in Next.js
 * - Express res.json() / res.send() patterns
 *
 * Flags violations:
 * - Inconsistent response envelope structure across endpoints
 * - Missing standard fields (data, error, success)
 * - Mixing different response formats (JSON:API vs custom)
 * - Raw data responses without envelope
 * - Inconsistent pagination format
 *
 * @requirements 10.3 - THE API_Detector SHALL detect response envelope patterns ({ data, error, meta })
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of response envelope formats detected
 */
export type ResponseEnvelopeFormat =
  | 'standard'      // { data, error, meta, success }
  | 'json-api'      // { data, errors, meta, links, included }
  | 'hal'           // { _links, _embedded }
  | 'graphql'       // { data, errors }
  | 'custom'        // Custom envelope format
  | 'direct';       // Direct data return (no envelope)

/**
 * Types of response envelope patterns detected
 */
export type ResponseEnvelopePatternType =
  | 'envelope-structure'     // Response envelope structure
  | 'pagination-metadata'    // Pagination in response
  | 'error-response'         // Error response format
  | 'success-indicator'      // Success/status indicator
  | 'nextjs-response'        // Next.js Response.json()
  | 'express-response';      // Express res.json()/res.send()

/**
 * Types of response envelope violations detected
 */
export type ResponseEnvelopeViolationType =
  | 'inconsistent-envelope'      // Inconsistent envelope structure
  | 'missing-data-field'         // Missing data field in envelope
  | 'missing-error-field'        // Missing error field in envelope
  | 'missing-success-indicator'  // Missing success/status indicator
  | 'mixed-formats'              // Mixing different response formats
  | 'raw-data-response'          // Raw data without envelope
  | 'inconsistent-pagination'    // Inconsistent pagination format
  | 'missing-pagination';        // Missing pagination for list endpoints

/**
 * Pagination format types
 */
export type PaginationFormat =
  | 'offset'        // { page, limit, total, offset }
  | 'cursor'        // { cursor, nextCursor, hasMore }
  | 'page-based'    // { page, pageSize, totalPages }
  | 'link-based'    // { next, prev, first, last }
  | 'mixed';        // Mixed pagination format

/**
 * Information about a detected response envelope pattern
 */
export interface ResponseEnvelopePatternInfo {
  /** Type of pattern */
  type: ResponseEnvelopePatternType;
  /** Detected envelope format */
  format: ResponseEnvelopeFormat;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Fields detected in the envelope */
  fields?: string[] | undefined;
  /** Pagination format (if detected) */
  paginationFormat?: PaginationFormat | undefined;
  /** Additional context */
  context?: string | undefined;
}

/**
 * Information about a detected response envelope violation
 */
export interface ResponseEnvelopeViolationInfo {
  /** Type of violation */
  type: ResponseEnvelopeViolationType;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** End line number (1-indexed) */
  endLine: number;
  /** End column number (1-indexed) */
  endColumn: number;
  /** The problematic value */
  value: string;
  /** Issue description */
  issue: string;
  /** Suggested fix */
  suggestedFix?: string | undefined;
  /** The full line content */
  lineContent: string;
}

/**
 * Analysis of response envelope patterns in a file
 */
export interface ResponseEnvelopeAnalysis {
  /** Response envelope patterns found */
  envelopePatterns: ResponseEnvelopePatternInfo[];
  /** Violations detected */
  violations: ResponseEnvelopeViolationInfo[];
  /** Dominant envelope format in the file */
  dominantFormat: ResponseEnvelopeFormat | null;
  /** Pagination format used */
  paginationFormat: PaginationFormat | null;
  /** Whether file uses consistent envelope structure */
  usesConsistentEnvelope: boolean;
  /** Pattern adherence confidence */
  patternAdherenceConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Standard envelope fields
 */
export const STANDARD_ENVELOPE_FIELDS = {
  data: ['data', 'result', 'results', 'payload', 'body'],
  error: ['error', 'errors', 'err', 'errorMessage', 'message'],
  meta: ['meta', 'metadata', '_meta', 'info'],
  success: ['success', 'ok', 'status', 'isSuccess', 'succeeded'],
  message: ['message', 'msg', 'statusMessage', 'description'],
} as const;

/**
 * JSON:API envelope fields
 */
export const JSON_API_FIELDS = ['data', 'errors', 'meta', 'links', 'included', 'jsonapi'] as const;

/**
 * HAL format fields
 */
export const HAL_FIELDS = ['_links', '_embedded'] as const;

/**
 * GraphQL response fields
 */
export const GRAPHQL_FIELDS = ['data', 'errors', 'extensions'] as const;

/**
 * Pagination fields by format
 * Note: Fields are organized to avoid overlap where possible
 * - offset: uses limit/offset terminology
 * - pageBased: uses pageSize/totalPages terminology
 * - cursor: uses cursor/hasMore terminology
 * - linkBased: uses next/prev/first/last links
 */
export const PAGINATION_FIELDS = {
  offset: ['limit', 'offset', 'total', 'totalCount', 'count'],
  cursor: ['cursor', 'nextCursor', 'prevCursor', 'hasMore', 'hasNext', 'hasPrev', 'endCursor', 'startCursor'],
  pageBased: ['pageSize', 'totalPages', 'currentPage', 'perPage'],
  linkBased: ['next', 'prev', 'first', 'last', 'self'],
  // Common fields that can appear in multiple formats
  common: ['page'],
} as const;

/**
 * Response patterns for Next.js
 */
export const NEXTJS_RESPONSE_PATTERNS = [
  // Response.json({ data, error })
  /Response\.json\s*\(\s*\{([^}]+)\}/gi,
  // NextResponse.json({ data, error })
  /NextResponse\.json\s*\(\s*\{([^}]+)\}/gi,
  // return new Response(JSON.stringify({ data }))
  /new\s+Response\s*\(\s*JSON\.stringify\s*\(\s*\{([^}]+)\}/gi,
] as const;

/**
 * Response patterns for Express
 */
export const EXPRESS_RESPONSE_PATTERNS = [
  // res.json({ data, error })
  /res\.json\s*\(\s*\{([^}]+)\}/gi,
  // res.send({ data, error })
  /res\.send\s*\(\s*\{([^}]+)\}/gi,
  // res.status(200).json({ data })
  /res\.status\s*\([^)]+\)\s*\.json\s*\(\s*\{([^}]+)\}/gi,
  // res.status(200).send({ data })
  /res\.status\s*\([^)]+\)\s*\.send\s*\(\s*\{([^}]+)\}/gi,
] as const;

/**
 * Generic response object patterns
 */
export const RESPONSE_OBJECT_PATTERNS = [
  // return { data, error, success }
  /return\s+\{([^}]+)\}/gi,
  // const response = { data, error }
  /(?:const|let|var)\s+(?:response|result|res)\s*=\s*\{([^}]+)\}/gi,
  // { data: ..., error: ..., meta: ... }
  /\{\s*(?:data|error|success|meta|message)\s*:/gi,
] as const;

/**
 * Error response patterns
 */
export const ERROR_RESPONSE_PATTERNS = [
  // { error: { message, code } }
  /\{\s*error\s*:\s*\{([^}]+)\}\s*\}/gi,
  // { errors: [...] }
  /\{\s*errors\s*:\s*\[/gi,
  // { success: false, error: ... }
  /\{\s*success\s*:\s*false\s*,\s*error/gi,
  // { ok: false, message: ... }
  /\{\s*ok\s*:\s*false\s*,\s*message/gi,
] as const;

/**
 * File patterns to exclude from detection
 */
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

/**
 * Check if a file should be excluded from detection
 */
export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if position is inside a comment
 */
function isInsideComment(content: string, index: number): boolean {
  const beforeIndex = content.slice(0, index);
  
  // Check for single-line comment
  const lastNewline = beforeIndex.lastIndexOf('\n');
  const currentLine = beforeIndex.slice(lastNewline + 1);
  if (currentLine.includes('//')) {
    const commentStart = currentLine.indexOf('//');
    const positionInLine = index - lastNewline - 1;
    if (positionInLine > commentStart) {
      return true;
    }
  }
  
  // Check for multi-line comment
  const lastBlockCommentStart = beforeIndex.lastIndexOf('/*');
  const lastBlockCommentEnd = beforeIndex.lastIndexOf('*/');
  if (lastBlockCommentStart > lastBlockCommentEnd) {
    return true;
  }
  
  return false;
}

/**
 * Get line and column from index
 */
function getPositionFromIndex(
  content: string,
  index: number
): { line: number; column: number } {
  const beforeMatch = content.slice(0, index);
  const lineNumber = beforeMatch.split('\n').length;
  const lastNewline = beforeMatch.lastIndexOf('\n');
  const column = index - lastNewline;
  return { line: lineNumber, column };
}

/**
 * Extract field names from an object literal string
 */
export function extractFieldNames(objectContent: string): string[] {
  const fields: string[] = [];
  // Match field names in object literal: { field1: ..., field2: ... }
  const fieldPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g;
  let match;
  while ((match = fieldPattern.exec(objectContent)) !== null) {
    if (match[1]) {
      fields.push(match[1]);
    }
  }
  return fields;
}

/**
 * Detect the envelope format from fields
 */
export function detectEnvelopeFormat(fields: string[]): ResponseEnvelopeFormat {
  const lowerFields = fields.map(f => f.toLowerCase());
  
  // Check for HAL format (most specific)
  if (lowerFields.includes('_links') || lowerFields.includes('_embedded')) {
    return 'hal';
  }
  
  // Check for JSON:API format
  const jsonApiMatches = JSON_API_FIELDS.filter(f => lowerFields.includes(f.toLowerCase()));
  if (jsonApiMatches.length >= 2 && lowerFields.includes('data')) {
    // JSON:API typically has 'data' plus 'links', 'included', or 'jsonapi'
    if (lowerFields.includes('links') || lowerFields.includes('included') || lowerFields.includes('jsonapi')) {
      return 'json-api';
    }
  }
  
  // Check for GraphQL format
  if (lowerFields.includes('data') && lowerFields.includes('extensions')) {
    return 'graphql';
  }
  
  // Check for standard envelope format
  const hasDataField = STANDARD_ENVELOPE_FIELDS.data.some(f => lowerFields.includes(f.toLowerCase()));
  const hasErrorField = STANDARD_ENVELOPE_FIELDS.error.some(f => lowerFields.includes(f.toLowerCase()));
  const hasSuccessField = STANDARD_ENVELOPE_FIELDS.success.some(f => lowerFields.includes(f.toLowerCase()));
  const hasMetaField = STANDARD_ENVELOPE_FIELDS.meta.some(f => lowerFields.includes(f.toLowerCase()));
  
  if (hasDataField || hasErrorField || hasSuccessField || hasMetaField) {
    return 'standard';
  }
  
  // Check if it looks like a custom envelope (has some structure)
  if (fields.length >= 2) {
    return 'custom';
  }
  
  return 'direct';
}

/**
 * Detect pagination format from fields
 */
export function detectPaginationFormat(fields: string[]): PaginationFormat | null {
  const lowerFields = fields.map(f => f.toLowerCase());
  
  let offsetMatches = 0;
  let cursorMatches = 0;
  let pageBasedMatches = 0;
  let linkBasedMatches = 0;
  let hasCommonPageField = false;
  
  for (const field of lowerFields) {
    // Check common fields
    if (PAGINATION_FIELDS.common.some(f => f.toLowerCase() === field)) {
      hasCommonPageField = true;
    }
    // Check specific format fields
    if (PAGINATION_FIELDS.offset.some(f => f.toLowerCase() === field)) {offsetMatches++;}
    if (PAGINATION_FIELDS.cursor.some(f => f.toLowerCase() === field)) {cursorMatches++;}
    if (PAGINATION_FIELDS.pageBased.some(f => f.toLowerCase() === field)) {pageBasedMatches++;}
    if (PAGINATION_FIELDS.linkBased.some(f => f.toLowerCase() === field)) {linkBasedMatches++;}
  }
  
  // Add common field to the most likely format
  if (hasCommonPageField) {
    // If we have limit/offset fields, it's offset pagination
    if (offsetMatches > 0) {
      offsetMatches++;
    }
    // If we have pageSize/totalPages, it's page-based
    else if (pageBasedMatches > 0) {
      pageBasedMatches++;
    }
    // Default to offset if only 'page' is present with total/count
    else if (lowerFields.includes('total') || lowerFields.includes('count') || lowerFields.includes('limit')) {
      offsetMatches++;
    }
    // Otherwise treat as page-based
    else {
      pageBasedMatches++;
    }
  }
  
  // Determine dominant format
  const maxMatches = Math.max(offsetMatches, cursorMatches, pageBasedMatches, linkBasedMatches);
  
  if (maxMatches === 0) {
    return null;
  }
  
  // Check for mixed formats (multiple distinct format types with significant matches)
  const significantFormats = [
    offsetMatches > 0 ? 1 : 0,
    cursorMatches > 0 ? 1 : 0,
    pageBasedMatches > 0 ? 1 : 0,
    linkBasedMatches > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  
  if (significantFormats > 1 && cursorMatches > 0) {
    // Mixing cursor with other formats is definitely mixed
    return 'mixed';
  }
  
  if (cursorMatches === maxMatches) {return 'cursor';}
  if (linkBasedMatches === maxMatches) {return 'link-based';}
  if (pageBasedMatches === maxMatches && pageBasedMatches > offsetMatches) {return 'page-based';}
  if (offsetMatches > 0) {return 'offset';}
  if (pageBasedMatches > 0) {return 'page-based';}
  
  return null;
}

/**
 * Check if fields indicate a list/collection response
 */
export function isListResponse(fields: string[], content: string): boolean {
  const lowerFields = fields.map(f => f.toLowerCase());
  
  // Check for array indicators
  if (lowerFields.includes('items') || lowerFields.includes('results') || lowerFields.includes('list')) {
    return true;
  }
  
  // Check for pagination fields (any format)
  const allPaginationFields = [
    ...PAGINATION_FIELDS.offset,
    ...PAGINATION_FIELDS.cursor,
    ...PAGINATION_FIELDS.pageBased,
    ...PAGINATION_FIELDS.common,
  ];
  
  const hasPagination = allPaginationFields.some(f => lowerFields.includes(f.toLowerCase()));
  
  if (hasPagination) {
    return true;
  }
  
  // Check for array in data field
  if (content.includes('data: [') || content.includes('data:[]') || content.includes('results: [')) {
    return true;
  }
  
  return false;
}

/**
 * Detect Next.js response patterns
 */
export function detectNextjsResponses(
  content: string,
  file: string
): ResponseEnvelopePatternInfo[] {
  const results: ResponseEnvelopePatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of NEXTJS_RESPONSE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      
      const { line, column } = getPositionFromIndex(content, match.index);
      const objectContent = match[1] || '';
      const fields = extractFieldNames(objectContent);
      const format = detectEnvelopeFormat(fields);
      const paginationFormat = detectPaginationFormat(fields);
      
      results.push({
        type: 'nextjs-response',
        format,
        file,
        line,
        column,
        matchedText: match[0],
        fields,
        paginationFormat: paginationFormat || undefined,
        context: lines[line - 1] || '',
      });
    }
  }
  
  return results;
}

/**
 * Detect Express response patterns
 */
export function detectExpressResponses(
  content: string,
  file: string
): ResponseEnvelopePatternInfo[] {
  const results: ResponseEnvelopePatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of EXPRESS_RESPONSE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      
      const { line, column } = getPositionFromIndex(content, match.index);
      const objectContent = match[1] || '';
      const fields = extractFieldNames(objectContent);
      const format = detectEnvelopeFormat(fields);
      const paginationFormat = detectPaginationFormat(fields);
      
      results.push({
        type: 'express-response',
        format,
        file,
        line,
        column,
        matchedText: match[0],
        fields,
        paginationFormat: paginationFormat || undefined,
        context: lines[line - 1] || '',
      });
    }
  }
  
  return results;
}

/**
 * Detect generic response object patterns
 */
export function detectResponseObjects(
  content: string,
  file: string
): ResponseEnvelopePatternInfo[] {
  const results: ResponseEnvelopePatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of RESPONSE_OBJECT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      
      const { line, column } = getPositionFromIndex(content, match.index);
      const objectContent = match[1] || match[0];
      const fields = extractFieldNames(objectContent);
      
      // Skip if no relevant fields found
      if (fields.length === 0) {
        continue;
      }
      
      const format = detectEnvelopeFormat(fields);
      
      // Skip direct format unless it has some envelope-like structure
      if (format === 'direct' && fields.length < 2) {
        continue;
      }
      
      const paginationFormat = detectPaginationFormat(fields);
      
      results.push({
        type: 'envelope-structure',
        format,
        file,
        line,
        column,
        matchedText: match[0],
        fields,
        paginationFormat: paginationFormat || undefined,
        context: lines[line - 1] || '',
      });
    }
  }
  
  return results;
}

/**
 * Detect error response patterns
 */
export function detectErrorResponses(
  content: string,
  file: string
): ResponseEnvelopePatternInfo[] {
  const results: ResponseEnvelopePatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ERROR_RESPONSE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      
      const { line, column } = getPositionFromIndex(content, match.index);
      const objectContent = match[1] || match[0];
      const fields = extractFieldNames(objectContent);
      const format = detectEnvelopeFormat(['error', ...fields]);
      
      results.push({
        type: 'error-response',
        format,
        file,
        line,
        column,
        matchedText: match[0],
        fields: ['error', ...fields],
        context: lines[line - 1] || '',
      });
    }
  }
  
  return results;
}

/**
 * Detect pagination metadata patterns
 */
export function detectPaginationPatterns(
  content: string,
  file: string
): ResponseEnvelopePatternInfo[] {
  const results: ResponseEnvelopePatternInfo[] = [];
  const lines = content.split('\n');
  
  // Pattern for pagination objects - include all pagination-related fields
  const paginationPattern = /\{\s*(?:page|limit|offset|cursor|total|hasMore|nextCursor|pageSize|totalPages|currentPage|perPage|count|totalCount)\s*:/gi;
  
  let match;
  while ((match = paginationPattern.exec(content)) !== null) {
    if (isInsideComment(content, match.index)) {
      continue;
    }
    
    // Find the full object
    const startIndex = match.index;
    let braceCount = 0;
    let endIndex = startIndex;
    
    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {braceCount++;}
      if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }
    
    const objectContent = content.slice(startIndex, endIndex);
    const fields = extractFieldNames(objectContent);
    const paginationFormat = detectPaginationFormat(fields);
    
    if (paginationFormat) {
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'pagination-metadata',
        format: 'standard',
        file,
        line,
        column,
        matchedText: objectContent.slice(0, 100), // Truncate for readability
        fields,
        paginationFormat,
        context: lines[line - 1] || '',
      });
    }
  }
  
  return results;
}

// ============================================================================
// Violation Detection Functions
// ============================================================================

/**
 * Detect inconsistent envelope structure violations
 */
export function detectInconsistentEnvelopeViolations(
  patterns: ResponseEnvelopePatternInfo[],
  file: string
): ResponseEnvelopeViolationInfo[] {
  const violations: ResponseEnvelopeViolationInfo[] = [];
  
  // Group patterns by format
  const formatCounts: Record<ResponseEnvelopeFormat, number> = {
    'standard': 0,
    'json-api': 0,
    'hal': 0,
    'graphql': 0,
    'custom': 0,
    'direct': 0,
  };
  
  for (const pattern of patterns) {
    formatCounts[pattern.format]++;
  }
  
  // Find dominant format (excluding direct)
  let dominantFormat: ResponseEnvelopeFormat | null = null;
  let maxCount = 0;
  for (const [format, count] of Object.entries(formatCounts)) {
    if (format !== 'direct' && count > maxCount) {
      maxCount = count;
      dominantFormat = format as ResponseEnvelopeFormat;
    }
  }
  
  // Flag patterns that don't match dominant format
  if (dominantFormat && maxCount >= 2) {
    for (const pattern of patterns) {
      if (pattern.format !== dominantFormat && pattern.format !== 'direct') {
        violations.push({
          type: 'mixed-formats',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: pattern.format,
          issue: `Response uses ${pattern.format} format but project predominantly uses ${dominantFormat}`,
          suggestedFix: `Convert to ${dominantFormat} format for consistency`,
          lineContent: pattern.context || '',
        });
      }
    }
  }
  
  return violations;
}

/**
 * Detect missing standard fields violations
 */
export function detectMissingFieldViolations(
  patterns: ResponseEnvelopePatternInfo[],
  file: string
): ResponseEnvelopeViolationInfo[] {
  const violations: ResponseEnvelopeViolationInfo[] = [];
  
  // Check standard format responses for missing fields
  const standardPatterns = patterns.filter(p => p.format === 'standard');
  
  // Determine which fields are commonly used
  const fieldUsage: Record<string, number> = {};
  for (const pattern of standardPatterns) {
    for (const field of pattern.fields || []) {
      const lowerField = field.toLowerCase();
      fieldUsage[lowerField] = (fieldUsage[lowerField] || 0) + 1;
    }
  }
  
  // Check for missing common fields
  const hasDataField = standardPatterns.some(p => 
    p.fields?.some(f => STANDARD_ENVELOPE_FIELDS.data.includes(f.toLowerCase() as typeof STANDARD_ENVELOPE_FIELDS.data[number]))
  );
  const hasErrorField = standardPatterns.some(p => 
    p.fields?.some(f => STANDARD_ENVELOPE_FIELDS.error.includes(f.toLowerCase() as typeof STANDARD_ENVELOPE_FIELDS.error[number]))
  );
  
  // If most responses have data field, flag those without
  if (hasDataField) {
    for (const pattern of standardPatterns) {
      const patternHasData = pattern.fields?.some(f => 
        STANDARD_ENVELOPE_FIELDS.data.includes(f.toLowerCase() as typeof STANDARD_ENVELOPE_FIELDS.data[number])
      );
      const patternHasError = pattern.fields?.some(f => 
        STANDARD_ENVELOPE_FIELDS.error.includes(f.toLowerCase() as typeof STANDARD_ENVELOPE_FIELDS.error[number])
      );
      
      // Skip error responses - they don't need data field
      if (patternHasError && !patternHasData) {
        continue;
      }
      
      if (!patternHasData && !patternHasError && pattern.type !== 'error-response') {
        violations.push({
          type: 'missing-data-field',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: pattern.matchedText,
          issue: 'Response envelope is missing a data field',
          suggestedFix: 'Add a "data" field to wrap the response payload',
          lineContent: pattern.context || '',
        });
      }
    }
  }
  
  // If most responses have error handling, flag those without
  if (hasErrorField && standardPatterns.length >= 3) {
    const patternsWithError = standardPatterns.filter(p => 
      p.fields?.some(f => STANDARD_ENVELOPE_FIELDS.error.includes(f.toLowerCase() as typeof STANDARD_ENVELOPE_FIELDS.error[number]))
    );
    
    // Only flag if majority have error field
    if (patternsWithError.length > standardPatterns.length / 2) {
      for (const pattern of standardPatterns) {
        const patternHasError = pattern.fields?.some(f => 
          STANDARD_ENVELOPE_FIELDS.error.includes(f.toLowerCase() as typeof STANDARD_ENVELOPE_FIELDS.error[number])
        );
        
        if (!patternHasError && pattern.type !== 'error-response') {
          violations.push({
            type: 'missing-error-field',
            file,
            line: pattern.line,
            column: pattern.column,
            endLine: pattern.line,
            endColumn: pattern.column + pattern.matchedText.length,
            value: pattern.matchedText,
            issue: 'Response envelope is missing an error field',
            suggestedFix: 'Add an "error" field for consistent error handling',
            lineContent: pattern.context || '',
          });
        }
      }
    }
  }
  
  return violations;
}

/**
 * Detect raw data response violations
 */
export function detectRawDataViolations(
  patterns: ResponseEnvelopePatternInfo[],
  content: string,
  file: string
): ResponseEnvelopeViolationInfo[] {
  const violations: ResponseEnvelopeViolationInfo[] = [];
  const lines = content.split('\n');
  
  // Check if file uses envelope pattern
  const envelopePatterns = patterns.filter(p => p.format !== 'direct');
  if (envelopePatterns.length === 0) {
    return violations; // No envelope pattern established
  }
  
  // Look for direct array returns or simple object returns
  const directReturnPatterns = [
    // return [...] - direct array return
    /return\s+\[/g,
    // res.json([...]) - direct array in response
    /res\.json\s*\(\s*\[/g,
    // Response.json([...]) - direct array in Next.js
    /Response\.json\s*\(\s*\[/g,
    // NextResponse.json([...])
    /NextResponse\.json\s*\(\s*\[/g,
  ];
  
  for (const pattern of directReturnPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      
      const { line, column } = getPositionFromIndex(content, match.index);
      
      violations.push({
        type: 'raw-data-response',
        file,
        line,
        column,
        endLine: line,
        endColumn: column + match[0].length,
        value: match[0],
        issue: 'Direct array/data return without envelope wrapper',
        suggestedFix: 'Wrap response in envelope: { data: [...], success: true }',
        lineContent: lines[line - 1] || '',
      });
    }
  }
  
  return violations;
}

/**
 * Detect inconsistent pagination violations
 */
export function detectInconsistentPaginationViolations(
  patterns: ResponseEnvelopePatternInfo[],
  file: string
): ResponseEnvelopeViolationInfo[] {
  const violations: ResponseEnvelopeViolationInfo[] = [];
  
  // Get patterns with pagination
  const paginatedPatterns = patterns.filter(p => p.paginationFormat);
  
  if (paginatedPatterns.length < 2) {
    return violations; // Not enough patterns to detect inconsistency
  }
  
  // Count pagination formats
  const formatCounts: Record<PaginationFormat, number> = {
    'offset': 0,
    'cursor': 0,
    'page-based': 0,
    'link-based': 0,
    'mixed': 0,
  };
  
  for (const pattern of paginatedPatterns) {
    if (pattern.paginationFormat) {
      formatCounts[pattern.paginationFormat]++;
    }
  }
  
  // Find dominant format
  let dominantFormat: PaginationFormat | null = null;
  let maxCount = 0;
  for (const [format, count] of Object.entries(formatCounts)) {
    if (format !== 'mixed' && count > maxCount) {
      maxCount = count;
      dominantFormat = format as PaginationFormat;
    }
  }
  
  // Flag inconsistent pagination
  if (dominantFormat && maxCount >= 2) {
    for (const pattern of paginatedPatterns) {
      if (pattern.paginationFormat && 
          pattern.paginationFormat !== dominantFormat && 
          pattern.paginationFormat !== 'mixed') {
        violations.push({
          type: 'inconsistent-pagination',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: pattern.paginationFormat,
          issue: `Pagination uses ${pattern.paginationFormat} format but project uses ${dominantFormat}`,
          suggestedFix: `Convert to ${dominantFormat} pagination format`,
          lineContent: pattern.context || '',
        });
      }
    }
  }
  
  // Flag mixed pagination within single response
  for (const pattern of paginatedPatterns) {
    if (pattern.paginationFormat === 'mixed') {
      violations.push({
        type: 'inconsistent-pagination',
        file,
        line: pattern.line,
        column: pattern.column,
        endLine: pattern.line,
        endColumn: pattern.column + pattern.matchedText.length,
        value: 'mixed',
        issue: 'Response mixes different pagination formats',
        suggestedFix: 'Use a single consistent pagination format',
        lineContent: pattern.context || '',
      });
    }
  }
  
  return violations;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze response envelope patterns in a file
 */
export function analyzeResponseEnvelope(
  content: string,
  file: string
): ResponseEnvelopeAnalysis {
  // Skip excluded files
  if (shouldExcludeFile(file)) {
    return {
      envelopePatterns: [],
      violations: [],
      dominantFormat: null,
      paginationFormat: null,
      usesConsistentEnvelope: true,
      patternAdherenceConfidence: 1.0,
    };
  }
  
  // Detect all response patterns
  const nextjsResponses = detectNextjsResponses(content, file);
  const expressResponses = detectExpressResponses(content, file);
  const responseObjects = detectResponseObjects(content, file);
  const errorResponses = detectErrorResponses(content, file);
  const paginationPatterns = detectPaginationPatterns(content, file);
  
  // Combine all patterns (deduplicate by line)
  const seenLines = new Set<number>();
  const envelopePatterns: ResponseEnvelopePatternInfo[] = [];
  
  for (const pattern of [...nextjsResponses, ...expressResponses, ...responseObjects, ...errorResponses, ...paginationPatterns]) {
    if (!seenLines.has(pattern.line)) {
      seenLines.add(pattern.line);
      envelopePatterns.push(pattern);
    }
  }
  
  // Determine dominant format
  const formatCounts: Record<ResponseEnvelopeFormat, number> = {
    'standard': 0,
    'json-api': 0,
    'hal': 0,
    'graphql': 0,
    'custom': 0,
    'direct': 0,
  };
  
  for (const pattern of envelopePatterns) {
    formatCounts[pattern.format]++;
  }
  
  let dominantFormat: ResponseEnvelopeFormat | null = null;
  let maxCount = 0;
  for (const [format, count] of Object.entries(formatCounts)) {
    if (format !== 'direct' && count > maxCount) {
      maxCount = count;
      dominantFormat = format as ResponseEnvelopeFormat;
    }
  }
  
  // Determine pagination format
  const paginationFormats = envelopePatterns
    .filter(p => p.paginationFormat)
    .map(p => p.paginationFormat!);
  
  let paginationFormat: PaginationFormat | null = null;
  if (paginationFormats.length > 0) {
    const paginationCounts: Record<PaginationFormat, number> = {
      'offset': 0,
      'cursor': 0,
      'page-based': 0,
      'link-based': 0,
      'mixed': 0,
    };
    
    for (const format of paginationFormats) {
      paginationCounts[format]++;
    }
    
    let maxPaginationCount = 0;
    for (const [format, count] of Object.entries(paginationCounts)) {
      if (count > maxPaginationCount) {
        maxPaginationCount = count;
        paginationFormat = format as PaginationFormat;
      }
    }
  }
  
  // Detect violations
  const inconsistentEnvelopeViolations = detectInconsistentEnvelopeViolations(envelopePatterns, file);
  const missingFieldViolations = detectMissingFieldViolations(envelopePatterns, file);
  const rawDataViolations = detectRawDataViolations(envelopePatterns, content, file);
  const paginationViolations = detectInconsistentPaginationViolations(envelopePatterns, file);
  
  const violations = [
    ...inconsistentEnvelopeViolations,
    ...missingFieldViolations,
    ...rawDataViolations,
    ...paginationViolations,
  ];
  
  // Determine consistency
  const usesConsistentEnvelope = violations.length === 0 && envelopePatterns.length > 0;
  
  // Calculate confidence
  let patternAdherenceConfidence = 1.0;
  if (envelopePatterns.length > 0 && violations.length > 0) {
    patternAdherenceConfidence = Math.max(0, 1 - (violations.length / envelopePatterns.length));
  } else if (envelopePatterns.length === 0) {
    patternAdherenceConfidence = 0.5;
  }
  
  return {
    envelopePatterns,
    violations,
    dominantFormat,
    paginationFormat,
    usesConsistentEnvelope,
    patternAdherenceConfidence,
  };
}

// ============================================================================
// Response Envelope Detector Class
// ============================================================================

/**
 * Detector for response envelope patterns
 *
 * Identifies response envelope patterns and flags violations of consistency.
 *
 * @requirements 10.3 - THE API_Detector SHALL detect response envelope patterns ({ data, error, meta })
 */
export class ResponseEnvelopeDetector extends RegexDetector {
  readonly id = 'api/response-envelope';
  readonly category = 'api' as const;
  readonly subcategory = 'response-envelope';
  readonly name = 'Response Envelope Detector';
  readonly description = 'Detects response envelope patterns and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  /**
   * Detect response envelope patterns and violations
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    // Analyze the file
    const analysis = analyzeResponseEnvelope(context.content, context.file);
    
    // Create pattern matches for envelope formats
    if (analysis.dominantFormat) {
      patterns.push({
        patternId: `${this.id}/format-${analysis.dominantFormat}`,
        location: {
          file: context.file,
          line: analysis.envelopePatterns[0]?.line || 1,
          column: analysis.envelopePatterns[0]?.column || 1,
        },
        confidence: 1.0,
        isOutlier: false,
      });
    }
    
    // Create pattern matches for pagination format
    if (analysis.paginationFormat) {
      const paginatedPattern = analysis.envelopePatterns.find(p => p.paginationFormat);
      patterns.push({
        patternId: `${this.id}/pagination-${analysis.paginationFormat}`,
        location: {
          file: context.file,
          line: paginatedPattern?.line || 1,
          column: paginatedPattern?.column || 1,
        },
        confidence: 1.0,
        isOutlier: false,
      });
    }
    
    // Create pattern matches by type
    const patternTypes = new Set(analysis.envelopePatterns.map(p => p.type));
    for (const patternType of patternTypes) {
      const firstOfType = analysis.envelopePatterns.find(p => p.type === patternType);
      if (firstOfType) {
        patterns.push({
          patternId: `${this.id}/${patternType}`,
          location: {
            file: context.file,
            line: firstOfType.line,
            column: firstOfType.column,
          },
          confidence: 1.0,
          isOutlier: false,
        });
      }
    }
    
    // Create violations
    for (const violation of analysis.violations) {
      violations.push(this.createViolation(violation));
    }
    
    return this.createResult(patterns, violations, analysis.patternAdherenceConfidence);
  }

  /**
   * Create a Violation from ResponseEnvelopeViolationInfo
   */
  private createViolation(info: ResponseEnvelopeViolationInfo): Violation {
    const severityMap: Record<ResponseEnvelopeViolationType, 'error' | 'warning' | 'info'> = {
      'inconsistent-envelope': 'warning',
      'missing-data-field': 'info',
      'missing-error-field': 'info',
      'missing-success-indicator': 'info',
      'mixed-formats': 'warning',
      'raw-data-response': 'info',
      'inconsistent-pagination': 'warning',
      'missing-pagination': 'info',
    };
    
    const violation: Violation = {
      id: `${this.id}-${info.file}-${info.line}-${info.column}`,
      patternId: this.id,
      severity: severityMap[info.type] || 'warning',
      file: info.file,
      range: {
        start: { line: info.line - 1, character: info.column - 1 },
        end: { line: info.endLine - 1, character: info.endColumn - 1 },
      },
      message: info.issue,
      explanation: this.getExplanation(info.type),
      expected: info.suggestedFix || 'Consistent response envelope',
      actual: info.value,
      aiExplainAvailable: true,
      aiFixAvailable: !!info.suggestedFix,
      firstSeen: new Date(),
      occurrences: 1,
    };
    
    if (info.suggestedFix) {
      const quickFix = this.createQuickFixForViolation(info);
      if (quickFix) {
        violation.quickFix = quickFix;
      }
    }
    
    return violation;
  }

  /**
   * Get explanation for a violation type
   */
  private getExplanation(type: ResponseEnvelopeViolationType): string {
    const explanations: Record<ResponseEnvelopeViolationType, string> = {
      'inconsistent-envelope': 
        'Consistent response envelope structure makes APIs predictable and easier to consume. ' +
        'Clients can rely on a standard structure for parsing responses.',
      'missing-data-field': 
        'A "data" field in the response envelope clearly separates the payload from metadata. ' +
        'This makes it easier to add metadata without breaking existing clients.',
      'missing-error-field': 
        'An "error" field provides a consistent location for error information. ' +
        'This helps clients handle errors uniformly across all endpoints.',
      'missing-success-indicator': 
        'A success indicator (like "success" or "ok") makes it easy to check response status ' +
        'without parsing the entire response or relying solely on HTTP status codes.',
      'mixed-formats': 
        'Mixing different response formats (e.g., JSON:API with custom format) creates ' +
        'inconsistency and makes the API harder to consume. Choose one format and use it consistently.',
      'raw-data-response': 
        'Returning raw data without an envelope makes it harder to add metadata later. ' +
        'Wrapping responses in an envelope provides flexibility for future changes.',
      'inconsistent-pagination': 
        'Consistent pagination format across endpoints makes it easier for clients to ' +
        'implement pagination logic. Use the same pagination style throughout the API.',
      'missing-pagination': 
        'List endpoints should include pagination metadata to help clients navigate large datasets. ' +
        'Include fields like total, page, limit, or cursor information.',
    };
    
    return explanations[type] || 'Follow consistent response envelope patterns.';
  }

  /**
   * Create a quick fix for a violation
   */
  private createQuickFixForViolation(info: ResponseEnvelopeViolationInfo): QuickFix | undefined {
    if (!info.suggestedFix) {
      return undefined;
    }
    
    return {
      title: info.suggestedFix,
      kind: 'quickfix',
      edit: {
        changes: {
          [info.file]: [
            {
              range: {
                start: { line: info.line - 1, character: 0 },
                end: { line: info.line - 1, character: info.lineContent.length },
              },
              newText: info.lineContent, // Placeholder - actual fix would need more context
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.5,
      preview: info.suggestedFix,
    };
  }

  /**
   * Generate a quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Check if this is a response envelope violation
    if (!violation.patternId.startsWith('api/response-envelope')) {
      return null;
    }
    
    // Generate appropriate fix based on violation type
    if (violation.message.includes('missing a data field')) {
      return {
        title: 'Wrap response in data field',
        kind: 'quickfix',
        edit: {
          changes: {
            [violation.file]: [
              {
                range: violation.range,
                newText: '{ data: ' + violation.actual + ' }',
              },
            ],
          },
        },
        isPreferred: true,
        confidence: 0.6,
        preview: 'Wrap response payload in { data: ... }',
      };
    }
    
    return null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ResponseEnvelopeDetector instance
 */
export function createResponseEnvelopeDetector(): ResponseEnvelopeDetector {
  return new ResponseEnvelopeDetector();
}
