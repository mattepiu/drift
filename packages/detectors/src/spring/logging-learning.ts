/**
 * Spring Logging Patterns Detector - LEARNING VERSION
 *
 * Learns logging patterns from the user's codebase:
 * - Logger declaration style (SLF4J, Lombok @Slf4j, Log4j)
 * - Logger naming conventions
 * - MDC usage patterns
 * - Log level preferences
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import { SPRING_KEYWORD_GROUPS } from './keywords.js';
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

export type LoggerStyle = 'slf4j' | 'lombok' | 'log4j' | 'log4j2' | 'commons';
export type LoggerNaming = 'log' | 'logger' | 'LOG' | 'LOGGER' | 'other';

export interface SpringLoggingConventions {
  [key: string]: unknown;
  /** How loggers are declared */
  loggerStyle: LoggerStyle;
  /** Logger field naming convention */
  loggerNaming: LoggerNaming;
  /** Whether MDC is used for context */
  usesMDC: boolean;
  /** Primary log level used */
  primaryLogLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
}

interface LoggingPatternInfo {
  /** The logging keyword found */
  keyword: string;
  /** Type of logging pattern */
  patternType: 'declaration' | 'usage' | 'mdc' | 'annotation';
  /** Specific value for categorization */
  value: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractLoggingPatterns(content: string, file: string): LoggingPatternInfo[] {
  const results: LoggingPatternInfo[] = [];
  const keywords = SPRING_KEYWORD_GROUPS.logging.keywords;

  for (const keyword of keywords) {
    const pattern = new RegExp(`@${keyword}\\b|\\b${keyword}\\b`, 'g');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip imports
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.slice(lineStart, content.indexOf('\n', match.index));
      if (lineContent.trim().startsWith('import ')) {continue;}

      // Skip Math.log
      if (keyword === 'log' && /Math\.log/.test(lineContent)) {continue;}

      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      // Categorize the pattern
      let patternType: LoggingPatternInfo['patternType'] = 'usage';
      let value: string = keyword;

      if (keyword === 'Logger' || keyword === 'LoggerFactory' || keyword === 'getLogger') {
        patternType = 'declaration';
        value = 'slf4j';
      } else if (['Slf4j', 'Log4j', 'Log4j2', 'CommonsLog'].includes(keyword)) {
        patternType = 'annotation';
        value = keyword.toLowerCase();
      } else if (keyword === 'MDC' || ['put', 'get', 'remove', 'clear'].includes(keyword)) {
        if (keyword === 'MDC' || /MDC\.(put|get|remove|clear)/.test(lineContent)) {
          patternType = 'mdc';
        }
      } else if (['trace', 'debug', 'info', 'warn', 'error'].includes(keyword)) {
        patternType = 'usage';
        value = keyword;
      }

      results.push({
        keyword,
        patternType,
        value,
        line,
        column,
        file,
      });
    }
  }

  // Detect logger field naming
  const loggerFieldPattern = /(?:private\s+)?(?:static\s+)?(?:final\s+)?Logger\s+(\w+)\s*=/g;
  let match;
  while ((match = loggerFieldPattern.exec(content)) !== null) {
    const fieldName = match[1]!;
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      keyword: fieldName,
      patternType: 'declaration',
      value: fieldName,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Detector
// ============================================================================

export class SpringLoggingLearningDetector extends LearningDetector<SpringLoggingConventions> {
  readonly id = 'spring/logging-patterns-learning';
  readonly category = 'logging' as const;
  readonly subcategory = 'spring-logging';
  readonly name = 'Spring Logging Patterns Detector (Learning)';
  readonly description = 'Learns logging patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringLoggingConventions> {
    return ['loggerStyle', 'loggerNaming', 'usesMDC', 'primaryLogLevel'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringLoggingConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractLoggingPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('loggerStyle')!;
    const namingDist = distributions.get('loggerNaming')!;
    const mdcDist = distributions.get('usesMDC')!;
    const levelDist = distributions.get('primaryLogLevel')!;

    for (const pattern of patterns) {
      if (pattern.patternType === 'declaration') {
        if (pattern.value === 'slf4j') {
          styleDist.add('slf4j' as LoggerStyle, context.file);
        }
        // Track logger field naming
        const name = pattern.keyword;
        if (name === 'log' || name === 'logger' || name === 'LOG' || name === 'LOGGER') {
          namingDist.add(name as LoggerNaming, context.file);
        }
      } else if (pattern.patternType === 'annotation') {
        if (pattern.value === 'slf4j') {
          styleDist.add('lombok' as LoggerStyle, context.file);
        } else if (pattern.value === 'log4j') {
          styleDist.add('log4j' as LoggerStyle, context.file);
        } else if (pattern.value === 'log4j2') {
          styleDist.add('log4j2' as LoggerStyle, context.file);
        } else if (pattern.value === 'commonslog') {
          styleDist.add('commons' as LoggerStyle, context.file);
        }
      } else if (pattern.patternType === 'mdc') {
        mdcDist.add(true, context.file);
      } else if (pattern.patternType === 'usage') {
        const level = pattern.value as 'trace' | 'debug' | 'info' | 'warn' | 'error';
        if (['trace', 'debug', 'info', 'warn', 'error'].includes(level)) {
          levelDist.add(level, context.file);
        }
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringLoggingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractLoggingPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.loggerStyle?.value;
    const learnedNaming = conventions.conventions.loggerNaming?.value;

    // Check for logger style consistency
    if (learnedStyle) {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'declaration' || pattern.patternType === 'annotation') {
          let currentStyle: LoggerStyle | null = null;
          
          if (pattern.patternType === 'annotation') {
            if (pattern.value === 'slf4j') {currentStyle = 'lombok';}
            else if (pattern.value === 'log4j') {currentStyle = 'log4j';}
            else if (pattern.value === 'log4j2') {currentStyle = 'log4j2';}
          } else if (pattern.value === 'slf4j') {
            currentStyle = 'slf4j';
          }

          if (currentStyle && currentStyle !== learnedStyle) {
            violations.push(this.createConventionViolation(
              context.file, pattern.line, pattern.column,
              'logger style', currentStyle, learnedStyle,
              `Using ${currentStyle} logging but project uses ${learnedStyle}`
            ));
          }
        }
      }
    }

    // Check for logger naming consistency
    if (learnedNaming && learnedNaming !== 'other') {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'declaration') {
          const name = pattern.keyword;
          if (['log', 'logger', 'LOG', 'LOGGER'].includes(name) && name !== learnedNaming) {
            violations.push(this.createConventionViolation(
              context.file, pattern.line, pattern.column,
              'logger field name', name, learnedNaming,
              `Logger named '${name}' but project uses '${learnedNaming}'`
            ));
          }
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/logging`,
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

export function createSpringLoggingLearningDetector(): SpringLoggingLearningDetector {
  return new SpringLoggingLearningDetector();
}
