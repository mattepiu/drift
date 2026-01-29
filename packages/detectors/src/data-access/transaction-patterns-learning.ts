/**
 * Transaction Patterns Detector - LEARNING VERSION
 *
 * Learns database transaction patterns from the user's codebase:
 * - Transaction handling style
 * - Rollback patterns
 * - Isolation level preferences
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type TransactionStyle = 'callback' | 'manual' | 'decorator';

export interface TransactionPatternsConventions {
  [key: string]: unknown;
  style: TransactionStyle;
  usesExplicitRollback: boolean;
  usesIsolationLevel: boolean;
}

interface TransactionPatternInfo {
  style: TransactionStyle;
  hasRollback: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractTransactionPatterns(content: string, file: string): TransactionPatternInfo[] {
  const results: TransactionPatternInfo[] = [];

  // Callback-style transactions (Prisma, Knex)
  const callbackPattern = /\.\$transaction\s*\(|\\.transaction\s*\(\s*async/g;
  let match;
  while ((match = callbackPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'callback',
      hasRollback: /rollback/i.test(content),
      line,
      column,
      file,
    });
  }

  // Manual transactions
  const manualPattern = /BEGIN\s*TRANSACTION|startTransaction|beginTransaction/gi;
  while ((match = manualPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'manual',
      hasRollback: /rollback|ROLLBACK/i.test(content),
      line,
      column,
      file,
    });
  }

  // Decorator-style transactions (TypeORM, NestJS)
  const decoratorPattern = /@Transaction\s*\(|@Transactional\s*\(/g;
  while ((match = decoratorPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'decorator',
      hasRollback: false,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Transaction Patterns Detector
// ============================================================================

export class TransactionPatternsLearningDetector extends LearningDetector<TransactionPatternsConventions> {
  readonly id = 'data-access/transaction-patterns';
  readonly category = 'data-access' as const;
  readonly subcategory = 'transaction-patterns';
  readonly name = 'Transaction Patterns Detector (Learning)';
  readonly description = 'Learns database transaction patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof TransactionPatternsConventions> {
    return ['style', 'usesExplicitRollback', 'usesIsolationLevel'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TransactionPatternsConventions, ValueDistribution>
  ): void {
    const patterns = extractTransactionPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('style')!;
    const rollbackDist = distributions.get('usesExplicitRollback')!;

    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
      rollbackDist.add(pattern.hasRollback, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TransactionPatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const txPatterns = extractTransactionPatterns(context.content, context.file);
    if (txPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.style?.value;

    if (learnedStyle) {
      for (const pattern of txPatterns) {
        if (pattern.style !== learnedStyle) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'transaction style', pattern.style, learnedStyle,
            `Using ${pattern.style} transactions but project uses ${learnedStyle}`
          ));
        }
      }
    }

    if (txPatterns.length > 0) {
      const first = txPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/transaction`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createTransactionPatternsLearningDetector(): TransactionPatternsLearningDetector {
  return new TransactionPatternsLearningDetector();
}
