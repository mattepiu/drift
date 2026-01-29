/**
 * Error Propagation Detector - Error bubbling pattern detection
 *
 * Detects error propagation patterns including:
 * - Error re-throwing patterns
 * - Error wrapping patterns
 * - Error transformation patterns
 * - Error chain preservation
 *
 * Flags violations:
 * - Lost error context
 * - Missing cause chain
 * - Inconsistent propagation
 *
 * @requirements 12.4 - Error propagation patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type PropagationPatternType =
  | 'rethrow'           // throw error
  | 'wrap-rethrow'      // throw new Error(msg, { cause })
  | 'transform'         // throw new CustomError(error)
  | 'chain-preserve';   // Preserving error chain

export type PropagationViolationType =
  | 'lost-context'        // Error context lost
  | 'missing-cause'       // Missing cause in wrapped error
  | 'swallowed-error';    // Error caught but not propagated

export interface PropagationPatternInfo {
  type: PropagationPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  preservesCause?: boolean;
  context?: string;
}

export interface PropagationViolationInfo {
  type: PropagationViolationType;
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

export interface PropagationAnalysis {
  patterns: PropagationPatternInfo[];
  violations: PropagationViolationInfo[];
  hasRethrow: boolean;
  preservesCause: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const RETHROW_PATTERNS = [
  // JavaScript/TypeScript
  /throw\s+\w+;/gi,
  /throw\s+error;/gi,
  /throw\s+err;/gi,
  /throw\s+e;/gi,
  // Python
  /raise\s+\w+\s*$/gim,
  /raise\s+e\s*$/gim,
  /raise\s*$/gim,  // bare raise
] as const;

export const WRAP_RETHROW_PATTERNS = [
  // JavaScript/TypeScript
  /throw\s+new\s+\w+Error\s*\([^)]*,\s*\{\s*cause/gi,
  /throw\s+new\s+\w+\s*\([^)]*,\s*\{\s*cause/gi,
  /throw\s+new\s+Error\s*\([^)]*,\s*\{\s*cause/gi,
  // Python - raise from
  /raise\s+\w+\s*\([^)]*\)\s+from\s+\w+/gi,
] as const;

export const TRANSFORM_PATTERNS = [
  // JavaScript/TypeScript
  /throw\s+new\s+\w+Error\s*\(\s*\w+\.message/gi,
  /throw\s+new\s+\w+\s*\(\s*\w+\.message/gi,
  /throw\s+\w+Error\.from\s*\(/gi,
  // Python
  /raise\s+\w+\s*\(\s*str\s*\(\s*\w+\s*\)/gi,
] as const;

export const CHAIN_PRESERVE_PATTERNS = [
  // JavaScript/TypeScript
  /cause\s*:\s*\w+/gi,
  /\.cause\s*=\s*\w+/gi,
  /originalError\s*:\s*\w+/gi,
  /innerException\s*:\s*\w+/gi,
  // Python
  /from\s+\w+\s*$/gim,
  /__cause__\s*=/gi,
  /original_error\s*=/gi,
] as const;

export const LOST_CONTEXT_PATTERNS = [
  // JavaScript/TypeScript
  /catch\s*\([^)]*\)\s*\{[^}]*throw\s+new\s+Error\s*\(\s*['"`][^'"]+['"`]\s*\)/gi,
  // Python - raise without from
  /except[^:]*:\s*\n[^r]*raise\s+\w+\s*\([^)]*\)\s*(?!from)/gi,
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

export function detectRethrowPatterns(content: string, file: string): PropagationPatternInfo[] {
  const results: PropagationPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of RETHROW_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'rethrow',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectWrapRethrowPatterns(content: string, file: string): PropagationPatternInfo[] {
  const results: PropagationPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of WRAP_RETHROW_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'wrap-rethrow',
        file, line, column,
        matchedText: match[0],
        preservesCause: true,
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectTransformPatterns(content: string, file: string): PropagationPatternInfo[] {
  const results: PropagationPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of TRANSFORM_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'transform',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectChainPreservePatterns(content: string, file: string): PropagationPatternInfo[] {
  const results: PropagationPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of CHAIN_PRESERVE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'chain-preserve',
        file, line, column,
        matchedText: match[0],
        preservesCause: true,
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectLostContextViolations(content: string, file: string): PropagationViolationInfo[] {
  const violations: PropagationViolationInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of LOST_CONTEXT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      violations.push({
        type: 'lost-context',
        file, line, column,
        endLine: line,
        endColumn: column + match[0].length,
        value: match[0].slice(0, 50) + '...',
        issue: 'Error context lost when re-throwing',
        suggestedFix: 'Include original error as cause: { cause: error }',
        lineContent: lines[line - 1] || '',
      });
    }
  }
  return violations;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export function analyzeErrorPropagation(content: string, file: string): PropagationAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], hasRethrow: false, preservesCause: false, confidence: 1.0 };
  }
  
  const rethrow = detectRethrowPatterns(content, file);
  const wrapRethrow = detectWrapRethrowPatterns(content, file);
  const transform = detectTransformPatterns(content, file);
  const chainPreserve = detectChainPreservePatterns(content, file);
  
  const allPatterns = [...rethrow, ...wrapRethrow, ...transform, ...chainPreserve];
  const violations = detectLostContextViolations(content, file);
  
  const confidence = allPatterns.length > 0 ? Math.max(0.5, 1 - violations.length * 0.1) : 1.0;
  
  return {
    patterns: allPatterns,
    violations,
    hasRethrow: rethrow.length > 0,
    preservesCause: wrapRethrow.length > 0 || chainPreserve.length > 0,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class ErrorPropagationDetector extends RegexDetector {
  readonly id = 'errors/error-propagation';
  readonly name = 'Error Propagation Detector';
  readonly description = 'Detects error propagation and bubbling patterns';
  readonly category = 'errors';
  readonly subcategory = 'propagation';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeErrorPropagation(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasRethrow: analysis.hasRethrow,
        preservesCause: analysis.preservesCause,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createErrorPropagationDetector(): ErrorPropagationDetector {
  return new ErrorPropagationDetector();
}
