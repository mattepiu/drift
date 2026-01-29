/**
 * Structured Format Detector - LEARNING VERSION
 *
 * Learns structured logging format patterns from the user's codebase:
 * - Logging library preferences
 * - Log format patterns
 * - Field ordering
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

export type LoggingLibrary = 'winston' | 'pino' | 'bunyan' | 'console' | 'custom';
export type LogFormat = 'json' | 'text' | 'mixed';

export interface StructuredFormatConventions {
  [key: string]: unknown;
  library: LoggingLibrary;
  format: LogFormat;
  usesStructuredContext: boolean;
}

interface LogPatternInfo {
  library: LoggingLibrary;
  format: LogFormat;
  hasContext: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractLogPatterns(content: string, file: string): LogPatternInfo[] {
  const results: LogPatternInfo[] = [];

  // Winston patterns
  const winstonPattern = /winston\.\w+|createLogger|logger\.(info|warn|error|debug)\s*\(/g;
  let match;
  while ((match = winstonPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    const hasContext = /\{[^}]+\}/.test(content.slice(match.index, match.index + 100));

    results.push({
      library: 'winston',
      format: hasContext ? 'json' : 'text',
      hasContext,
      line,
      column,
      file,
    });
  }

  // Pino patterns
  const pinoPattern = /pino\s*\(|logger\.(info|warn|error|debug|fatal)\s*\(\s*\{/g;
  while ((match = pinoPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      library: 'pino',
      format: 'json',
      hasContext: true,
      line,
      column,
      file,
    });
  }

  // Console patterns
  const consolePattern = /console\.(log|info|warn|error|debug)\s*\(/g;
  while ((match = consolePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    const hasContext = /\{[^}]+\}/.test(content.slice(match.index, match.index + 100));

    results.push({
      library: 'console',
      format: hasContext ? 'mixed' : 'text',
      hasContext,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Structured Format Detector
// ============================================================================

export class StructuredFormatLearningDetector extends LearningDetector<StructuredFormatConventions> {
  readonly id = 'logging/structured-format';
  readonly category = 'logging' as const;
  readonly subcategory = 'structured-format';
  readonly name = 'Structured Format Detector (Learning)';
  readonly description = 'Learns structured logging format patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof StructuredFormatConventions> {
    return ['library', 'format', 'usesStructuredContext'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof StructuredFormatConventions, ValueDistribution>
  ): void {
    const patterns = extractLogPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const libraryDist = distributions.get('library')!;
    const formatDist = distributions.get('format')!;
    const contextDist = distributions.get('usesStructuredContext')!;

    for (const pattern of patterns) {
      libraryDist.add(pattern.library, context.file);
      formatDist.add(pattern.format, context.file);
      contextDist.add(pattern.hasContext, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<StructuredFormatConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const logPatterns = extractLogPatterns(context.content, context.file);
    if (logPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedLibrary = conventions.conventions.library?.value;
    const learnedUsesContext = conventions.conventions.usesStructuredContext?.value;

    // Check library consistency
    if (learnedLibrary && learnedLibrary !== 'console') {
      for (const pattern of logPatterns) {
        if (pattern.library !== learnedLibrary && pattern.library !== 'console') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'logging library', pattern.library, learnedLibrary,
            `Using ${pattern.library} but project uses ${learnedLibrary}`
          ));
        }
      }
    }

    // Check structured context consistency
    if (learnedUsesContext === true) {
      for (const pattern of logPatterns) {
        if (!pattern.hasContext && pattern.library !== 'console') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'structured logging', 'no context', 'with context',
            `Log statement should include structured context (project convention)`
          ));
        }
      }
    }

    if (logPatterns.length > 0) {
      const first = logPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/log-format`,
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

export function createStructuredFormatLearningDetector(): StructuredFormatLearningDetector {
  return new StructuredFormatLearningDetector();
}
