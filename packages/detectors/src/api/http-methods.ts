/**
 * HTTP Methods Detector - HTTP method usage pattern detection
 *
 * Detects HTTP method usage patterns including:
 * - HTTP method usage (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
 * - RESTful method conventions (GET for read, POST for create, PUT/PATCH for update, DELETE for remove)
 * - Express/Fastify method handlers (router.get, router.post, etc.)
 * - Next.js App Router method exports (export function GET, POST, etc.)
 * - Fetch API method usage (fetch with method option)
 * - Axios method usage (axios.get, axios.post, etc.)
 *
 * Flags violations:
 * - Using POST for read operations (should be GET)
 * - Using GET for mutations (should be POST/PUT/PATCH/DELETE)
 * - Missing method handlers for common operations
 * - Inconsistent method usage across similar endpoints
 * - Using PUT when PATCH is more appropriate (partial updates)
 *
 * @requirements 10.2 - THE API_Detector SHALL detect HTTP method usage patterns (POST vs PUT vs PATCH)
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * HTTP methods supported
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Types of HTTP method patterns detected
 */
export type HttpMethodPatternType =
  | 'express-handler'        // Express/Fastify route handler (router.get, app.post)
  | 'nextjs-app-router'      // Next.js App Router export (export function GET)
  | 'fetch-api'              // Fetch API usage (fetch with method option)
  | 'axios-method'           // Axios method usage (axios.get, axios.post)
  | 'http-client'            // Generic HTTP client usage
  | 'method-constant';       // HTTP method constant/enum usage

/**
 * Types of HTTP method violations detected
 */
export type HttpMethodViolationType =
  | 'post-for-read'          // Using POST for read operations
  | 'get-for-mutation'       // Using GET for mutations
  | 'put-for-partial'        // Using PUT when PATCH is more appropriate
  | 'inconsistent-method'    // Inconsistent method usage
  | 'missing-method-handler' // Missing common method handlers
  | 'non-restful-method';    // Non-RESTful method usage

/**
 * Information about a detected HTTP method usage
 */
export interface HttpMethodUsageInfo {
  /** Type of HTTP method pattern */
  type: HttpMethodPatternType;
  /** HTTP method used */
  method: HttpMethod;
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Route path (if available) */
  routePath?: string | undefined;
  /** Operation type inferred from context */
  operationType?: 'read' | 'create' | 'update' | 'delete' | 'unknown' | undefined;
  /** Additional context */
  context?: string | undefined;
}

/**
 * Information about a detected HTTP method violation
 */
export interface HttpMethodViolationInfo {
  /** Type of violation */
  type: HttpMethodViolationType;
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
  /** The problematic method */
  method: HttpMethod;
  /** Issue description */
  issue: string;
  /** Suggested fix */
  suggestedFix?: string | undefined;
  /** Suggested method to use instead */
  suggestedMethod?: HttpMethod | undefined;
  /** The full line content */
  lineContent: string;
}

/**
 * Analysis of HTTP method patterns in a file
 */
