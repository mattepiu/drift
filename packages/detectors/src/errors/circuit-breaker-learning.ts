/**
 * Circuit Breaker Detector - LEARNING VERSION
 *
 * Learns circuit breaker patterns from the user's codebase:
 * - Library usage (opossum, cockatiel, custom)
 * - Configuration patterns
 * - State management approach
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

import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type CircuitBreakerLibrary = 'opossum' | 'cockatiel' | 'resilience4j' | 'custom';
export type StateManagement = 'class-based' | 'functional' | 'decorator';

export interface CircuitBreakerConventions {
  [key: string]: unknown;
  library: CircuitBreakerLibrary;
  stateManagement: StateManagement;
  defaultTimeout: number | null;
  defaultThreshold: number | null;
  usesHalfOpen: boolean;
}

interface CircuitBreakerInfo {
  library: CircuitBreakerLibrary;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const LIBRARY_PATTERNS: Array<{ pattern: RegExp; library: CircuitBreakerLibrary }> = [
  { pattern: /import.*from\s+['"]opossum['"]/i, library: 'opossum' },
  { pattern: /import.*from\s+['"]cockatiel['"]/i, library: 'cockatiel' },
  { pattern: /import.*CircuitBreaker.*from\s+['"]resilience4j['"]/i, library: 'resilience4j' },
  { pattern: /class\s+\w*CircuitBreaker/i, library: 'custom' },
];

function extractCircuitBreakers(content: string, file: string): CircuitBreakerInfo[] {
  const breakers: CircuitBreakerInfo[] = [];
  
  for (const { pattern, library } of LIBRARY_PATTERNS) {
    const match = pattern.exec(content);
    if (match) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      breakers.push({ library, line: lineNumber, column, file });
    }
  }
  
  return breakers;
}

function detectStateManagement(content: string): StateManagement | null {
  if (/@CircuitBreaker|@Resilient/.test(content)) {return 'decorator';}
  if (/class\s+\w*CircuitBreaker/.test(content)) {return 'class-based';}
  if (/createCircuitBreaker|circuitBreaker\s*\(/.test(content)) {return 'functional';}
  return null;
}

function extractTimeout(content: string): number | null {
  const match = content.match(/timeout:\s*(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

function extractThreshold(content: string): number | null {
  const match = content.match(/(?:threshold|errorThreshold|failureThreshold):\s*(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

// ============================================================================
// Learning Circuit Breaker Detector
// ============================================================================

export class CircuitBreakerLearningDetector extends LearningDetector<CircuitBreakerConventions> {
  readonly id = 'errors/circuit-breaker';
  readonly category = 'errors' as const;
  readonly subcategory = 'circuit-breaker';
  readonly name = 'Circuit Breaker Detector (Learning)';
  readonly description = 'Learns circuit breaker patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof CircuitBreakerConventions> {
    return ['library', 'stateManagement', 'defaultTimeout', 'defaultThreshold', 'usesHalfOpen'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof CircuitBreakerConventions, ValueDistribution>
  ): void {
    const breakers = extractCircuitBreakers(context.content, context.file);
    const stateManagement = detectStateManagement(context.content);
    const timeout = extractTimeout(context.content);
    const threshold = extractThreshold(context.content);
    
    const libraryDist = distributions.get('library')!;
    const stateDist = distributions.get('stateManagement')!;
    const timeoutDist = distributions.get('defaultTimeout')!;
    const thresholdDist = distributions.get('defaultThreshold')!;
    const halfOpenDist = distributions.get('usesHalfOpen')!;
    
    for (const breaker of breakers) {
      libraryDist.add(breaker.library, context.file);
    }
    
    if (stateManagement) {stateDist.add(stateManagement, context.file);}
    if (timeout) {timeoutDist.add(timeout, context.file);}
    if (threshold) {thresholdDist.add(threshold, context.file);}
    
    const hasHalfOpen = /halfOpen|half-open|HALF_OPEN/i.test(context.content);
    if (breakers.length > 0) {
      halfOpenDist.add(hasHalfOpen, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<CircuitBreakerConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const breakers = extractCircuitBreakers(context.content, context.file);
    const learnedLibrary = conventions.conventions.library?.value;
    
    for (const breaker of breakers) {
      if (learnedLibrary && breaker.library !== learnedLibrary) {
        violations.push(this.createConventionViolation(
          breaker.file,
          breaker.line,
          breaker.column,
          'circuit breaker library',
          breaker.library,
          learnedLibrary,
          `Using '${breaker.library}' but your project uses '${learnedLibrary}'`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${breaker.library}`,
        location: { file: context.file, line: breaker.line, column: breaker.column },
        confidence: 1.0,
        isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createCircuitBreakerLearningDetector(): CircuitBreakerLearningDetector {
  return new CircuitBreakerLearningDetector();
}
