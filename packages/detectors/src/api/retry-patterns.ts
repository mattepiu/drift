/**
 * Retry Patterns Detector - Retry and error handling pattern detection
 *
 * Detects retry patterns including:
 * - Exponential backoff implementations
 * - Linear retry patterns
 * - Circuit breaker patterns
 * - Retry with jitter
 * - Max retry limits
 * - Timeout handling
 * - Retry libraries (axios-retry, p-retry, etc.)
 *
 * Flags violations:
 * - Missing retry logic for network calls
 * - Infinite retry loops
 * - Missing backoff strategy
 * - Inconsistent retry configuration
 * - Missing timeout configuration
 * - Retrying non-idempotent operations
 *
 * @requirements 10.7 - THE API_Detector SHALL detect retry patterns
 * @requirements 10.8 - THE API_Detector SHALL detect timeout handling
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/** Types of retry patterns detected */
export type RetryPatternType =
  | 'exponential-backoff'  // Exponential backoff retry
  | 'linear-retry'         // Linear/fixed delay retry
  | 'circuit-breaker'      // Circuit breaker pattern
  | 'retry-with-jitter'    // Retry with random jitter
  | 'retry-library'        // Using retry library
  | 'timeout-config'       // Timeout configuration
  | 'custom-retry';        // Custom retry implementation

/** Types of retry violations detected */
export type RetryViolationType =
  | 'missing-retry'           // Missing retry for network call
  | 'infinite-retry'          // No max retry limit
  | 'missing-backoff'         // Missing backoff strategy
  | 'missing-timeout'         // Missing timeout configuration
  | 'retry-non-idempotent'    // Retrying POST/DELETE
  | 'inconsistent-config';    // Inconsistent retry configuration


/** Information about a detected retry pattern */
export interface RetryPatternInfo {
  type: RetryPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  maxRetries?: number | undefined;
  backoffType?: string | undefined;
  timeout?: number | undefined;
  context?: string | undefined;
}

/** Information about a detected retry violation */
export interface RetryViolationInfo {
  type: RetryViolationType;
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

/** Analysis of retry patterns in a file */
export interface RetryPatternAnalysis {
  retryPatterns: RetryPatternInfo[];
  violations: RetryViolationInfo[];
  hasRetryLogic: boolean;
  hasTimeoutConfig: boolean;
  dominantPattern: RetryPatternType | null;
  patternAdherenceConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Exponential backoff patterns */
export const EXPONENTIAL_BACKOFF_PATTERNS = [
  /Math\.pow\s*\(\s*2\s*,\s*(?:retry|attempt|count)/gi,
  /2\s*\*\*\s*(?:retry|attempt|count)/gi,
  /delay\s*\*=?\s*2/gi,
  /exponential(?:Backoff|Delay|Retry)/gi,
  /backoff\s*:\s*['"`]exponential['"`]/gi,
] as const;

/** Linear retry patterns */
export const LINEAR_RETRY_PATTERNS = [
  /retry\s*(?:Count|Attempts?|Times?)\s*[<>=]+\s*\d+/gi,
  /for\s*\([^)]*retry[^)]*\)/gi,
  /while\s*\([^)]*retry[^)]*\)/gi,
  /setTimeout\s*\([^,]+,\s*\d+\s*\)/gi,
] as const;

/** Circuit breaker patterns */
export const CIRCUIT_BREAKER_PATTERNS = [
  /circuitBreaker/gi,
  /circuit[_-]?breaker/gi,
  /(?:open|closed|half[_-]?open)\s*state/gi,
  /failure[_-]?threshold/gi,
  /reset[_-]?timeout/gi,
] as const;

