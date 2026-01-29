/**
 * Pagination Detector - Pagination pattern detection
 *
 * Detects pagination patterns including:
 * - Offset-based pagination (page, limit, offset, total)
 * - Cursor-based pagination (cursor, nextCursor, hasMore)
 * - Page-based pagination (pageNumber, pageSize, totalPages)
 * - Link-based pagination (next, prev, first, last URLs)
 * - Keyset pagination (after, before, first, last)
 *
 * Flags violations:
 * - Inconsistent pagination format across endpoints
 * - Missing pagination metadata for list endpoints
 * - Mixing different pagination strategies
 * - Missing total count for offset pagination
 * - Missing hasMore indicator for cursor pagination
 *
 * @requirements 10.5 - THE API_Detector SHALL detect pagination patterns (cursor vs offset)
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/** Types of pagination formats detected */
export type PaginationType =
  | 'offset'      // page, limit, offset, total
  | 'cursor'      // cursor, nextCursor, hasMore
  | 'page-based'  // pageNumber, pageSize, totalPages
  | 'link-based'  // next, prev, first, last URLs
  | 'keyset'      // after, before, first, last (GraphQL-style)
  | 'none';       // No pagination detected

/** Types of pagination patterns detected */
export type PaginationPatternType =
  | 'request-params'    // Pagination in request parameters
  | 'response-meta'     // Pagination metadata in response
  | 'link-header'       // Link header pagination
  | 'graphql-connection' // GraphQL connection pattern
  | 'list-endpoint';    // List endpoint detection

/** Types of pagination violations detected */
export type PaginationViolationType =
  | 'inconsistent-format'     // Inconsistent pagination format
  | 'missing-pagination'      // Missing pagination for list endpoint
  | 'missing-total'           // Missing total count for offset
  | 'missing-has-more'        // Missing hasMore for cursor
  | 'mixed-formats'           // Mixing different pagination formats
  | 'unbounded-list'          // List without limit
  | 'missing-default-limit';  // No default limit specified


/** Information about a detected pagination pattern */
export interface PaginationPatternInfo {
  type: PaginationPatternType;
  format: PaginationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  fields?: string[] | undefined;
  isRequest?: boolean | undefined;
  isResponse?: boolean | undefined;
  context?: string | undefined;
}

