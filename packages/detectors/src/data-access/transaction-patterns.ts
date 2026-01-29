/**
 * Transaction Patterns Detector - Database transaction pattern detection
 *
 * Detects transaction handling patterns including:
 * - Transaction boundaries
 * - Nested transactions
 * - Transaction isolation levels
 * - Commit/rollback patterns
 *
 * @requirements 13.3 - Transaction pattern detection
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type TransactionPatternType =
  | 'transaction-block'
  | 'transaction-decorator'
  | 'manual-commit'
  | 'manual-rollback'
  | 'savepoint'
  | 'isolation-level';

export type TransactionViolationType =
  | 'missing-rollback'
  | 'nested-transaction'
  | 'long-transaction';

export interface TransactionPatternInfo {
  type: TransactionPatternType;
  line: number;
  column: number;
  match: string;
}

export interface TransactionViolationInfo {
  type: TransactionViolationType;
  line: number;
  column: number;
  match: string;
  message: string;
}

export interface TransactionAnalysis {
  patterns: TransactionPatternInfo[];
  violations: TransactionViolationInfo[];
  hasTransactions: boolean;
  transactionCount: number;
}

// ============================================================================
// Patterns
// ============================================================================

export const TRANSACTION_BLOCK_PATTERNS = [
  // JavaScript/TypeScript
  /\$transaction\s*\(\s*(?:async\s*)?\(/gi,
  /\.transaction\s*\(\s*(?:async\s*)?\(/gi,
  /beginTransaction\s*\(/gi,
  /startTransaction\s*\(/gi,
  /withTransaction\s*\(/gi,
  // Python
  /with\s+\w+\.begin\s*\(\s*\)/gi, // SQLAlchemy context manager
  /session\.begin\s*\(/gi,
  /connection\.begin\s*\(/gi,
  /@transaction\.atomic/gi, // Django decorator
  /transaction\.atomic\s*\(/gi, // Django context manager
  /with\s+transaction\.atomic/gi,
];

export const TRANSACTION_DECORATOR_PATTERNS = [
  /@Transaction\s*\(/gi,
  /@Transactional\s*\(/gi,
];

export const COMMIT_PATTERNS = [
  // JavaScript/TypeScript
  /\.commit\s*\(/gi,
  /commitTransaction\s*\(/gi,
  /COMMIT/gi,
  // Python
  /session\.commit\s*\(/gi,
  /connection\.commit\s*\(/gi,
  /db\.commit\s*\(/gi,
];

export const ROLLBACK_PATTERNS = [
  // JavaScript/TypeScript
  /\.rollback\s*\(/gi,
  /rollbackTransaction\s*\(/gi,
  /ROLLBACK/gi,
  // Python
  /session\.rollback\s*\(/gi,
  /connection\.rollback\s*\(/gi,
  /db\.rollback\s*\(/gi,
  /transaction\.rollback\s*\(/gi,
];

export const SAVEPOINT_PATTERNS = [
  /SAVEPOINT\s+\w+/gi,
  /\.savepoint\s*\(/gi,
  /createSavepoint\s*\(/gi,
];

export const ISOLATION_LEVEL_PATTERNS = [
  // JavaScript/TypeScript
  /isolationLevel\s*:\s*['"`]?\w+['"`]?/gi,
  /SET\s+TRANSACTION\s+ISOLATION\s+LEVEL/gi,
  /ReadCommitted|ReadUncommitted|RepeatableRead|Serializable/g,
  // Python
  /isolation_level\s*=/gi,
  /ISOLATION_LEVEL_/gi,
  /set_isolation_level\s*\(/gi,
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

export function detectTransactionBlocks(content: string): TransactionPatternInfo[] {
  const results: TransactionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TRANSACTION_BLOCK_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'transaction-block',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectTransactionDecorators(content: string): TransactionPatternInfo[] {
  const results: TransactionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TRANSACTION_DECORATOR_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'transaction-decorator',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectCommitPatterns(content: string): TransactionPatternInfo[] {
  const results: TransactionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of COMMIT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'manual-commit',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectRollbackPatterns(content: string): TransactionPatternInfo[] {
  const results: TransactionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ROLLBACK_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'manual-rollback',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectSavepoints(content: string): TransactionPatternInfo[] {
  const results: TransactionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SAVEPOINT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'savepoint',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectIsolationLevels(content: string): TransactionPatternInfo[] {
  const results: TransactionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ISOLATION_LEVEL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'isolation-level',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function analyzeTransactionPatterns(content: string, filePath: string): TransactionAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasTransactions: false,
      transactionCount: 0,
    };
  }

  const patterns: TransactionPatternInfo[] = [
    ...detectTransactionBlocks(content),
    ...detectTransactionDecorators(content),
    ...detectCommitPatterns(content),
    ...detectRollbackPatterns(content),
    ...detectSavepoints(content),
    ...detectIsolationLevels(content),
  ];

  const violations: TransactionViolationInfo[] = [];

  // Check for manual commits without rollbacks
  const commits = patterns.filter((p) => p.type === 'manual-commit');
  const rollbacks = patterns.filter((p) => p.type === 'manual-rollback');

  if (commits.length > 0 && rollbacks.length === 0) {
    violations.push({
      type: 'missing-rollback',
      line: commits[0]!.line,
      column: commits[0]!.column,
      match: commits[0]!.match,
      message: 'Manual commit without rollback handling detected',
    });
  }

  const transactionBlocks = patterns.filter((p) => p.type === 'transaction-block');

  return {
    patterns,
    violations,
    hasTransactions: transactionBlocks.length > 0 || commits.length > 0,
    transactionCount: transactionBlocks.length,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class TransactionPatternsDetector extends RegexDetector {
  readonly id = 'data-access/transaction-patterns';
  readonly name = 'Transaction Patterns Detector';
  readonly description = 'Detects database transaction patterns and identifies potential issues';
  readonly category: PatternCategory = 'data-access';
  readonly subcategory = 'transaction-patterns';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeTransactionPatterns(context.content, context.file);

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

    const confidence = analysis.hasTransactions ? 0.9 : 0.7;
    return this.createResult([], violations, confidence, {
      custom: {
        patterns: analysis.patterns,
        hasTransactions: analysis.hasTransactions,
        transactionCount: analysis.transactionCount,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createTransactionPatternsDetector(): TransactionPatternsDetector {
  return new TransactionPatternsDetector();
}
