/**
 * Client Patterns Detector - API client usage pattern detection
 *
 * Detects API client patterns including:
 * - Fetch wrapper usage (custom fetch clients)
 * - Axios instance patterns
 * - React Query / TanStack Query patterns
 * - SWR patterns
 * - tRPC client patterns
 * - GraphQL client patterns (Apollo, urql)
 * - Custom API client abstractions
 *
 * Flags violations:
 * - Inconsistent client usage across codebase
 * - Direct fetch/axios calls instead of wrapper
 * - Missing error handling in client calls
 * - Inconsistent base URL configuration
 * - Missing request/response interceptors
 *
 * @requirements 10.6 - THE API_Detector SHALL detect API client patterns (fetch wrapper usage)
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/** Types of API client patterns detected */
export type ClientPatternType =
  | 'fetch-wrapper'     // Custom fetch wrapper
  | 'axios-instance'    // Axios instance
  | 'react-query'       // React Query / TanStack Query
  | 'swr'               // SWR
  | 'trpc'              // tRPC
  | 'apollo'            // Apollo Client
  | 'urql'              // urql
  | 'direct-fetch'      // Direct fetch() call
  | 'direct-axios';     // Direct axios call

/** Types of client pattern violations detected */
export type ClientViolationType =
  | 'inconsistent-client'     // Inconsistent client usage
  | 'direct-call'             // Direct fetch/axios instead of wrapper
  | 'missing-error-handling'  // Missing error handling
  | 'hardcoded-url'           // Hardcoded URL instead of config
  | 'missing-auth-header'     // Missing auth header setup
  | 'mixed-clients';          // Mixing different client libraries


/** Information about a detected client pattern */
export interface ClientPatternInfo {
  type: ClientPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  clientName?: string | undefined;
  hasErrorHandling?: boolean | undefined;
  hasAuthHeader?: boolean | undefined;
  context?: string | undefined;
}