export interface HttpMethodAnalysis {
  /** HTTP method usages found */
  methodUsages: HttpMethodUsageInfo[];
  /** Violations detected */
  violations: HttpMethodViolationInfo[];
  /** Methods used in the file */
  methodsUsed: Set<HttpMethod>;
  /** Whether file uses RESTful conventions */
  usesRestfulConventions: boolean;
  /** Pattern adherence confidence */
  patternAdherenceConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * All supported HTTP methods
 */
export const HTTP_METHODS: readonly HttpMethod[] = [
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'
] as const;

/**
 * HTTP methods for read operations
 */
export const READ_METHODS: readonly HttpMethod[] = ['GET', 'HEAD', 'OPTIONS'] as const;

/**
 * HTTP methods for mutation operations
 */
export const MUTATION_METHODS: readonly HttpMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * RESTful method conventions mapping
 */
export const RESTFUL_METHOD_CONVENTIONS: Record<string, HttpMethod[]> = {
  // Read operations should use GET
  read: ['GET'],
  get: ['GET'],
  fetch: ['GET'],
  list: ['GET'],
  find: ['GET'],
  search: ['GET'],
  query: ['GET'],
  
  // Create operations should use POST
  create: ['POST'],
  add: ['POST'],
  insert: ['POST'],
  new: ['POST'],
  
  // Update operations should use PUT or PATCH
  update: ['PUT', 'PATCH'],
  edit: ['PUT', 'PATCH'],
  modify: ['PUT', 'PATCH'],
  change: ['PUT', 'PATCH'],
  replace: ['PUT'],
  
  // Partial update operations should use PATCH
  patch: ['PATCH'],
  partial: ['PATCH'],
  
  // Delete operations should use DELETE
  delete: ['DELETE'],
  remove: ['DELETE'],
  destroy: ['DELETE'],
} as const;

/**
 * Keywords indicating read operations
 */
export const READ_OPERATION_KEYWORDS = new Set([
  'get', 'fetch', 'find', 'list', 'search', 'query', 'read', 'load', 'retrieve',
  'show', 'view', 'display', 'check', 'verify', 'validate', 'exists', 'count',
]);

/**
 * Keywords indicating mutation operations
 */
export const MUTATION_OPERATION_KEYWORDS = new Set([
  'create', 'add', 'insert', 'new', 'post', 'submit', 'save',
  'update', 'edit', 'modify', 'change', 'patch', 'put', 'replace',
  'delete', 'remove', 'destroy', 'clear', 'reset', 'cancel',
]);

/**
 * Keywords indicating partial update operations
 */
export const PARTIAL_UPDATE_KEYWORDS = new Set([
  'patch', 'partial', 'update', 'modify', 'change', 'edit',
]);

/**
 * Keywords indicating full replacement operations
 */
export const FULL_REPLACEMENT_KEYWORDS = new Set([
  'replace', 'set', 'overwrite', 'reset',
]);

/**
 * Express/Fastify route handler patterns
 */
export const EXPRESS_METHOD_PATTERNS = [
  // TypeScript/JavaScript patterns - Express/Fastify route handler (router.get, app.post)
  /(?:router|app|server|fastify)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  // router.route('/path').get(handler).post(handler)
  /\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.(get|post|put|patch|delete|head|options)\s*\(/gi,
  // Python patterns - FastAPI, Flask
  /@(?:app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /@api_view\s*\(\s*\[\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/gi,
] as const;

/**
 * Next.js App Router method export patterns
 */
export const NEXTJS_METHOD_EXPORT_PATTERN = 
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/gi;

/**
 * Fetch API method patterns
 */
export const FETCH_METHOD_PATTERNS = [
  // fetch(url, { method: 'POST' }) - matches fetch with method option in config object
  /fetch\s*\(\s*[^,]+,\s*\{[^}]*method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]/gi,
] as const;

/**
 * Axios method patterns
 */
export const AXIOS_METHOD_PATTERNS = [
  // axios.get(url), axios.post(url, data)
  /axios\.(get|post|put|patch|delete|head|options)\s*\(/gi,
  // axios({ method: 'POST', url: ... })
  /axios\s*\(\s*\{[^}]*method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]/gi,
  // axios.request({ method: 'POST' })
  /axios\.request\s*\(\s*\{[^}]*method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]/gi,
] as const;

/**
 * Generic HTTP client patterns
 */
export const HTTP_CLIENT_PATTERNS = [
  // http.get, http.post, etc.
  /(?:http|client|api)\.(get|post|put|patch|delete|head|options)\s*\(/gi,
  // request({ method: 'POST' })
  /request\s*\(\s*\{[^}]*method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]/gi,
  // got.get, got.post, etc.
  /got\.(get|post|put|patch|delete|head|options)\s*\(/gi,
  // ky.get, ky.post, etc.
  /ky\.(get|post|put|patch|delete|head|options)\s*\(/gi,
  // superagent.get, superagent.post, etc.
  /superagent\.(get|post|put|patch|delete|head|options)\s*\(/gi,
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
 * Normalize HTTP method to uppercase
 */
export function normalizeMethod(method: string): HttpMethod {
  return method.toUpperCase() as HttpMethod;
}

/**
 * Check if a method is a read method
 */
export function isReadMethod(method: HttpMethod): boolean {
  return READ_METHODS.includes(method);
}

/**
 * Check if a method is a mutation method
 */
export function isMutationMethod(method: HttpMethod): boolean {
  return MUTATION_METHODS.includes(method);
}

/**
 * Infer operation type from context (route path, function name, etc.)
 */
export function inferOperationType(
  context: string,
  routePath?: string
): 'read' | 'create' | 'update' | 'delete' | 'unknown' {
  const lowerContext = context.toLowerCase();
  const lowerPath = routePath?.toLowerCase() || '';
  
  // Check for delete operations
  if (
    lowerContext.includes('delete') ||
    lowerContext.includes('remove') ||
    lowerContext.includes('destroy')
  ) {
    return 'delete';
  }
  
  // Check for create operations
  if (
    lowerContext.includes('create') ||
    lowerContext.includes('add') ||
    lowerContext.includes('insert') ||
    lowerContext.includes('new')
  ) {
    return 'create';
  }
  
  // Check for update operations
  if (
    lowerContext.includes('update') ||
    lowerContext.includes('edit') ||
    lowerContext.includes('modify') ||
    lowerContext.includes('patch') ||
    lowerContext.includes('put')
  ) {
    return 'update';
  }
  
  // Check for read operations
  for (const keyword of READ_OPERATION_KEYWORDS) {
    if (lowerContext.includes(keyword) || lowerPath.includes(keyword)) {
      return 'read';
    }
  }
  
  return 'unknown';
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
 * Detect Express/Fastify route handlers
 */
export function detectExpressHandlers(
  content: string,
  file: string
): HttpMethodUsageInfo[] {
  const results: HttpMethodUsageInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of EXPRESS_METHOD_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      
      const { line, column } = getPositionFromIndex(content, match.index);
      
      // Handle different capture group orders
      let method: string;
      let routePath: string | undefined;
      
      if (pattern.source.includes('\\.route')) {
        // .route('/path').get() pattern - path is first, method is second
        routePath = match[1];
        method = match[2] || 'GET';
      } else {
        // router.get('/path') pattern - method is first, path is second
        method = match[1] || 'GET';
        routePath = match[2];
      }
      
      const normalizedMethod = normalizeMethod(method);
      const lineContent = lines[line - 1] || '';
      
      results.push({
        type: 'express-handler',
        method: normalizedMethod,
        file,
        line,
        column,
        matchedText: match[0],
        routePath,
        operationType: inferOperationType(lineContent, routePath),
        context: lineContent,
      });
    }
  }
  
  return results;
}

/**
 * Detect Next.js App Router method exports
 */
export function detectNextjsMethodExports(
  content: string,
  file: string
): HttpMethodUsageInfo[] {
  const results: HttpMethodUsageInfo[] = [];
  const lines = content.split('\n');
  
  // Only check files that look like Next.js route files
  if (!file.includes('/app/') && !file.includes('\\app\\')) {
    return results;
  }
  
  const regex = new RegExp(NEXTJS_METHOD_EXPORT_PATTERN.source, NEXTJS_METHOD_EXPORT_PATTERN.flags);
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    if (isInsideComment(content, match.index)) {
      continue;
    }
    
    const { line, column } = getPositionFromIndex(content, match.index);
    const method = normalizeMethod(match[1] || 'GET');
    const lineContent = lines[line - 1] || '';
    
    // Infer route path from file path
    const routeMatch = file.match(/\/app(\/(?:api\/)?[^/]+(?:\/[^/]+)*?)\/route\.[jt]sx?$/);
    const routePath = routeMatch ? routeMatch[1] : undefined;
    
    results.push({
      type: 'nextjs-app-router',
      method,
      file,
      line,
      column,
      matchedText: match[0],
      routePath,
      operationType: inferOperationType(lineContent, routePath),
      context: lineContent,
    });
  }
  
  return results;
}

/**
 * Detect Fetch API method usage
 */
export function detectFetchApiUsage(
  content: string,
  file: string
): HttpMethodUsageInfo[] {
  const results: HttpMethodUsageInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of FETCH_METHOD_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      
      const { line, column } = getPositionFromIndex(content, match.index);
      const method = normalizeMethod(match[1] || 'GET');
      const lineContent = lines[line - 1] || '';
      
      results.push({
        type: 'fetch-api',
        method,
        file,
        line,
        column,
        matchedText: match[0],
        operationType: inferOperationType(lineContent),
        context: lineContent,
      });
    }
  }
  
  return results;
}

/**
 * Detect Axios method usage
 */
export function detectAxiosUsage(
  content: string,
  file: string
): HttpMethodUsageInfo[] {
  const results: HttpMethodUsageInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of AXIOS_METHOD_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      
      const { line, column } = getPositionFromIndex(content, match.index);
      const method = normalizeMethod(match[1] || 'GET');
      const lineContent = lines[line - 1] || '';
      
      results.push({
        type: 'axios-method',
        method,
        file,
        line,
        column,
        matchedText: match[0],
        operationType: inferOperationType(lineContent),
        context: lineContent,
      });
    }
  }
  
  return results;
}

/**
 * Detect generic HTTP client usage
 */
export function detectHttpClientUsage(
  content: string,
  file: string
): HttpMethodUsageInfo[] {
  const results: HttpMethodUsageInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of HTTP_CLIENT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      
      const { line, column } = getPositionFromIndex(content, match.index);
      const method = normalizeMethod(match[1] || 'GET');
      const lineContent = lines[line - 1] || '';
      
      results.push({
        type: 'http-client',
        method,
        file,
        line,
        column,
        matchedText: match[0],
        operationType: inferOperationType(lineContent),
        context: lineContent,
      });
    }
  }
  
  return results;
}

// ============================================================================
// Violation Detection Functions
// ============================================================================

/**
 * Detect POST used for read operations
 */
export function detectPostForReadViolations(
  methodUsages: HttpMethodUsageInfo[],
  file: string
): HttpMethodViolationInfo[] {
  const violations: HttpMethodViolationInfo[] = [];
  
  for (const usage of methodUsages) {
    if (usage.method !== 'POST') {continue;}
    
    const context = (usage.context || '').toLowerCase();
    const routePath = (usage.routePath || '').toLowerCase();
    
    // Check if this looks like a read operation
    let isReadOperation = false;
    for (const keyword of READ_OPERATION_KEYWORDS) {
      if (context.includes(keyword) || routePath.includes(keyword)) {
        isReadOperation = true;
        break;
      }
    }
    
    // Also check for common read patterns in route paths
    if (
      routePath.includes('/search') ||
      routePath.includes('/find') ||
      routePath.includes('/list') ||
      routePath.includes('/query')
    ) {
      isReadOperation = true;
    }
    
    if (isReadOperation) {
      violations.push({
        type: 'post-for-read',
        file,
        line: usage.line,
        column: usage.column,
        endLine: usage.line,
        endColumn: usage.column + usage.matchedText.length,
        method: usage.method,
        issue: `Using POST for read operation. Consider using GET for idempotent read operations.`,
        suggestedFix: 'Use GET method for read operations',
        suggestedMethod: 'GET',
        lineContent: usage.context || '',
      });
    }
  }
  
  return violations;
}

/**
 * Detect GET used for mutation operations
 */
export function detectGetForMutationViolations(
  methodUsages: HttpMethodUsageInfo[],
  file: string
): HttpMethodViolationInfo[] {
  const violations: HttpMethodViolationInfo[] = [];
  
  for (const usage of methodUsages) {
    if (usage.method !== 'GET') {continue;}
    
    const context = (usage.context || '').toLowerCase();
    const routePath = (usage.routePath || '').toLowerCase();
    
    // Check if this looks like a mutation operation
    let isMutationOperation = false;
    let suggestedMethod: HttpMethod = 'POST';
    
    // Check for delete operations
    if (
      context.includes('delete') ||
      context.includes('remove') ||
      routePath.includes('/delete') ||
      routePath.includes('/remove')
    ) {
      isMutationOperation = true;
      suggestedMethod = 'DELETE';
    }
    // Check for create operations
    else if (
      context.includes('create') ||
      context.includes('add') ||
      context.includes('insert') ||
      routePath.includes('/create') ||
      routePath.includes('/add')
    ) {
      isMutationOperation = true;
      suggestedMethod = 'POST';
    }
    // Check for update operations
    else if (
      context.includes('update') ||
      context.includes('edit') ||
      context.includes('modify') ||
      routePath.includes('/update') ||
      routePath.includes('/edit')
    ) {
      isMutationOperation = true;
      suggestedMethod = 'PATCH';
    }
    
    if (isMutationOperation) {
      violations.push({
        type: 'get-for-mutation',
        file,
        line: usage.line,
        column: usage.column,
        endLine: usage.line,
        endColumn: usage.column + usage.matchedText.length,
        method: usage.method,
        issue: `Using GET for mutation operation. GET requests should be idempotent and not modify server state.`,
        suggestedFix: `Use ${suggestedMethod} method for this operation`,
        suggestedMethod,
        lineContent: usage.context || '',
      });
    }
  }
  
  return violations;
}

/**
 * Detect PUT used when PATCH is more appropriate
 */
export function detectPutForPartialUpdateViolations(
  methodUsages: HttpMethodUsageInfo[],
  file: string
): HttpMethodViolationInfo[] {
  const violations: HttpMethodViolationInfo[] = [];
  
  for (const usage of methodUsages) {
    if (usage.method !== 'PUT') {continue;}
    
    const context = (usage.context || '').toLowerCase();
    const routePath = (usage.routePath || '').toLowerCase();
    
    // Check if this looks like a partial update operation
    let isPartialUpdate = false;
    
    for (const keyword of PARTIAL_UPDATE_KEYWORDS) {
      if (context.includes(keyword) && !context.includes('replace')) {
        isPartialUpdate = true;
        break;
      }
    }
    
    // Check route path for partial update indicators
    if (
      routePath.includes('/patch') ||
      routePath.includes('/partial') ||
      (routePath.includes('/update') && !routePath.includes('/replace'))
    ) {
      isPartialUpdate = true;
    }
    
    // Check for full replacement indicators (these are OK with PUT)
    for (const keyword of FULL_REPLACEMENT_KEYWORDS) {
      if (context.includes(keyword) || routePath.includes(keyword)) {
        isPartialUpdate = false;
        break;
      }
    }
    
    if (isPartialUpdate) {
      violations.push({
        type: 'put-for-partial',
        file,
        line: usage.line,
        column: usage.column,
        endLine: usage.line,
        endColumn: usage.column + usage.matchedText.length,
        method: usage.method,
        issue: `Using PUT for partial update. PUT should replace the entire resource; use PATCH for partial updates.`,
        suggestedFix: 'Use PATCH method for partial updates',
        suggestedMethod: 'PATCH',
        lineContent: usage.context || '',
      });
    }
  }
  
  return violations;
}

/**
 * Detect inconsistent method usage across similar endpoints
 */
export function detectInconsistentMethodUsage(
  methodUsages: HttpMethodUsageInfo[],
  file: string
): HttpMethodViolationInfo[] {
  const violations: HttpMethodViolationInfo[] = [];
  
  // Group usages by operation type
  const operationGroups: Map<string, HttpMethodUsageInfo[]> = new Map();
  
  for (const usage of methodUsages) {
    if (usage.operationType && usage.operationType !== 'unknown') {
      const existing = operationGroups.get(usage.operationType) || [];
      existing.push(usage);
      operationGroups.set(usage.operationType, existing);
    }
  }
  
  // Check for inconsistencies within each operation type
  for (const [operationType, usages] of operationGroups) {
    if (usages.length < 2) {continue;}
    
    const methodCounts: Map<HttpMethod, number> = new Map();
    for (const usage of usages) {
      methodCounts.set(usage.method, (methodCounts.get(usage.method) || 0) + 1);
    }
    
    // Find the dominant method
    let dominantMethod: HttpMethod | null = null;
    let maxCount = 0;
    for (const [method, count] of methodCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantMethod = method;
      }
    }
    
    // Flag usages that don't match the dominant method
    if (dominantMethod && methodCounts.size > 1) {
      for (const usage of usages) {
        if (usage.method !== dominantMethod) {
          violations.push({
            type: 'inconsistent-method',
            file,
            line: usage.line,
            column: usage.column,
            endLine: usage.line,
            endColumn: usage.column + usage.matchedText.length,
            method: usage.method,
            issue: `Inconsistent HTTP method for ${operationType} operation. Most ${operationType} operations use ${dominantMethod}.`,
            suggestedFix: `Consider using ${dominantMethod} for consistency`,
            suggestedMethod: dominantMethod,
            lineContent: usage.context || '',
          });
        }
      }
    }
  }
  
  return violations;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze HTTP method patterns in a file
 */
export function analyzeHttpMethods(
  content: string,
  file: string
): HttpMethodAnalysis {
  // Skip excluded files
  if (shouldExcludeFile(file)) {
    return {
      methodUsages: [],
      violations: [],
      methodsUsed: new Set(),
      usesRestfulConventions: true,
      patternAdherenceConfidence: 1.0,
    };
  }
  
  // Detect all HTTP method usages
  const expressHandlers = detectExpressHandlers(content, file);
  const nextjsExports = detectNextjsMethodExports(content, file);
  const fetchUsages = detectFetchApiUsage(content, file);
  const axiosUsages = detectAxiosUsage(content, file);
  const httpClientUsages = detectHttpClientUsage(content, file);
  
  const methodUsages = [
    ...expressHandlers,
    ...nextjsExports,
    ...fetchUsages,
    ...axiosUsages,
    ...httpClientUsages,
  ];
  
  // Collect all methods used
  const methodsUsed = new Set<HttpMethod>();
  for (const usage of methodUsages) {
    methodsUsed.add(usage.method);
  }
  
  // Detect violations
  const postForReadViolations = detectPostForReadViolations(methodUsages, file);
  const getForMutationViolations = detectGetForMutationViolations(methodUsages, file);
  const putForPartialViolations = detectPutForPartialUpdateViolations(methodUsages, file);
  const inconsistentViolations = detectInconsistentMethodUsage(methodUsages, file);
  
  const violations = [
    ...postForReadViolations,
    ...getForMutationViolations,
    ...putForPartialViolations,
    ...inconsistentViolations,
  ];
  
  // Determine if file uses RESTful conventions
  const usesRestfulConventions = violations.length === 0 && methodUsages.length > 0;
  
  // Calculate confidence
  let patternAdherenceConfidence = 1.0;
  if (methodUsages.length > 0 && violations.length > 0) {
    patternAdherenceConfidence = Math.max(0, 1 - (violations.length / methodUsages.length));
  } else if (methodUsages.length === 0) {
    patternAdherenceConfidence = 0.5; // No HTTP methods detected
  }
  
  return {
    methodUsages,
    violations,
    methodsUsed,
    usesRestfulConventions,
    patternAdherenceConfidence,
  };
}

// ============================================================================
// HTTP Methods Detector Class
// ============================================================================

/**
 * Detector for HTTP method usage patterns
 *
 * Identifies HTTP method usage patterns and flags violations of RESTful conventions.
 *
 * @requirements 10.2 - THE API_Detector SHALL detect HTTP method usage patterns (POST vs PUT vs PATCH)
 */
export class HttpMethodsDetector extends RegexDetector {
  readonly id = 'api/http-methods';
  readonly category = 'api' as const;
  readonly subcategory = 'http-methods';
  readonly name = 'HTTP Methods Detector';
  readonly description = 'Detects HTTP method usage patterns and flags RESTful convention violations';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  /**
   * Detect HTTP method patterns and violations
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    // Analyze the file
    const analysis = analyzeHttpMethods(context.content, context.file);
    
    // Create pattern matches for method usages by type
    const patternTypes = new Set(analysis.methodUsages.map(u => u.type));
    for (const patternType of patternTypes) {
      const firstOfType = analysis.methodUsages.find(u => u.type === patternType);
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
    
    // Create pattern matches for each HTTP method used
    for (const method of analysis.methodsUsed) {
      const firstUsage = analysis.methodUsages.find(u => u.method === method);
      if (firstUsage) {
        patterns.push({
          patternId: `${this.id}/method-${method.toLowerCase()}`,
          location: {
            file: context.file,
            line: firstUsage.line,
            column: firstUsage.column,
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
   * Create a Violation from HttpMethodViolationInfo
   */
  private createViolation(info: HttpMethodViolationInfo): Violation {
    const severityMap: Record<HttpMethodViolationType, 'error' | 'warning' | 'info'> = {
      'post-for-read': 'warning',
      'get-for-mutation': 'error',
      'put-for-partial': 'info',
      'inconsistent-method': 'info',
      'missing-method-handler': 'info',
      'non-restful-method': 'warning',
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
      expected: info.suggestedMethod || 'Appropriate HTTP method',
      actual: info.method,
      aiExplainAvailable: true,
      aiFixAvailable: !!info.suggestedMethod,
      firstSeen: new Date(),
      occurrences: 1,
    };
    
    if (info.suggestedMethod) {
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
  private getExplanation(type: HttpMethodViolationType): string {
    const explanations: Record<HttpMethodViolationType, string> = {
      'post-for-read': 
        'GET requests are idempotent and cacheable, making them ideal for read operations. ' +
        'Using POST for reads prevents caching and violates REST conventions. ' +
        'Exception: Complex queries with large payloads may use POST.',
      'get-for-mutation': 
        'GET requests should be safe and idempotent - they should not modify server state. ' +
        'Using GET for mutations can cause unintended side effects from browser prefetching, ' +
        'link crawlers, and cached responses.',
      'put-for-partial': 
        'PUT is intended to replace an entire resource. For partial updates, use PATCH. ' +
        'This follows REST semantics and makes the API behavior more predictable.',
      'inconsistent-method': 
        'Using different HTTP methods for similar operations makes the API harder to understand. ' +
        'Consistent method usage improves API discoverability and reduces errors.',
      'missing-method-handler': 
        'Common CRUD operations should have corresponding HTTP method handlers. ' +
        'Missing handlers may indicate incomplete API implementation.',
      'non-restful-method': 
        'RESTful APIs use HTTP methods to indicate the action being performed. ' +
        'Using verbs in URLs or non-standard methods reduces API clarity.',
    };
    
    return explanations[type] || 'Follow RESTful HTTP method conventions for consistency.';
  }

  /**
   * Create a quick fix for a violation
   */
  private createQuickFixForViolation(info: HttpMethodViolationInfo): QuickFix | undefined {
    if (!info.suggestedMethod) {
      return undefined;
    }
    
    // Determine the replacement text based on the pattern
    const oldMethod = info.method.toLowerCase();
    const newMethod = info.suggestedMethod.toLowerCase();
    
    // Create a replacement that changes the method in the matched text
    const newText = info.lineContent.replace(
      new RegExp(`\\b${oldMethod}\\b`, 'i'),
      newMethod
    );
    
    return {
      title: `Change HTTP method from ${info.method} to ${info.suggestedMethod}`,
      kind: 'quickfix',
      edit: {
        changes: {
          [info.file]: [
            {
              range: {
                start: { line: info.line - 1, character: 0 },
                end: { line: info.line - 1, character: info.lineContent.length },
              },
              newText,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Replace '${info.method}' with '${info.suggestedMethod}'`,
    };
  }

  /**
   * Generate a quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Check if this is an HTTP method violation
    if (!violation.patternId.startsWith('api/http-methods')) {
      return null;
    }
    
    // Extract the suggested method from the expected field
    const suggestedMethod = violation.expected;
    if (!suggestedMethod || !HTTP_METHODS.includes(suggestedMethod as HttpMethod)) {
      return null;
    }
    
    return {
      title: `Change HTTP method to ${suggestedMethod}`,
      kind: 'quickfix',
      edit: {
        changes: {
          [violation.file]: [
            {
              range: violation.range,
              newText: suggestedMethod,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Replace '${violation.actual}' with '${suggestedMethod}'`,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new HttpMethodsDetector instance
 */
export function createHttpMethodsDetector(): HttpMethodsDetector {
  return new HttpMethodsDetector();
}
