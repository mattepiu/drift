/**
 * Circuit Breaker Detector - Circuit breaker pattern detection
 *
 * Detects circuit breaker patterns including:
 * - Circuit breaker implementations
 * - State management (open/closed/half-open)
 * - Failure threshold configuration
 * - Reset timeout patterns
 *
 * @requirements 12.6 - Circuit breaker patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type CircuitBreakerPatternType =
  | 'circuit-breaker-class'   // CircuitBreaker class
  | 'circuit-breaker-lib'     // Library usage
  | 'state-management'        // State tracking
  | 'failure-threshold'       // Threshold config
  | 'reset-timeout';          // Reset timeout

export interface CircuitBreakerPatternInfo {
  type: CircuitBreakerPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  context?: string;
}

export interface CircuitBreakerAnalysis {
  patterns: CircuitBreakerPatternInfo[];
  hasCircuitBreaker: boolean;
  hasStateManagement: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const CIRCUIT_BREAKER_CLASS_PATTERNS = [
  // JavaScript/TypeScript
  /class\s+CircuitBreaker/gi,
  /class\s+\w*Breaker\s+/gi,
  /new\s+CircuitBreaker\s*\(/gi,
  // Python
  /class\s+CircuitBreaker\s*\(/gi,
  /CircuitBreaker\s*\(\s*\)/gi,
] as const;

export const CIRCUIT_BREAKER_LIB_PATTERNS = [
  // JavaScript/TypeScript
  /cockatiel/gi,
  /opossum/gi,
  /brakes/gi,
  /circuit-breaker/gi,
  /circuitBreaker/gi,
  // Python
  /pybreaker/gi,
  /circuitbreaker/gi,
  /from\s+circuitbreaker\s+import/gi,
] as const;

export const STATE_MANAGEMENT_PATTERNS = [
  // Both languages
  /(?:state|status)\s*[=:]\s*['"`](?:open|closed|half[_-]?open)['"`]/gi,
  /isOpen|isClosed|isHalfOpen/gi,
  /CircuitState\./gi,
  /BreakerState\./gi,
  // Python
  /is_open|is_closed|is_half_open/gi,
  /circuit_state/gi,
] as const;

export const FAILURE_THRESHOLD_PATTERNS = [
  // Both languages
  /failureThreshold\s*[=:]/gi,
  /threshold\s*[=:]\s*\d+/gi,
  /maxFailures\s*[=:]/gi,
  /failureCount/gi,
  // Python
  /failure_threshold\s*[=:]/gi,
  /max_failures\s*[=:]/gi,
  /failure_count/gi,
] as const;

export const RESET_TIMEOUT_PATTERNS = [
  // Both languages
  /resetTimeout\s*[=:]/gi,
  /cooldownPeriod\s*[=:]/gi,
  /recoveryTime\s*[=:]/gi,
  /halfOpenAfter\s*[=:]/gi,
  // Python
  /reset_timeout\s*[=:]/gi,
  /cooldown_period\s*[=:]/gi,
  /recovery_time\s*[=:]/gi,
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

export function detectCircuitBreakerClasses(content: string, file: string): CircuitBreakerPatternInfo[] {
  const results: CircuitBreakerPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of CIRCUIT_BREAKER_CLASS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'circuit-breaker-class',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectCircuitBreakerLibs(content: string, file: string): CircuitBreakerPatternInfo[] {
  const results: CircuitBreakerPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of CIRCUIT_BREAKER_LIB_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'circuit-breaker-lib',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectStateManagement(content: string, file: string): CircuitBreakerPatternInfo[] {
  const results: CircuitBreakerPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of STATE_MANAGEMENT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'state-management',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectFailureThreshold(content: string, file: string): CircuitBreakerPatternInfo[] {
  const results: CircuitBreakerPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of FAILURE_THRESHOLD_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'failure-threshold',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectResetTimeout(content: string, file: string): CircuitBreakerPatternInfo[] {
  const results: CircuitBreakerPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of RESET_TIMEOUT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'reset-timeout',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export function analyzeCircuitBreaker(content: string, file: string): CircuitBreakerAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], hasCircuitBreaker: false, hasStateManagement: false, confidence: 1.0 };
  }
  
  const classes = detectCircuitBreakerClasses(content, file);
  const libs = detectCircuitBreakerLibs(content, file);
  const state = detectStateManagement(content, file);
  const threshold = detectFailureThreshold(content, file);
  const timeout = detectResetTimeout(content, file);
  
  const allPatterns = [...classes, ...libs, ...state, ...threshold, ...timeout];
  
  const confidence = allPatterns.length > 0 ? 0.85 : 1.0;
  
  return {
    patterns: allPatterns,
    hasCircuitBreaker: classes.length > 0 || libs.length > 0,
    hasStateManagement: state.length > 0,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class CircuitBreakerDetector extends RegexDetector {
  readonly id = 'errors/circuit-breaker';
  readonly name = 'Circuit Breaker Detector';
  readonly description = 'Detects circuit breaker patterns';
  readonly category = 'errors';
  readonly subcategory = 'resilience';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeCircuitBreaker(content, file);
    
    return this.createResult([], [], analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasCircuitBreaker: analysis.hasCircuitBreaker,
        hasStateManagement: analysis.hasStateManagement,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createCircuitBreakerDetector(): CircuitBreakerDetector {
  return new CircuitBreakerDetector();
}
