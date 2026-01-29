/**
 * Retry Patterns Detector - LEARNING VERSION
 *
 * Learns retry and resilience patterns from the user's codebase:
 * - Retry strategy (exponential backoff, linear, circuit breaker)
 * - Whether retry logic is required for network calls
 * - Timeout configuration patterns
 * - Max retry limits
 *
 * Flags violations only when code deviates from the PROJECT'S established patterns.
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

export type RetryStrategy = 'exponential-backoff' | 'linear' | 'circuit-breaker' | 'retry-library' | 'custom' | 'none';

export interface RetryConventions {
  [key: string]: unknown;
  /** Primary retry strategy */
  retryStrategy: RetryStrategy;
  /** Whether network calls require retry logic */
  requiresRetry: boolean;
  /** Whether timeout configuration is required */
  requiresTimeout: boolean;
  /** Whether max retry limit is enforced */
  hasMaxRetryLimit: boolean;
}

interface RetryPatternInfo {
  strategy: RetryStrategy;
  line: number;
  column: number;
  matchedText: string;
  hasMaxRetries: boolean;
  hasTimeout: boolean;
}

// ============================================================================
// Detection Patterns
// ============================================================================

const EXPONENTIAL_BACKOFF_PATTERNS = [
  /Math\.pow\s*\(\s*2\s*,\s*(?:retry|attempt|count)/gi,
  /2\s*\*\*\s*(?:retry|attempt|count)/gi,
  /delay\s*\*=?\s*2/gi,
  /exponential(?:Backoff|Delay|Retry)/gi,
  /backoff\s*:\s*['"`]exponential['"`]/gi,
];

const LINEAR_RETRY_PATTERNS = [
  /retry\s*(?:Count|Attempts?|Times?)\s*[<>=]+\s*\d+/gi,
  /for\s*\([^)]*retry[^)]*\)/gi,
  /while\s*\([^)]*retry[^)]*\)/gi,
];

const CIRCUIT_BREAKER_PATTERNS = [
  /circuitBreaker/gi,
  /circuit[_-]?breaker/gi,
  /(?:open|closed|half[_-]?open)\s*state/gi,
  /failure[_-]?threshold/gi,
];

