/**
 * Async Patterns Semantic Detector for C#
 *
 * Learns async/await patterns from the codebase:
 * - async Task vs async ValueTask
 * - ConfigureAwait(false) usage
 * - Async void detection (warning)
 * - Task.Run() patterns
 * - Sync over async anti-patterns
 *
 * Uses semantic learning to understand how async code is structured
 * and detect inconsistencies.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

// ============================================================================
// Context Validation Patterns
// ============================================================================

/** Keywords in surrounding context that indicate async usage */
const ASYNC_CONTEXT_KEYWORDS = [
  'async', 'await', 'task', 'valuetask', 'cancellationtoken',
  'configureawait', 'whenall', 'whenany', 'delay', 'run',
  'fromresult', 'completedtask', 'yield', 'ienumerable',
];

// ============================================================================
// Async Patterns Semantic Detector
// ============================================================================

export class AsyncPatternsSemanticDetector extends SemanticDetector {
  readonly id = 'performance/csharp-async-patterns';
  readonly name = 'C# Async Patterns Detector';
  readonly description = 'Learns async/await patterns and detects potential issues in C#';
  readonly category = 'performance' as const;
  readonly subcategory = 'async';

  // C# specific
  override readonly supportedLanguages: Language[] = ['csharp'];

  constructor() {
    super({
      minOccurrences: 3,
      dominanceThreshold: 0.3,
      minFiles: 2,
      includeComments: false,
      includeStrings: false,
    });
  }

  /**
   * Semantic keywords for async pattern detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // Core async keywords
      'async', 'await', 'Task', 'ValueTask',
      // Configuration
      'ConfigureAwait', 'CancellationToken',
      // Task combinators
      'WhenAll', 'WhenAny', 'Delay', 'Run',
      // Completion
      'FromResult', 'CompletedTask',
      // Anti-patterns to detect
      'Result', 'Wait', 'GetAwaiter',
    ];
  }

  protected getSemanticCategory(): string {
    return 'performance';
  }

  /**
   * Context-aware filtering for async patterns
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { lineContent, keyword, surroundingContext } = match;
    const lineLower = lineContent.toLowerCase();
    const contextLower = surroundingContext.toLowerCase();

    // Skip if it's in a string literal
    if (/["'].*async.*["']|["'].*await.*["']|["'].*task.*["']/i.test(lineContent)) {
      return false;
    }

    // Skip if it's a comment (unless we're looking for documentation)
    if (/^\s*\/\//.test(lineContent) && !lineContent.includes('///')) {
      return false;
    }

    // High-confidence: actual async/await usage
    if (keyword.toLowerCase() === 'async' && /\basync\s+(?:Task|ValueTask|void)\b/.test(lineContent)) {
      return true;
    }

    if (keyword.toLowerCase() === 'await' && /\bawait\s+\w/.test(lineContent)) {
      return true;
    }

    // Task/ValueTask return types
    if (/\b(?:Task|ValueTask)<?\w*>?\s+\w+\s*\(/.test(lineContent)) {
      return true;
    }

    // ConfigureAwait usage
    if (lineLower.includes('configureawait')) {
      return true;
    }

    // Anti-patterns: .Result, .Wait(), .GetAwaiter().GetResult()
    if (/\.Result\b|\.Wait\s*\(|\.GetAwaiter\s*\(\s*\)\s*\.GetResult/.test(lineContent)) {
      return true;
    }

    // Task.Run usage
    if (/Task\.Run\s*\(/.test(lineContent)) {
      return true;
    }

    // Check for async context in surrounding code
    const hasAsyncContext = ASYNC_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
    return hasAsyncContext;
  }

  /**
   * Create violation for inconsistent async pattern
   */
  protected createPatternViolation(
    match: SemanticMatch,
    dominantPattern: UsagePattern
  ): Violation {
    // Determine severity based on anti-pattern detection
    let severity: 'error' | 'warning' | 'info' = 'warning';
    let additionalMessage = '';

    if (/async\s+void\s+\w+/.test(match.lineContent)) {
      severity = 'warning';
      additionalMessage = ' async void methods cannot have their exceptions caught - use async Task instead.';
    } else if (/\.Result\b|\.Wait\s*\(/.test(match.lineContent)) {
      severity = 'error';
      additionalMessage = ' Sync over async can cause deadlocks - use await instead.';
    }

    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity,
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent async pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'.${additionalMessage}`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for async patterns in ${(dominantPattern.percentage * 100).toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createAsyncPatternsSemanticDetector(): AsyncPatternsSemanticDetector {
  return new AsyncPatternsSemanticDetector();
}
