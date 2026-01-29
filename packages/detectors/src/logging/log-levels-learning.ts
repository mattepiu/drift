/**
 * Log Levels Detector - LEARNING VERSION
 *
 * Learns log level patterns from the user's codebase:
 * - Logger library used
 * - Log level naming conventions
 * - Log level usage patterns
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
 * Logger library type
 */
export type LoggerLibrary = 'console' | 'winston' | 'pino' | 'bunyan' | 'log4js' | 'custom';

/**
 * Conventions this detector learns
 */
export interface LogLevelConventions {
  [key: string]: unknown;
  /** Logger library used */
  library: LoggerLibrary;
  /** Logger variable name */
  loggerName: string;
  /** Whether structured logging is used */
  usesStructuredLogging: boolean;
}

/**
 * Log level pattern info
 */
interface LogLevelPatternInfo {
  library: LoggerLibrary;
  loggerName: string;
  level: string;
  isStructured: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect logger library from name and content
 */
function detectLibrary(loggerName: string, content: string): LoggerLibrary {
  if (loggerName === 'console') {return 'console';}
  if (/winston/.test(content)) {return 'winston';}
  if (/pino/.test(content)) {return 'pino';}
  if (/bunyan/.test(content)) {return 'bunyan';}
  if (/log4js/.test(content)) {return 'log4js';}
  return 'custom';
}

/**
 * Extract log level patterns from content
 */
function extractLogLevelPatterns(content: string, file: string): LogLevelPatternInfo[] {
  const results: LogLevelPatternInfo[] = [];

  // Logger method calls
  const logPattern = /(\w+)\.(debug|info|warn|error|log|trace|fatal|verbose)\s*\(([^)]*)\)/gi;
  let match;
  while ((match = logPattern.exec(content)) !== null) {
    const loggerName = match[1] || '';
    const level = match[2] || '';
    const args = match[3] || '';

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    // Check if structured (object as first arg)
    const isStructured = /^\s*\{/.test(args);

    results.push({
      library: detectLibrary(loggerName, content),
      loggerName,
      level: level.toLowerCase(),
      isStructured,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Log Levels Detector
// ============================================================================

export class LogLevelsLearningDetector extends LearningDetector<LogLevelConventions> {
  readonly id = 'logging/log-levels';
  readonly category = 'logging' as const;
  readonly subcategory = 'log-levels';
  readonly name = 'Log Levels Detector (Learning)';
  readonly description = 'Learns log level patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof LogLevelConventions> {
    return ['library', 'loggerName', 'usesStructuredLogging'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof LogLevelConventions, ValueDistribution>
  ): void {
    const patterns = extractLogLevelPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const libraryDist = distributions.get('library')!;
    const loggerNameDist = distributions.get('loggerName')!;
    const structuredDist = distributions.get('usesStructuredLogging')!;

    for (const pattern of patterns) {
      libraryDist.add(pattern.library, context.file);
      if (pattern.loggerName !== 'console') {
        loggerNameDist.add(pattern.loggerName, context.file);
      }
      structuredDist.add(pattern.isStructured, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<LogLevelConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const logPatterns = extractLogLevelPatterns(context.content, context.file);
    if (logPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedLibrary = conventions.conventions.library?.value;
    const learnedLoggerName = conventions.conventions.loggerName?.value;

    // Check library consistency
    if (learnedLibrary && learnedLibrary !== 'console') {
      for (const pattern of logPatterns) {
        if (pattern.library !== learnedLibrary && pattern.library !== 'console') {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'logger library',
            pattern.library,
            learnedLibrary,
            `Using ${pattern.library} but project uses ${learnedLibrary}`
          ));
        }
      }
    }

    // Check logger name consistency
    if (learnedLoggerName) {
      for (const pattern of logPatterns) {
        if (pattern.loggerName !== learnedLoggerName && pattern.loggerName !== 'console') {
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

    if (logPatterns.length > 0) {
      const firstPattern = logPatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/log-levels`,
          location: { file: context.file, line: firstPattern.line, column: firstPattern.column },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createLogLevelsLearningDetector(): LogLevelsLearningDetector {
  return new LogLevelsLearningDetector();
}