const RETRY_LIBRARY_PATTERNS = [
  /axios[_-]?retry/gi,
  /p[_-]?retry/gi,
  /async[_-]?retry/gi,
  /tenacity/gi,
  /@retry\s*\(/gi,
  /@backoff\./gi,
  /cockatiel/gi,
];

const TIMEOUT_PATTERNS = [
  /timeout\s*:\s*\d+/gi,
  /AbortController/gi,
  /signal\s*:\s*(?:abort|controller)/gi,
  /timeoutMs\s*[=:]/gi,
];

const MAX_RETRY_PATTERNS = [
  /max[_-]?retries?\s*[=:]\s*\d+/gi,
  /retry[_-]?limit\s*[=:]\s*\d+/gi,
  /retries?\s*[<>=]+\s*\d+/gi,
  /attempts?\s*[<>=]+\s*\d+/gi,
];

const NETWORK_CALL_PATTERNS = [
  /fetch\s*\(/gi,
  /axios\.\w+\s*\(/gi,
  /\.get\s*\(\s*['"`]/gi,
  /\.post\s*\(\s*['"`]/gi,
];

// ============================================================================
// Helper Functions
// ============================================================================

function getPosition(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

function detectRetryStrategy(content: string): RetryStrategy {
  // Check in order of specificity
  for (const pattern of RETRY_LIBRARY_PATTERNS) {
    if (pattern.test(content)) {return 'retry-library';}
  }
  for (const pattern of CIRCUIT_BREAKER_PATTERNS) {
    if (pattern.test(content)) {return 'circuit-breaker';}
  }
  for (const pattern of EXPONENTIAL_BACKOFF_PATTERNS) {
    if (pattern.test(content)) {return 'exponential-backoff';}
  }
  for (const pattern of LINEAR_RETRY_PATTERNS) {
    if (pattern.test(content)) {return 'linear';}
  }
  return 'none';
}

function hasMaxRetries(content: string): boolean {
  return MAX_RETRY_PATTERNS.some(p => p.test(content));
}

function hasTimeout(content: string): boolean {
  return TIMEOUT_PATTERNS.some(p => p.test(content));
}

function hasNetworkCalls(content: string): boolean {
  return NETWORK_CALL_PATTERNS.some(p => p.test(content));
}

function extractRetryPatterns(content: string): RetryPatternInfo[] {
  const results: RetryPatternInfo[] = [];
  const allPatterns = [
    ...EXPONENTIAL_BACKOFF_PATTERNS,
    ...LINEAR_RETRY_PATTERNS,
    ...CIRCUIT_BREAKER_PATTERNS,
    ...RETRY_LIBRARY_PATTERNS,
  ];

  for (const pattern of allPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      const strategy = detectRetryStrategy(match[0]);

      if (strategy !== 'none') {
        results.push({
          strategy,
          line,
          column,
          matchedText: match[0],
          hasMaxRetries: hasMaxRetries(content),
          hasTimeout: hasTimeout(content),
        });
        break; // One match per pattern type is enough
      }
    }
  }

  return results;
}

// ============================================================================
// Learning Retry Patterns Detector
// ============================================================================

export class RetryPatternsLearningDetector extends LearningDetector<RetryConventions> {
  readonly id = 'api/retry-patterns';
  readonly category = 'api' as const;
  readonly subcategory = 'retry';
  readonly name = 'Retry Patterns Detector (Learning)';
  readonly description = 'Learns retry and resilience patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof RetryConventions> {
    return ['retryStrategy', 'requiresRetry', 'requiresTimeout', 'hasMaxRetryLimit'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof RetryConventions, ValueDistribution>
  ): void {
    const patterns = extractRetryPatterns(context.content);
    const strategyDist = distributions.get('retryStrategy')!;
    const requiresRetryDist = distributions.get('requiresRetry')!;
    const requiresTimeoutDist = distributions.get('requiresTimeout')!;
    const maxRetryDist = distributions.get('hasMaxRetryLimit')!;

    // Track retry strategies
    for (const pattern of patterns) {
      strategyDist.add(pattern.strategy, context.file);
      maxRetryDist.add(pattern.hasMaxRetries, context.file);
    }

    // Track if files with network calls have retry logic
    const hasNetwork = hasNetworkCalls(context.content);
    const hasRetry = patterns.length > 0;
    const hasTimeoutConfig = hasTimeout(context.content);

    if (hasNetwork) {
      requiresRetryDist.add(hasRetry, context.file);
      requiresTimeoutDist.add(hasTimeoutConfig, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<RetryConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const retryPatterns = extractRetryPatterns(context.content);
    const learnedStrategy = conventions.conventions.retryStrategy?.value;
    const learnedRequiresRetry = conventions.conventions.requiresRetry?.value;
    const learnedRequiresTimeout = conventions.conventions.requiresTimeout?.value;
    const learnedHasMaxRetry = conventions.conventions.hasMaxRetryLimit?.value;

    // Check strategy consistency
    for (const pattern of retryPatterns) {
      if (learnedStrategy && pattern.strategy !== learnedStrategy && learnedStrategy !== 'none') {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'retry strategy',
          pattern.strategy,
          learnedStrategy,
          `Using ${pattern.strategy} but your project uses ${learnedStrategy}.`
        ));
      }

      // Check for missing max retry limit
      if (learnedHasMaxRetry === true && !pattern.hasMaxRetries) {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'max retry limit',
          'missing',
          'present',
          `Retry logic is missing max retry limit. Your project typically includes it.`
        ));
      }
    }

    // Check for missing retry logic on network calls
    const hasNetwork = hasNetworkCalls(context.content);
    if (learnedRequiresRetry === true && hasNetwork && retryPatterns.length === 0) {
      // Only flag in API/service files
      if (context.file.includes('api') || context.file.includes('client') || context.file.includes('service')) {
        for (const pattern of NETWORK_CALL_PATTERNS) {
          const regex = new RegExp(pattern.source, pattern.flags);
          const match = regex.exec(context.content);
          if (match) {
            const { line, column } = getPosition(context.content, match.index);
            violations.push(this.createConventionViolation(
              context.file,
              line,
              column,
              'retry logic',
              'missing',
              'present',
              `Network call without retry logic. Your project typically includes retry handling.`
            ));
            break;
          }
        }
      }
    }

    // Check for missing timeout
    if (learnedRequiresTimeout === true && hasNetwork && !hasTimeout(context.content)) {
      if (context.file.includes('api') || context.file.includes('client') || context.file.includes('service')) {
        for (const pattern of NETWORK_CALL_PATTERNS) {
          const regex = new RegExp(pattern.source, pattern.flags);
          const match = regex.exec(context.content);
          if (match) {
            const { line, column } = getPosition(context.content, match.index);
            violations.push(this.createConventionViolation(
              context.file,
              line,
              column,
              'timeout configuration',
              'missing',
              'present',
              `Network call without timeout. Your project typically includes timeout configuration.`
            ));
            break;
          }
        }
      }
    }

    // Create pattern match
    if (retryPatterns.length > 0) {
      const first = retryPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/retry`,
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

export function createRetryPatternsLearningDetector(): RetryPatternsLearningDetector {
  return new RetryPatternsLearningDetector();
}
