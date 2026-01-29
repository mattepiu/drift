/**
 * Laravel Transaction Patterns Detector - SEMANTIC VERSION
 *
 * Learns database transaction patterns from your Laravel codebase:
 * - DB::transaction closures
 * - Manual transaction control
 * - Savepoints
 * - Transaction callbacks
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

const TRANSACTION_FILE_PATTERNS = [
  /services\//i, /repositories\//i, /controllers\//i,
  /jobs\//i, /actions\//i,
];

const TRANSACTION_CONTEXT_KEYWORDS = [
  'illuminate\\support\\facades\\db',
  'illuminate\\database\\connection',
  'db::transaction', 'db::begintransaction',
  'transaction(', 'begintransaction(', 'commit(', 'rollback(',
];


export class LaravelTransactionSemanticDetector extends SemanticDetector {
  readonly id = 'data-access/laravel-transaction-semantic';
  readonly name = 'Laravel Transaction Patterns Detector';
  readonly description = 'Learns database transaction patterns from your Laravel codebase';
  readonly category = 'data-access' as const;
  readonly subcategory = 'laravel';

  override readonly supportedLanguages: Language[] = ['php'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: false,
    });
  }

  protected getSemanticKeywords(): string[] {
    return [
      // Transaction methods
      'transaction', 'beginTransaction', 'commit', 'rollBack', 'rollback',
      'transactionLevel', 'afterCommit',
      
      // DB facade
      'DB', 'connection', 'reconnect', 'disconnect',
      
      // Savepoints
      'savepoint', 'releaseSavepoint', 'rollbackToSavepoint',
      
      // Locking
      'lockForUpdate', 'sharedLock', 'lock',
      
      // Eloquent transaction events
      'afterCommit', 'beforeCommit',
      
      // Query builder in transactions
      'insert', 'update', 'delete', 'upsert',
      'insertOrIgnore', 'insertGetId', 'updateOrInsert',
    ];
  }

  protected getSemanticCategory(): string {
    return 'transaction';
  }


  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    const highConfidenceKeywords = [
      'transaction', 'beginTransaction', 'commit', 'rollBack',
      'lockForUpdate', 'sharedLock', 'afterCommit',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    const ambiguousKeywords = ['DB', 'insert', 'update', 'delete', 'lock'];
    if (ambiguousKeywords.includes(keyword)) {
      const hasContext = TRANSACTION_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inTransactionFile = TRANSACTION_FILE_PATTERNS.some(p => p.test(file));
        if (!inTransactionFile) {return false;}
      }
    }

    return true;
  }

  protected createPatternViolation(
    match: SemanticMatch,
    dominantPattern: UsagePattern
  ): Violation {
    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity: 'warning',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent transaction pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for transactions in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelTransactionSemanticDetector(): LaravelTransactionSemanticDetector {
  return new LaravelTransactionSemanticDetector();
}
