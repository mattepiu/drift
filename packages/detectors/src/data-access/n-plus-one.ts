/**
 * N+1 Query Detector - N+1 query problem detection
 *
 * Detects potential N+1 query patterns including:
 * - Queries inside loops
 * - Missing eager loading
 * - Sequential database calls
 *
 * @requirements 13.6 - N+1 query detection
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type NPlusOnePatternType =
  | 'eager-loading'
  | 'batch-query'
  | 'join-query'
  | 'preload';

export type NPlusOneViolationType =
  | 'query-in-loop'
  | 'sequential-queries'
  | 'missing-include';

export interface NPlusOnePatternInfo {
  type: NPlusOnePatternType;
  line: number;
  column: number;
  match: string;
}

export interface NPlusOneViolationInfo {
  type: NPlusOneViolationType;
  line: number;
  column: number;
  match: string;
  message: string;
}

export interface NPlusOneAnalysis {
  patterns: NPlusOnePatternInfo[];
  violations: NPlusOneViolationInfo[];
  hasEagerLoading: boolean;
  potentialNPlusOne: boolean;
}

// ============================================================================
// Patterns
// ============================================================================

export const EAGER_LOADING_PATTERNS = [
  // JavaScript/TypeScript
  /include\s*:\s*\{/gi,
  /include\s*:\s*\[/gi,
  /\.include\s*\(/gi,
  /relations\s*:\s*\[/gi,
  /\.leftJoinAndSelect\s*\(/gi,
  /\.innerJoinAndSelect\s*\(/gi,
  // Python SQLAlchemy
  /joinedload\s*\(/gi,
  /subqueryload\s*\(/gi,
  /selectinload\s*\(/gi,
  /\.options\s*\(\s*(?:joinedload|subqueryload|selectinload)/gi,
  // Python Django
  /\.select_related\s*\(/gi,
  /\.prefetch_related\s*\(/gi,
];

export const BATCH_QUERY_PATTERNS = [
  // JavaScript/TypeScript
  /findMany\s*\(\s*\{\s*where\s*:\s*\{\s*\w+\s*:\s*\{\s*in\s*:/gi,
  /\.whereIn\s*\(/gi,
  /WHERE\s+\w+\s+IN\s*\(/gi,
  /\$in\s*:/gi,
  // Python
  /\.filter\s*\(\s*\w+__in\s*=/gi, // Django __in lookup
  /\.in_\s*\(/gi, // SQLAlchemy in_()
  /WHERE\s+\w+\s+IN\s*\(/gi,
];

export const JOIN_QUERY_PATTERNS = [
  /\.join\s*\(/gi,
  /\.leftJoin\s*\(/gi,
  /\.innerJoin\s*\(/gi,
  /JOIN\s+\w+\s+ON/gi,
  /LEFT\s+JOIN/gi,
  /INNER\s+JOIN/gi,
];

export const PRELOAD_PATTERNS = [
  /\.preload\s*\(/gi,
  /\.with\s*\(/gi,
  /\.populate\s*\(/gi,
];

export const QUERY_IN_LOOP_PATTERNS = [
  // JavaScript/TypeScript
  /for\s*\([^)]+\)\s*\{[^}]*(?:await\s+)?(?:prisma|db)\.\w+\.(find|create|update|delete)/gis,
  /\.forEach\s*\([^)]+\)\s*(?:=>)?\s*\{[^}]*(?:await\s+)?(?:prisma|db)\.\w+\./gis,
  /\.map\s*\([^)]+\)\s*(?:=>)?\s*\{[^}]*(?:await\s+)?(?:prisma|db)\.\w+\./gis,
  /while\s*\([^)]+\)\s*\{[^}]*(?:await\s+)?(?:prisma|db)\.\w+\./gis,
  // Python
  /for\s+\w+\s+in\s+[^:]+:[^}]*(?:session|db)\.\w+\.(query|execute|add)/gis,
  /for\s+\w+\s+in\s+[^:]+:[^}]*\.objects\.(get|filter|create)/gis,
  /for\s+\w+\s+in\s+[^:]+:[^}]*supabase\./gis,
];

export const SEQUENTIAL_QUERY_PATTERNS = [
  /(?:await\s+)?(?:prisma|db)\.\w+\.find[^;]+;\s*(?:await\s+)?(?:prisma|db)\.\w+\.find/gis,
];

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /\.d\.ts$/,
    /node_modules\//,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectEagerLoading(content: string): NPlusOnePatternInfo[] {
  const results: NPlusOnePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of EAGER_LOADING_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'eager-loading',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectBatchQueries(content: string): NPlusOnePatternInfo[] {
  const results: NPlusOnePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of BATCH_QUERY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'batch-query',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectJoinQueries(content: string): NPlusOnePatternInfo[] {
  const results: NPlusOnePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of JOIN_QUERY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'join-query',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectPreloads(content: string): NPlusOnePatternInfo[] {
  const results: NPlusOnePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of PRELOAD_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'preload',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectQueryInLoopViolations(content: string): NPlusOneViolationInfo[] {
  const results: NPlusOneViolationInfo[] = [];

  for (const pattern of QUERY_IN_LOOP_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      // Calculate line number
      const beforeMatch = content.substring(0, match.index);
      const line = beforeMatch.split('\n').length;

      results.push({
        type: 'query-in-loop',
        line,
        column: 1,
        match: match[0].substring(0, 100) + (match[0].length > 100 ? '...' : ''),
        message: 'Database query inside loop detected - potential N+1 problem',
      });
    }
  }

  return results;
}

export function detectSequentialQueryViolations(content: string): NPlusOneViolationInfo[] {
  const results: NPlusOneViolationInfo[] = [];

  for (const pattern of SEQUENTIAL_QUERY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index);
      const line = beforeMatch.split('\n').length;

      results.push({
        type: 'sequential-queries',
        line,
        column: 1,
        match: match[0].substring(0, 100) + (match[0].length > 100 ? '...' : ''),
        message: 'Sequential database queries detected - consider batching or joining',
      });
    }
  }

  return results;
}

export function analyzeNPlusOne(content: string, filePath: string): NPlusOneAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasEagerLoading: false,
      potentialNPlusOne: false,
    };
  }

  const patterns: NPlusOnePatternInfo[] = [
    ...detectEagerLoading(content),
    ...detectBatchQueries(content),
    ...detectJoinQueries(content),
    ...detectPreloads(content),
  ];

  const violations: NPlusOneViolationInfo[] = [
    ...detectQueryInLoopViolations(content),
    ...detectSequentialQueryViolations(content),
  ];

  const hasEagerLoading = patterns.some((p) => p.type === 'eager-loading' || p.type === 'preload');

  return {
    patterns,
    violations,
    hasEagerLoading,
    potentialNPlusOne: violations.length > 0,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class NPlusOneDetector extends RegexDetector {
  readonly id = 'data-access/n-plus-one';
  readonly name = 'N+1 Query Detector';
  readonly description = 'Detects potential N+1 query problems and missing eager loading';
  readonly category: PatternCategory = 'data-access';
  readonly subcategory = 'n-plus-one';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeNPlusOne(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      file: context.file,
      line: v.line,
      column: v.column,
      type: v.type,
      value: v.match,
      issue: v.message,
      severity: 'warning',
    }));

    const confidence = analysis.potentialNPlusOne ? 0.85 : 0.9;
    return this.createResult([], violations, confidence, {
      custom: {
        patterns: analysis.patterns,
        hasEagerLoading: analysis.hasEagerLoading,
        potentialNPlusOne: analysis.potentialNPlusOne,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createNPlusOneDetector(): NPlusOneDetector {
  return new NPlusOneDetector();
}
