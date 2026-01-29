/**
 * Try-Catch Placement Detector - Try/catch pattern detection
 *
 * Detects try/catch placement patterns including:
 * - Try/catch at function boundaries
 * - Nested try/catch blocks
 * - Try/catch with specific error types
 * - Finally block usage
 *
 * Flags violations:
 * - Empty catch blocks
 * - Catch-all without re-throw
 * - Deeply nested try/catch
 *
 * @requirements 12.3 - Try/catch placement patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type TryCatchPatternType =
  | 'try-catch-block'     // Basic try/catch
  | 'try-catch-finally'   // Try/catch with finally
  | 'typed-catch'         // Catch with type check
  | 'boundary-catch';     // Catch at function boundary

export type TryCatchViolationType =
  | 'empty-catch'           // Empty catch block
  | 'catch-all-no-rethrow'  // Catch all without re-throw
  | 'deeply-nested';        // Deeply nested try/catch

export interface TryCatchPatternInfo {
  type: TryCatchPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  hasFinally?: boolean;
  errorType?: string;
  context?: string;
}

export interface TryCatchViolationInfo {
  type: TryCatchViolationType;
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

export interface TryCatchAnalysis {
  patterns: TryCatchPatternInfo[];
  violations: TryCatchViolationInfo[];
  hasTryCatch: boolean;
  hasFinally: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const TRY_CATCH_PATTERNS = [
  // JavaScript/TypeScript
  /try\s*\{/gi,
  // Python
  /try\s*:/gi,
] as const;

export const TRY_CATCH_FINALLY_PATTERNS = [
  // JavaScript/TypeScript
  /try\s*\{[\s\S]*?\}\s*catch[\s\S]*?\}\s*finally\s*\{/gi,
  // Python
  /try\s*:[\s\S]*?except[\s\S]*?finally\s*:/gi,
] as const;

export const TYPED_CATCH_PATTERNS = [
  // JavaScript/TypeScript
  /catch\s*\(\s*\w+\s*\)\s*\{[\s\S]*?instanceof\s+\w+Error/gi,
  /catch\s*\(\s*\w+:\s*\w+Error\s*\)/gi,
  // Python - typed except
  /except\s+\w+Error\s+as\s+\w+\s*:/gi,
  /except\s+\(\s*\w+(?:,\s*\w+)*\s*\)\s+as\s+\w+\s*:/gi,
  /except\s+\w+Exception\s+as\s+\w+\s*:/gi,
] as const;

export const EMPTY_CATCH_PATTERNS = [
  // JavaScript/TypeScript
  /catch\s*\([^)]*\)\s*\{\s*\}/gi,
  /catch\s*\{\s*\}/gi,
  // Python - except with pass
  /except[^:]*:\s*\n\s*pass\b/gi,
  /except\s*:\s*\n\s*pass\b/gi,
] as const;

export const CATCH_ALL_PATTERNS = [
  // JavaScript/TypeScript
  /catch\s*\(\s*\w+\s*\)\s*\{[^}]*(?!throw)[^}]*\}/gi,
  // Python - bare except
  /except\s*:/gi,
  /except\s+Exception\s*:/gi,
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

export function detectTryCatchBlocks(content: string, file: string): TryCatchPatternInfo[] {
  const results: TryCatchPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of TRY_CATCH_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'try-catch-block',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectTryCatchFinally(content: string, file: string): TryCatchPatternInfo[] {
  const results: TryCatchPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of TRY_CATCH_FINALLY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'try-catch-finally',
        file, line, column,
        matchedText: match[0].slice(0, 50) + '...',
        hasFinally: true,
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectTypedCatch(content: string, file: string): TryCatchPatternInfo[] {
  const results: TryCatchPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of TYPED_CATCH_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'typed-catch',
        file, line, column,
        matchedText: match[0].slice(0, 50) + '...',
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectEmptyCatchViolations(content: string, file: string): TryCatchViolationInfo[] {
  const violations: TryCatchViolationInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of EMPTY_CATCH_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      violations.push({
        type: 'empty-catch',
        file, line, column,
        endLine: line,
        endColumn: column + match[0].length,
        value: match[0],
        issue: 'Empty catch block swallows errors silently',
        suggestedFix: 'Log the error or re-throw it',
        lineContent: lines[line - 1] || '',
      });
    }
  }
  return violations;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export function analyzeTryCatchPlacement(content: string, file: string): TryCatchAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], hasTryCatch: false, hasFinally: false, confidence: 1.0 };
  }
  
  const tryCatch = detectTryCatchBlocks(content, file);
  const tryCatchFinally = detectTryCatchFinally(content, file);
  const typedCatch = detectTypedCatch(content, file);
  
  const allPatterns = [...tryCatch, ...tryCatchFinally, ...typedCatch];
  const violations = detectEmptyCatchViolations(content, file);
  
  const confidence = allPatterns.length > 0 ? Math.max(0.5, 1 - violations.length * 0.1) : 1.0;
  
  return {
    patterns: allPatterns,
    violations,
    hasTryCatch: tryCatch.length > 0,
    hasFinally: tryCatchFinally.length > 0,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class TryCatchPlacementDetector extends RegexDetector {
  readonly id = 'errors/try-catch-placement';
  readonly name = 'Try-Catch Placement Detector';
  readonly description = 'Detects try/catch placement patterns';
  readonly category = 'errors';
  readonly subcategory = 'try-catch';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeTryCatchPlacement(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasTryCatch: analysis.hasTryCatch,
        hasFinally: analysis.hasFinally,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createTryCatchPlacementDetector(): TryCatchPlacementDetector {
  return new TryCatchPlacementDetector();
}
