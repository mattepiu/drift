/**
 * Error Logging Detector - LEARNING VERSION
 *
 * Learns error logging patterns from the user's codebase:
 * - Logger method naming (error, warn, log)
 * - Error context inclusion patterns
 * - Stack trace logging patterns
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

/**
 * Logger type
 */
export type LoggerType = 'console' | 'winston' | 'pino' | 'bunyan' | 'custom';

/**
 * Conventions this detector learns
 */
export interface ErrorLoggingConventions {
  [key: string]: unknown;
  /** Primary logger type */
  loggerType: LoggerType;
  /** Logger variable name */
  loggerName: string | null;
  /** Whether errors include context */
  includesContext: boolean;
  /** Whether stack traces are logged */
  logsStackTrace: boolean;
}

/**
 * Error logging pattern info extracted from code
 */
interface ErrorLoggingPatternInfo {
  loggerType: LoggerType;
  loggerName: string;
  method: string;
  includesContext: boolean;
  includesStack: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect logger type from name
 */
function detectLoggerType(name: string): LoggerType {
  if (name === 'console') {return 'console';}
  if (name.includes('winston')) {return 'winston';}
  if (name.includes('pino')) {return 'pino';}
  if (name.includes('bunyan')) {return 'bunyan';}
  return 'custom';
}

/**
 * Extract error logging patterns from content
 */
function extractErrorLoggingPatterns(content: string, file: string): ErrorLoggingPatternInfo[] {
  const results: ErrorLoggingPatternInfo[] = [];

  // Logger error calls
  const loggerPattern = /(\w+)\.(error|warn|log)\s*\(([^)]*)\)/gi;
  let match;
  while ((match = loggerPattern.exec(content)) !== null) {
    const loggerName = match[1] || '';
    const method = match[2] || '';
    const args = match[3] || '';

    // Skip non-error logging
    if (method !== 'error' && method !== 'warn') {continue;}

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    // Check if includes context object
    const includesContext = /\{[^}]*\}/.test(args) || /context|metadata|meta/.test(args);

    // Check if includes stack trace
    const includesStack = /stack|\.stack|error\.stack/.test(args);

    results.push({
      loggerType: detectLoggerType(loggerName),
      loggerName,
      method,
      includesContext,
      includesStack,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Error Logging Detector
// ============================================================================

export class ErrorLoggingLearningDetector extends LearningDetector<ErrorLoggingConventions> {
  readonly id = 'errors/error-logging';
  readonly category = 'errors' as const;
  readonly subcategory = 'error-logging';
  readonly name = 'Error Logging Detector (Learning)';
  readonly description = 'Learns error logging patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof ErrorLoggingConventions> {
    return ['loggerType', 'loggerName', 'includesContext', 'logsStackTrace'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ErrorLoggingConventions, ValueDistribution>
  ): void {
    const patterns = extractErrorLoggingPatterns(context.content, context.file);

    if (patterns.length === 0) {return;}

    const loggerTypeDist = distributions.get('loggerType')!;
    const loggerNameDist = distributions.get('loggerName')!;
    const contextDist = distributions.get('includesContext')!;
    const stackDist = distributions.get('logsStackTrace')!;

    for (const pattern of patterns) {
      loggerTypeDist.add(pattern.loggerType, context.file);
      loggerNameDist.add(pattern.loggerName, context.file);
      contextDist.add(pattern.includesContext, context.file);
      stackDist.add(pattern.includesStack, context.file);
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ErrorLoggingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const loggingPatterns = extractErrorLoggingPatterns(context.content, context.file);

    if (loggingPatterns.length === 0) {
      return this.createEmptyResult();
    }

    // Get learned conventions
    const learnedLoggerType = conventions.conventions.loggerType?.value;
    const learnedLoggerName = conventions.conventions.loggerName?.value;
    const learnedIncludesContext = conventions.conventions.includesContext?.value;

    // Check logger type consistency
    if (learnedLoggerType && learnedLoggerType !== 'console') {
      for (const pattern of loggingPatterns) {
        if (pattern.loggerType !== learnedLoggerType) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'logger type',
            pattern.loggerType,
            learnedLoggerType,
            `Using ${pattern.loggerType} but project uses ${learnedLoggerType}`
          ));
        }
      }
    }

    // Check logger name consistency
    if (learnedLoggerName) {
      for (const pattern of loggingPatterns) {
        if (pattern.loggerName !== learnedLoggerName && pattern.loggerType !== 'console') {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'logger name',
            pattern.loggerName,
            learnedLoggerName,
            `Using logger '${pattern.loggerName}' but project uses '${learnedLoggerName}'`
          ));
        }
      }
    }

    // Check context inclusion
    if (learnedIncludesContext === true) {
      for (const pattern of loggingPatterns) {
        if (!pattern.includesContext) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'error context',
            'no context',
            'with context',
            `Error logging should include context object`
          ));
        }
      }
    }

    // Create pattern matches
    if (loggingPatterns.length > 0) {
      const firstPattern = loggingPatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/error-logging`,
          location: {
            file: context.file,
            line: firstPattern.line,
            column: firstPattern.column,
          },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  // ============================================================================
  // Quick Fix
  // ============================================================================

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createErrorLoggingLearningDetector(): ErrorLoggingLearningDetector {
  return new ErrorLoggingLearningDetector();
}