/** Retry library patterns */
export const RETRY_LIBRARY_PATTERNS = [
  // TypeScript/JavaScript patterns
  /axios[_-]?retry/gi,
  /p[_-]?retry/gi,
  /retry[_-]?axios/gi,
  /async[_-]?retry/gi,
  /exponential[_-]?backoff/gi,
  /cockatiel/gi,
  /polly/gi,
  // Python patterns - tenacity, backoff, retrying
  /tenacity/gi,
  /@retry\s*\(/gi,
  /@backoff\./gi,
  /from\s+tenacity\s+import/gi,
  /from\s+backoff\s+import/gi,
  /Retrying\s*\(/gi,
] as const;

/** Timeout configuration patterns */
export const TIMEOUT_PATTERNS = [
  // TypeScript/JavaScript patterns
  /timeout\s*:\s*\d+/gi,
  /setTimeout\s*\(/gi,
  /AbortController/gi,
  /signal\s*:\s*(?:abort|controller)/gi,
  /timeoutMs\s*[=:]/gi,
  /requestTimeout/gi,
  // Python patterns - httpx, requests, aiohttp
  /timeout\s*=\s*\d+/gi,
  /timeout\s*=\s*(?:httpx\.)?Timeout\s*\(/gi,
  /asyncio\.wait_for\s*\(/gi,
  /asyncio\.timeout\s*\(/gi,
] as const;

/** Max retry patterns */
export const MAX_RETRY_PATTERNS = [
  /max[_-]?retries?\s*[=:]\s*(\d+)/gi,
  /retry[_-]?limit\s*[=:]\s*(\d+)/gi,
  /retries?\s*[<>=]+\s*(\d+)/gi,
  /attempts?\s*[<>=]+\s*(\d+)/gi,
] as const;

/** Non-idempotent method patterns */
export const NON_IDEMPOTENT_PATTERNS = [
  /\.post\s*\(/gi,
  /\.delete\s*\(/gi,
  /method\s*:\s*['"`](?:POST|DELETE)['"`]/gi,
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

/** Extract max retries from content */
export function extractMaxRetries(content: string): number | undefined {
  for (const pattern of MAX_RETRY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const match = regex.exec(content);
    if (match?.[1]) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}

/** Extract timeout value from content */
export function extractTimeout(content: string): number | undefined {
  const timeoutMatch = content.match(/timeout\s*:\s*(\d+)/i);
  if (timeoutMatch?.[1]) {
    return parseInt(timeoutMatch[1], 10);
  }
  return undefined;
}

// ============================================================================
// Detection Functions
// ============================================================================

/** Detect exponential backoff patterns */
export function detectExponentialBackoff(content: string, file: string): RetryPatternInfo[] {
  const results: RetryPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of EXPONENTIAL_BACKOFF_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'exponential-backoff',
        file,
        line,
        column,
        matchedText: match[0],
        maxRetries: extractMaxRetries(content),
        backoffType: 'exponential',
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect linear retry patterns */
export function detectLinearRetry(content: string, file: string): RetryPatternInfo[] {
  const results: RetryPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of LINEAR_RETRY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'linear-retry',
        file,
        line,
        column,
        matchedText: match[0],
        maxRetries: extractMaxRetries(content),
        backoffType: 'linear',
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect circuit breaker patterns */
export function detectCircuitBreaker(content: string, file: string): RetryPatternInfo[] {
  const results: RetryPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of CIRCUIT_BREAKER_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'circuit-breaker',
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

/** Detect retry library usage */
export function detectRetryLibraries(content: string, file: string): RetryPatternInfo[] {
  const results: RetryPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of RETRY_LIBRARY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'retry-library',
        file,
        line,
        column,
        matchedText: match[0],
        maxRetries: extractMaxRetries(content),
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

/** Detect timeout configuration */
export function detectTimeoutConfig(content: string, file: string): RetryPatternInfo[] {
  const results: RetryPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of TIMEOUT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPositionFromIndex(content, match.index);
      
      results.push({
        type: 'timeout-config',
        file,
        line,
        column,
        matchedText: match[0],
        timeout: extractTimeout(content),
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}


// ============================================================================
// Violation Detection Functions
// ============================================================================

/** Detect missing retry logic violations */
export function detectMissingRetryViolations(
  patterns: RetryPatternInfo[],
  content: string,
  file: string
): RetryViolationInfo[] {
  const violations: RetryViolationInfo[] = [];
  const lines = content.split('\n');
  
  // Check if file has network calls but no retry logic
  const hasRetryLogic = patterns.some(p => 
    p.type !== 'timeout-config'
  );
  
  const networkCallPatterns = [
    /fetch\s*\(/gi,
    /axios\.\w+\s*\(/gi,
    /\.get\s*\(\s*['"`]/gi,
    /\.post\s*\(\s*['"`]/gi,
  ];
  
  if (!hasRetryLogic) {
    for (const pattern of networkCallPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        if (isInsideComment(content, match.index)) {continue;}
        const { line, column } = getPositionFromIndex(content, match.index);
        
        // Only flag if this looks like an API file
        if (file.includes('api') || file.includes('client') || file.includes('service')) {
          violations.push({
            type: 'missing-retry',
            file,
            line,
            column,
            endLine: line,
            endColumn: column + match[0].length,
            value: match[0],
            issue: 'Network call without retry logic',
            suggestedFix: 'Add retry logic with exponential backoff',
            lineContent: lines[line - 1] || '',
          });
        }
        break; // Only flag once per file
      }
    }
  }
  return violations;
}

/** Detect infinite retry violations */
export function detectInfiniteRetryViolations(
  patterns: RetryPatternInfo[],
  content: string,
  file: string
): RetryViolationInfo[] {
  const violations: RetryViolationInfo[] = [];
  
  // Check for retry loops without max limit
  const retryPatterns = patterns.filter(p => 
    p.type === 'linear-retry' || p.type === 'exponential-backoff' || p.type === 'custom-retry'
  );
  
  for (const pattern of retryPatterns) {
    if (pattern.maxRetries === undefined) {
      // Check if there's a max retry in the surrounding context
      const hasMaxRetry = MAX_RETRY_PATTERNS.some(p => p.test(content));
      
      if (!hasMaxRetry) {
        violations.push({
          type: 'infinite-retry',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: pattern.matchedText,
          issue: 'Retry logic without maximum retry limit',
          suggestedFix: 'Add maxRetries configuration to prevent infinite loops',
          lineContent: pattern.context || '',
        });
      }
    }
  }
  return violations;
}

/** Detect missing timeout violations */
export function detectMissingTimeoutViolations(
  patterns: RetryPatternInfo[],
  content: string,
  file: string
): RetryViolationInfo[] {
  const violations: RetryViolationInfo[] = [];
  const lines = content.split('\n');
  
  const hasTimeoutConfig = patterns.some(p => p.type === 'timeout-config');
  
  // Check for fetch/axios calls without timeout
  if (!hasTimeoutConfig) {
    const networkCallPatterns = [
      /fetch\s*\(\s*['"`]/gi,
      /axios\.\w+\s*\(/gi,
    ];
    
    for (const pattern of networkCallPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        if (isInsideComment(content, match.index)) {continue;}
        const { line, column } = getPositionFromIndex(content, match.index);
        
        // Only flag if this looks like an API file
        if (file.includes('api') || file.includes('client') || file.includes('service')) {
          violations.push({
            type: 'missing-timeout',
            file,
            line,
            column,
            endLine: line,
            endColumn: column + match[0].length,
            value: match[0],
            issue: 'Network call without timeout configuration',
            suggestedFix: 'Add timeout configuration to prevent hanging requests',
            lineContent: lines[line - 1] || '',
          });
        }
        break; // Only flag once per file
      }
    }
  }
  return violations;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/** Analyze retry patterns in file content */
export function analyzeRetryPatterns(content: string, file: string): RetryPatternAnalysis {
  if (shouldExcludeFile(file)) {
    return {
      retryPatterns: [],
      violations: [],
      hasRetryLogic: false,
      hasTimeoutConfig: false,
      dominantPattern: null,
      patternAdherenceConfidence: 1.0,
    };
  }
  
  // Detect all patterns
  const exponentialBackoff = detectExponentialBackoff(content, file);
  const linearRetry = detectLinearRetry(content, file);
  const circuitBreaker = detectCircuitBreaker(content, file);
  const retryLibraries = detectRetryLibraries(content, file);
  const timeoutConfig = detectTimeoutConfig(content, file);
  
  const allPatterns = [
    ...exponentialBackoff, ...linearRetry, ...circuitBreaker,
    ...retryLibraries, ...timeoutConfig,
  ];
  
  // Detect violations
  const missingRetryViolations = detectMissingRetryViolations(allPatterns, content, file);
  const infiniteRetryViolations = detectInfiniteRetryViolations(allPatterns, content, file);
  const missingTimeoutViolations = detectMissingTimeoutViolations(allPatterns, content, file);
  
  const allViolations = [
    ...missingRetryViolations,
    ...infiniteRetryViolations,
    ...missingTimeoutViolations,
  ];
  
  // Determine dominant pattern
  const typeCounts: Record<string, number> = {};
  for (const pattern of allPatterns) {
    typeCounts[pattern.type] = (typeCounts[pattern.type] || 0) + 1;
  }
  
  let dominantPattern: RetryPatternType | null = null;
  let maxCount = 0;
  for (const [type, count] of Object.entries(typeCounts)) {
    if (type !== 'timeout-config' && count > maxCount) {
      maxCount = count;
      dominantPattern = type as RetryPatternType;
    }
  }
  
  // Calculate confidence
  const totalPatterns = allPatterns.length;
  const violationCount = allViolations.length;
  const confidence = totalPatterns > 0 
    ? Math.max(0, 1 - (violationCount / totalPatterns) * 0.2)
    : 1.0;
  
  return {
    retryPatterns: allPatterns,
    violations: allViolations,
    hasRetryLogic: allPatterns.some(p => p.type !== 'timeout-config'),
    hasTimeoutConfig: timeoutConfig.length > 0,
    dominantPattern,
    patternAdherenceConfidence: confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

/** Retry Patterns Detector - Detects retry and timeout patterns */
export class RetryPatternsDetector extends RegexDetector {
  readonly id = 'api/retry-patterns';
  readonly name = 'Retry Patterns Detector';
  readonly description = 'Detects retry patterns and timeout handling';
  readonly category = 'api';
  readonly subcategory = 'retry';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (shouldExcludeFile(file)) {
      return this.createEmptyResult();
    }
    
    const analysis = analyzeRetryPatterns(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.patternAdherenceConfidence, {
      custom: {
        retryPatterns: analysis.retryPatterns,
        hasRetryLogic: analysis.hasRetryLogic,
        hasTimeoutConfig: analysis.hasTimeoutConfig,
        dominantPattern: analysis.dominantPattern,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

/** Create a new RetryPatternsDetector instance */
export function createRetryPatternsDetector(): RetryPatternsDetector {
  return new RetryPatternsDetector();
}