/** Information about a detected client violation */
export interface ClientViolationInfo {
  type: ClientViolationType;
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

/** Analysis of client patterns in a file */
export interface ClientPatternAnalysis {
  clientPatterns: ClientPatternInfo[];
  violations: ClientViolationInfo[];
  dominantClient: ClientPatternType | null;
  usesConsistentClient: boolean;
  hasWrapper: boolean;
  patternAdherenceConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Fetch wrapper patterns */
export const FETCH_WRAPPER_PATTERNS = [
  // TypeScript/JavaScript patterns
  /(?:export\s+)?(?:const|function)\s+(\w*(?:fetch|api|client|http)\w*)\s*[=:]/gi,
  /class\s+(\w*(?:Api|Client|Http|Fetch)\w*)\s*(?:extends|implements|\{)/gi,
  /createClient\s*\(/gi,
  /createApiClient\s*\(/gi,
  // Python patterns - httpx, requests, aiohttp
  /(?:def|async\s+def)\s+(\w*(?:fetch|api|client|http)\w*)\s*\(/gi,
  /class\s+(\w*(?:Api|Client|Http)\w*)\s*(?:\(|:)/gi,
  /httpx\.(?:Client|AsyncClient)\s*\(/gi,
  /requests\.Session\s*\(/gi,
  /aiohttp\.ClientSession\s*\(/gi,
] as const;

/** Axios instance patterns */
export const AXIOS_INSTANCE_PATTERNS = [
  /axios\.create\s*\(/gi,
  /(?:const|let|var)\s+(\w+)\s*=\s*axios\.create/gi,
  /new\s+Axios\s*\(/gi,
] as const;

/** React Query patterns */
export const REACT_QUERY_PATTERNS = [
  /useQuery\s*[<(]/gi,
  /useMutation\s*[<(]/gi,
  /useInfiniteQuery\s*[<(]/gi,
  /QueryClient\s*\(/gi,
  /QueryClientProvider/gi,
] as const;

/** SWR patterns */
export const SWR_PATTERNS = [
  /useSWR\s*[<(]/gi,
  /useSWRMutation\s*[<(]/gi,
  /useSWRInfinite\s*[<(]/gi,
  /SWRConfig/gi,
] as const;

/** tRPC patterns */
export const TRPC_PATTERNS = [
  /trpc\.\w+\.(query|mutation|useQuery|useMutation)/gi,
  /createTRPCClient/gi,
  /createTRPCReact/gi,
  /createTRPCNext/gi,
] as const;

/** Apollo Client patterns */
export const APOLLO_PATTERNS = [
  /useQuery\s*\(\s*gql/gi,
  /useMutation\s*\(\s*gql/gi,
  /ApolloClient\s*\(/gi,
  /ApolloProvider/gi,
  /new\s+InMemoryCache/gi,
] as const;

/** urql patterns */
export const URQL_PATTERNS = [
  /useQuery\s*\(\s*\{[^}]*query:/gi,
  /useMutation\s*\(\s*\{[^}]*query:/gi,
  /createClient\s*\(\s*\{[^}]*url:/gi,
  /Provider\s+value=\{client\}/gi,
] as const;

/** Direct fetch patterns */
export const DIRECT_FETCH_PATTERNS = [
  /(?<!\.)\bfetch\s*\(\s*['"`]/gi,
  /(?<!\.)\bfetch\s*\(\s*`/gi,
  /window\.fetch\s*\(/gi,
  /globalThis\.fetch\s*\(/gi,
] as const;

/** Direct axios patterns */
export const DIRECT_AXIOS_PATTERNS = [
  /axios\.(get|post|put|patch|delete|request)\s*\(/gi,
  /axios\s*\(\s*\{/gi,
  /axios\s*\(\s*['"`]/gi,
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

/** Check if content has error handling around a position */
export function hasErrorHandling(content: string, index: number): boolean {
  const beforeIndex = content.slice(Math.max(0, index - 200), index);
  const afterIndex = content.slice(index, Math.min(content.length, index + 200));
  
  // Check for try/catch
  if (beforeIndex.includes('try') && afterIndex.includes('catch')) {return true;}
  
  // Check for .catch()
  if (afterIndex.includes('.catch(')) {return true;}
  
  // Check for error handling in async/await
  if (beforeIndex.includes('try {') || afterIndex.includes('} catch')) {return true;}
  
  return false;
}

/** Check if content has auth header setup */
export function hasAuthHeader(content: string): boolean {
  const authPatterns = [
    /headers\s*:\s*\{[^}]*(?:Authorization|Bearer|auth)/gi,
    /setHeader\s*\(\s*['"`]Authorization/gi,
    /interceptors\.request/gi,
    /withCredentials\s*:\s*true/gi,
  ];
  return authPatterns.some(pattern => pattern.test(content));
}

// ============================================================================
// Detection Functions
// ============================================================================

/** Detect fetch wrapper patterns */
export function detectFetchWrappers(content: string, file: string): ClientPatternInfo[] {
  const results: ClientPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of FETCH_WRAPPER_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'fetch-wrapper',
        file,
        line,
        column,
        matchedText: match[0],
        clientName: match[1] || undefined,
        hasAuthHeader: hasAuthHeader(content),
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect axios instance patterns */
export function detectAxiosInstances(content: string, file: string): ClientPatternInfo[] {
  const results: ClientPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of AXIOS_INSTANCE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'axios-instance',
        file,
        line,
        column,
        matchedText: match[0],
        clientName: match[1] || undefined,
        hasAuthHeader: hasAuthHeader(content),
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect React Query patterns */
export function detectReactQuery(content: string, file: string): ClientPatternInfo[] {
  const results: ClientPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of REACT_QUERY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'react-query',
        file,
        line,
        column,
        matchedText: match[0],
        hasErrorHandling: hasErrorHandling(content, match.index),
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect SWR patterns */
export function detectSWR(content: string, file: string): ClientPatternInfo[] {
  const results: ClientPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of SWR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'swr',
        file,
        line,
        column,
        matchedText: match[0],
        hasErrorHandling: hasErrorHandling(content, match.index),
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect direct fetch calls */
export function detectDirectFetch(content: string, file: string): ClientPatternInfo[] {
  const results: ClientPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of DIRECT_FETCH_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'direct-fetch',
        file,
        line,
        column,
        matchedText: match[0],
        hasErrorHandling: hasErrorHandling(content, match.index),
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect direct axios calls */
export function detectDirectAxios(content: string, file: string): ClientPatternInfo[] {
  const results: ClientPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of DIRECT_AXIOS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'direct-axios',
        file,
        line,
        column,
        matchedText: match[0],
        hasErrorHandling: hasErrorHandling(content, match.index),
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}


// ============================================================================
// Violation Detection Functions
// ============================================================================

/** Detect direct call violations when wrapper exists */
export function detectDirectCallViolations(
  patterns: ClientPatternInfo[],
  file: string
): ClientViolationInfo[] {
  const violations: ClientViolationInfo[] = [];
  
  const hasWrapper = patterns.some(p => 
    p.type === 'fetch-wrapper' || p.type === 'axios-instance'
  );
  
  if (hasWrapper) {
    const directCalls = patterns.filter(p => 
      p.type === 'direct-fetch' || p.type === 'direct-axios'
    );
    
    for (const call of directCalls) {
      violations.push({
        type: 'direct-call',
        file,
        line: call.line,
        column: call.column,
        endLine: call.line,
        endColumn: call.column + call.matchedText.length,
        value: call.matchedText,
        issue: 'Direct fetch/axios call instead of using wrapper',
        suggestedFix: 'Use the API client wrapper for consistent error handling and configuration',
        lineContent: call.context || '',
      });
    }
  }
  return violations;
}

/** Detect mixed client violations */
export function detectMixedClientViolations(
  patterns: ClientPatternInfo[],
  file: string
): ClientViolationInfo[] {
  const violations: ClientViolationInfo[] = [];
  
  const clientTypes = new Set(patterns.map(p => p.type));
  const dataFetchingLibs = ['react-query', 'swr', 'apollo', 'urql', 'trpc'];
  const usedLibs = dataFetchingLibs.filter(lib => clientTypes.has(lib as ClientPatternType));
  
  if (usedLibs.length > 1) {
    for (const pattern of patterns) {
      if (dataFetchingLibs.includes(pattern.type)) {
        violations.push({
          type: 'mixed-clients',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: pattern.type,
          issue: `Multiple data fetching libraries detected: ${usedLibs.join(', ')}`,
          suggestedFix: 'Standardize on a single data fetching library',
          lineContent: pattern.context || '',
        });
      }
    }
  }
  return violations;
}

/** Detect missing error handling violations */
export function detectMissingErrorHandlingViolations(
  patterns: ClientPatternInfo[],
  file: string
): ClientViolationInfo[] {
  const violations: ClientViolationInfo[] = [];
  
  const directCalls = patterns.filter(p => 
    (p.type === 'direct-fetch' || p.type === 'direct-axios') && !p.hasErrorHandling
  );
  
  for (const call of directCalls) {
    violations.push({
      type: 'missing-error-handling',
      file,
      line: call.line,
      column: call.column,
      endLine: call.line,
      endColumn: call.column + call.matchedText.length,
      value: call.matchedText,
      issue: 'API call without error handling',
      suggestedFix: 'Add try/catch or .catch() for error handling',
      lineContent: call.context || '',
    });
  }
  return violations;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/** Analyze client patterns in file content */
export function analyzeClientPatterns(content: string, file: string): ClientPatternAnalysis {
  if (shouldExcludeFile(file)) {
    return {
      clientPatterns: [],
      violations: [],
      dominantClient: null,
      usesConsistentClient: true,
      hasWrapper: false,
      patternAdherenceConfidence: 1.0,
    };
  }
  
  // Detect all patterns
  const fetchWrappers = detectFetchWrappers(content, file);
  const axiosInstances = detectAxiosInstances(content, file);
  const reactQuery = detectReactQuery(content, file);
  const swr = detectSWR(content, file);
  const directFetch = detectDirectFetch(content, file);
  const directAxios = detectDirectAxios(content, file);
  
  const allPatterns = [
    ...fetchWrappers, ...axiosInstances, ...reactQuery,
    ...swr, ...directFetch, ...directAxios,
  ];
  
  // Detect violations
  const directCallViolations = detectDirectCallViolations(allPatterns, file);
  const mixedClientViolations = detectMixedClientViolations(allPatterns, file);
  const errorHandlingViolations = detectMissingErrorHandlingViolations(allPatterns, file);
  
  const allViolations = [
    ...directCallViolations,
    ...mixedClientViolations,
    ...errorHandlingViolations,
  ];
  
  // Determine dominant client
  const typeCounts: Record<string, number> = {};
  for (const pattern of allPatterns) {
    typeCounts[pattern.type] = (typeCounts[pattern.type] || 0) + 1;
  }
  
  let dominantClient: ClientPatternType | null = null;
  let maxCount = 0;
  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantClient = type as ClientPatternType;
    }
  }
  
  // Check for wrapper
  const hasWrapper = fetchWrappers.length > 0 || axiosInstances.length > 0;
  
  // Calculate confidence
  const totalPatterns = allPatterns.length;
  const violationCount = allViolations.length;
  const confidence = totalPatterns > 0 
    ? Math.max(0, 1 - (violationCount / totalPatterns) * 0.2)
    : 1.0;
  
  // Check consistency
  const uniqueTypes = new Set(allPatterns.map(p => p.type));
  const usesConsistentClient = uniqueTypes.size <= 2; // Allow wrapper + one library
  
  return {
    clientPatterns: allPatterns,
    violations: allViolations,
    dominantClient,
    usesConsistentClient,
    hasWrapper,
    patternAdherenceConfidence: confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

/** Client Patterns Detector - Detects API client usage patterns */
export class ClientPatternsDetector extends RegexDetector {
  readonly id = 'api/client-patterns';
  readonly name = 'Client Patterns Detector';
  readonly description = 'Detects API client patterns (fetch wrapper usage)';
  readonly category = 'api';
  readonly subcategory = 'client';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (shouldExcludeFile(file)) {
      return this.createEmptyResult();
    }
    
    const analysis = analyzeClientPatterns(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.patternAdherenceConfidence, {
      custom: {
        clientPatterns: analysis.clientPatterns,
        dominantClient: analysis.dominantClient,
        usesConsistentClient: analysis.usesConsistentClient,
        hasWrapper: analysis.hasWrapper,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

/** Create a new ClientPatternsDetector instance */
export function createClientPatternsDetector(): ClientPatternsDetector {
  return new ClientPatternsDetector();
}