/** Information about a detected pagination violation */
export interface PaginationViolationInfo {
  type: PaginationViolationType;
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

/** Analysis of pagination patterns in a file */
export interface PaginationAnalysis {
  paginationPatterns: PaginationPatternInfo[];
  violations: PaginationViolationInfo[];
  dominantFormat: PaginationType | null;
  usesConsistentFormat: boolean;
  hasListEndpoints: boolean;
  patternAdherenceConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Offset pagination fields */
export const OFFSET_PAGINATION_FIELDS = {
  request: ['page', 'limit', 'offset', 'skip', 'take', 'perPage', 'per_page'],
  response: ['total', 'totalCount', 'total_count', 'count', 'totalItems', 'total_items'],
} as const;

/** Cursor pagination fields */
export const CURSOR_PAGINATION_FIELDS = {
  request: ['cursor', 'after', 'before', 'startCursor', 'endCursor'],
  response: ['nextCursor', 'prevCursor', 'hasMore', 'hasNext', 'hasPrev', 'next_cursor', 'prev_cursor'],
} as const;

/** Page-based pagination fields */
export const PAGE_BASED_FIELDS = {
  request: ['pageNumber', 'page_number', 'pageSize', 'page_size', 'currentPage'],
  response: ['totalPages', 'total_pages', 'pageCount', 'page_count'],
} as const;

/** Link-based pagination fields */
export const LINK_BASED_FIELDS = ['next', 'prev', 'previous', 'first', 'last', 'self'] as const;

/** GraphQL connection fields (Relay-style) */
export const GRAPHQL_CONNECTION_FIELDS = {
  connection: ['edges', 'nodes', 'pageInfo'],
  pageInfo: ['hasNextPage', 'hasPreviousPage', 'startCursor', 'endCursor'],
  edge: ['node', 'cursor'],
} as const;

/** List endpoint indicators */
export const LIST_ENDPOINT_PATTERNS = [
  /\.findAll\s*\(/gi,
  /\.findMany\s*\(/gi,
  /\.list\s*\(/gi,
  /\.getAll\s*\(/gi,
  /\.search\s*\(/gi,
  /\.query\s*\(/gi,
  /return\s+\[/gi,
  /data\s*:\s*\[/gi,
  /items\s*:\s*\[/gi,
  /results\s*:\s*\[/gi,
] as const;

/** Request pagination patterns */
export const REQUEST_PAGINATION_PATTERNS = [
  /(?:page|limit|offset|cursor|skip|take)\s*[=:]\s*(?:req\.|params\.|query\.|\d+|['"`])/gi,
  /searchParams\.get\s*\(\s*['"`](?:page|limit|offset|cursor)['"`]\s*\)/gi,
  /req\.query\.(?:page|limit|offset|cursor|skip|take)/gi,
  /\{\s*(?:page|limit|offset|cursor)[^}]*\}\s*=\s*(?:req\.query|params|searchParams)/gi,
] as const;

/** Response pagination patterns */
export const RESPONSE_PAGINATION_PATTERNS = [
  /\{\s*(?:data|items|results)\s*:[^}]*,\s*(?:total|page|hasMore|nextCursor)/gi,
  /meta\s*:\s*\{[^}]*(?:total|page|limit|cursor)/gi,
  /pagination\s*:\s*\{/gi,
  /pageInfo\s*:\s*\{/gi,
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

/** Detect pagination type from fields */
export function detectPaginationType(fields: string[]): PaginationType {
  const lowerFields = fields.map(f => f.toLowerCase());
  
  // Check for GraphQL connection pattern (most specific)
  const connectionFields = GRAPHQL_CONNECTION_FIELDS.connection;
  const pageInfoFields = GRAPHQL_CONNECTION_FIELDS.pageInfo;
  if (connectionFields.some(f => lowerFields.includes(f.toLowerCase())) &&
      pageInfoFields.some(f => lowerFields.includes(f.toLowerCase()))) {
    return 'keyset';
  }
  
  // Check for cursor pagination
  const cursorRequestFields = CURSOR_PAGINATION_FIELDS.request;
  const cursorResponseFields = CURSOR_PAGINATION_FIELDS.response;
  const hasCursorFields = [...cursorRequestFields, ...cursorResponseFields]
    .some(f => lowerFields.includes(f.toLowerCase()));
  if (hasCursorFields) {return 'cursor';}
  
  // Check for link-based pagination
  const linkFields = LINK_BASED_FIELDS.filter(f => lowerFields.includes(f.toLowerCase()));
  if (linkFields.length >= 2) {return 'link-based';}
  
  // Check for page-based pagination
  const pageBasedRequest = PAGE_BASED_FIELDS.request;
  const pageBasedResponse = PAGE_BASED_FIELDS.response;
  const hasPageBasedFields = [...pageBasedRequest, ...pageBasedResponse]
    .some(f => lowerFields.includes(f.toLowerCase()));
  if (hasPageBasedFields) {return 'page-based';}
  
  // Check for offset pagination
  const offsetRequest = OFFSET_PAGINATION_FIELDS.request;
  const offsetResponse = OFFSET_PAGINATION_FIELDS.response;
  const hasOffsetFields = [...offsetRequest, ...offsetResponse]
    .some(f => lowerFields.includes(f.toLowerCase()));
  if (hasOffsetFields) {return 'offset';}
  
  return 'none';
}

/** Check if fields indicate a list response */
export function isListResponse(content: string): boolean {
  return LIST_ENDPOINT_PATTERNS.some(pattern => pattern.test(content));
}


// ============================================================================
// Detection Functions
// ============================================================================

/** Detect request pagination patterns */
export function detectRequestPagination(content: string, file: string): PaginationPatternInfo[] {
  const results: PaginationPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of REQUEST_PAGINATION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      const fields = extractFieldNames(match[0]);
      const format = detectPaginationType(fields.length > 0 ? fields : [match[0]]);
      
      if (format !== 'none') {
        results.push({
          type: 'request-params',
          format,
          file,
          line,
          column,
          matchedText: match[0],
          fields,
          isRequest: true,
          context: lines[line - 1] || '',
        });
      }
    }
  }
  return results;
}

/** Detect response pagination patterns */
export function detectResponsePagination(content: string, file: string): PaginationPatternInfo[] {
  const results: PaginationPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of RESPONSE_PAGINATION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      // Find the full object
      const startIndex = match.index;
      let braceCount = 0;
      let endIndex = startIndex;
      let foundBrace = false;
      
      for (let i = startIndex; i < content.length && i < startIndex + 500; i++) {
        if (content[i] === '{') { braceCount++; foundBrace = true; }
        if (content[i] === '}') {
          braceCount--;
          if (foundBrace && braceCount === 0) { endIndex = i + 1; break; }
        }
      }
      
      const objectContent = content.slice(startIndex, endIndex);
      const fields = extractFieldNames(objectContent);
      const format = detectPaginationType(fields);
      
      if (format !== 'none') {
        results.push({
          type: 'response-meta',
          format,
          file,
          line,
          column,
          matchedText: match[0],
          fields,
          isResponse: true,
          context: lines[line - 1] || '',
        });
      }
    }
  }
  return results;
}

/** Detect GraphQL connection patterns */
export function detectGraphQLConnections(content: string, file: string): PaginationPatternInfo[] {
  const results: PaginationPatternInfo[] = [];
  const lines = content.split('\n');
  
  // Pattern for GraphQL connection types
  const connectionPatterns = [
    /type\s+\w+Connection\s*\{([^}]+)\}/gi,
    /edges\s*:\s*\[([^\]]+)\]/gi,
    /pageInfo\s*:\s*\{([^}]+)\}/gi,
    /\{\s*edges\s*,\s*pageInfo\s*\}/gi,
  ];
  
  for (const pattern of connectionPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      const objectContent = match[1] || match[0];
      const fields = extractFieldNames(objectContent);
      
      results.push({
        type: 'graphql-connection',
        format: 'keyset',
        file,
        line,
        column,
        matchedText: match[0],
        fields,
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect list endpoints */
export function detectListEndpoints(content: string, file: string): PaginationPatternInfo[] {
  const results: PaginationPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of LIST_ENDPOINT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'list-endpoint',
        format: 'none',
        file,
        line,
        column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}


// ============================================================================
// Violation Detection Functions
// ============================================================================

/** Detect inconsistent pagination format violations */
export function detectInconsistentFormatViolations(
  patterns: PaginationPatternInfo[],
  file: string
): PaginationViolationInfo[] {
  const violations: PaginationViolationInfo[] = [];
  const formatCounts: Record<PaginationType, number> = {
    'offset': 0, 'cursor': 0, 'page-based': 0,
    'link-based': 0, 'keyset': 0, 'none': 0,
  };
  
  for (const pattern of patterns) {
    if (pattern.format !== 'none') {
      formatCounts[pattern.format]++;
    }
  }
  
  // Find dominant format
  let dominantFormat: PaginationType | null = null;
  let maxCount = 0;
  for (const [format, count] of Object.entries(formatCounts)) {
    if (format !== 'none' && count > maxCount) {
      maxCount = count;
      dominantFormat = format as PaginationType;
    }
  }
  
  // Flag patterns that don't match dominant format
  if (dominantFormat && maxCount >= 2) {
    for (const pattern of patterns) {
      if (pattern.format !== dominantFormat && pattern.format !== 'none') {
        violations.push({
          type: 'mixed-formats',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: pattern.format,
          issue: `Pagination uses ${pattern.format} but project predominantly uses ${dominantFormat}`,
          suggestedFix: `Convert to ${dominantFormat} pagination for consistency`,
          lineContent: pattern.context || '',
        });
      }
    }
  }
  return violations;
}

/** Detect missing pagination for list endpoints */
export function detectMissingPaginationViolations(
  patterns: PaginationPatternInfo[],
  file: string
): PaginationViolationInfo[] {
  const violations: PaginationViolationInfo[] = [];
  
  const listEndpoints = patterns.filter(p => p.type === 'list-endpoint');
  const paginationPatterns = patterns.filter(p => p.format !== 'none');
  
  // If file has list endpoints but no pagination
  if (listEndpoints.length > 0 && paginationPatterns.length === 0) {
    for (const endpoint of listEndpoints) {
      violations.push({
        type: 'missing-pagination',
        file,
        line: endpoint.line,
        column: endpoint.column,
        endLine: endpoint.line,
        endColumn: endpoint.column + endpoint.matchedText.length,
        value: endpoint.matchedText,
        issue: 'List endpoint without pagination support',
        suggestedFix: 'Add pagination parameters (page, limit) or cursor-based pagination',
        lineContent: endpoint.context || '',
      });
    }
  }
  return violations;
}

/** Detect missing total count for offset pagination */
export function detectMissingTotalViolations(
  patterns: PaginationPatternInfo[],
  file: string
): PaginationViolationInfo[] {
  const violations: PaginationViolationInfo[] = [];
  
  const offsetPatterns = patterns.filter(p => p.format === 'offset' && p.isResponse);
  
  for (const pattern of offsetPatterns) {
    const fields = pattern.fields || [];
    const lowerFields = fields.map(f => f.toLowerCase());
    const hasTotal = OFFSET_PAGINATION_FIELDS.response.some(f => 
      lowerFields.includes(f.toLowerCase())
    );
    
    if (!hasTotal) {
      violations.push({
        type: 'missing-total',
        file,
        line: pattern.line,
        column: pattern.column,
        endLine: pattern.line,
        endColumn: pattern.column + pattern.matchedText.length,
        value: pattern.matchedText,
        issue: 'Offset pagination response missing total count',
        suggestedFix: 'Add "total" or "totalCount" field to pagination response',
        lineContent: pattern.context || '',
      });
    }
  }
  return violations;
}

/** Detect missing hasMore for cursor pagination */
export function detectMissingHasMoreViolations(
  patterns: PaginationPatternInfo[],
  file: string
): PaginationViolationInfo[] {
  const violations: PaginationViolationInfo[] = [];
  
  const cursorPatterns = patterns.filter(p => p.format === 'cursor' && p.isResponse);
  
  for (const pattern of cursorPatterns) {
    const fields = pattern.fields || [];
    const lowerFields = fields.map(f => f.toLowerCase());
    const hasMoreIndicator = ['hasmore', 'hasnext', 'has_more', 'has_next']
      .some(f => lowerFields.includes(f));
    
    if (!hasMoreIndicator) {
      violations.push({
        type: 'missing-has-more',
        file,
        line: pattern.line,
        column: pattern.column,
        endLine: pattern.line,
        endColumn: pattern.column + pattern.matchedText.length,
        value: pattern.matchedText,
        issue: 'Cursor pagination response missing hasMore indicator',
        suggestedFix: 'Add "hasMore" or "hasNext" field to pagination response',
        lineContent: pattern.context || '',
      });
    }
  }
  return violations;
}


// ============================================================================
// Main Analysis Function
// ============================================================================

/** Analyze pagination patterns in file content */
export function analyzePagination(content: string, file: string): PaginationAnalysis {
  if (shouldExcludeFile(file)) {
    return {
      paginationPatterns: [],
      violations: [],
      dominantFormat: null,
      usesConsistentFormat: true,
      hasListEndpoints: false,
      patternAdherenceConfidence: 1.0,
    };
  }
  
  // Detect all patterns
  const requestPatterns = detectRequestPagination(content, file);
  const responsePatterns = detectResponsePagination(content, file);
  const graphqlPatterns = detectGraphQLConnections(content, file);
  const listEndpoints = detectListEndpoints(content, file);
  
  const allPatterns = [...requestPatterns, ...responsePatterns, ...graphqlPatterns, ...listEndpoints];
  
  // Detect violations
  const formatViolations = detectInconsistentFormatViolations(allPatterns, file);
  const missingPaginationViolations = detectMissingPaginationViolations(allPatterns, file);
  const missingTotalViolations = detectMissingTotalViolations(allPatterns, file);
  const missingHasMoreViolations = detectMissingHasMoreViolations(allPatterns, file);
  
  const allViolations = [
    ...formatViolations,
    ...missingPaginationViolations,
    ...missingTotalViolations,
    ...missingHasMoreViolations,
  ];
  
  // Determine dominant format
  const formatCounts: Record<PaginationType, number> = {
    'offset': 0, 'cursor': 0, 'page-based': 0,
    'link-based': 0, 'keyset': 0, 'none': 0,
  };
  for (const pattern of allPatterns) {
    formatCounts[pattern.format]++;
  }
  
  let dominantFormat: PaginationType | null = null;
  let maxCount = 0;
  for (const [format, count] of Object.entries(formatCounts)) {
    if (format !== 'none' && count > maxCount) {
      maxCount = count;
      dominantFormat = format as PaginationType;
    }
  }
  
  // Calculate confidence
  const totalPatterns = allPatterns.filter(p => p.format !== 'none').length;
  const violationCount = allViolations.length;
  const confidence = totalPatterns > 0 
    ? Math.max(0, 1 - (violationCount / totalPatterns) * 0.2)
    : 1.0;
  
  // Check consistency
  const nonNoneFormats = Object.entries(formatCounts)
    .filter(([format, count]) => format !== 'none' && count > 0);
  const usesConsistentFormat = nonNoneFormats.length <= 1;
  
  return {
    paginationPatterns: allPatterns,
    violations: allViolations,
    dominantFormat,
    usesConsistentFormat,
    hasListEndpoints: listEndpoints.length > 0,
    patternAdherenceConfidence: confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

/** Pagination Detector - Detects pagination patterns */
export class PaginationDetector extends RegexDetector {
  readonly id = 'api/pagination';
  readonly name = 'Pagination Detector';
  readonly description = 'Detects pagination patterns (cursor vs offset)';
  readonly category = 'api';
  readonly subcategory = 'pagination';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (shouldExcludeFile(file)) {
      return this.createEmptyResult();
    }
    
    const analysis = analyzePagination(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.patternAdherenceConfidence, {
      custom: {
        paginationPatterns: analysis.paginationPatterns,
        dominantFormat: analysis.dominantFormat,
        usesConsistentFormat: analysis.usesConsistentFormat,
        hasListEndpoints: analysis.hasListEndpoints,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

/** Create a new PaginationDetector instance */
export function createPaginationDetector(): PaginationDetector {
  return new PaginationDetector();
}