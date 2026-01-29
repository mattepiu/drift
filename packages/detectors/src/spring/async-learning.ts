/**
 * Spring Async Patterns Detector - LEARNING VERSION
 *
 * Learns async patterns from the user's codebase:
 * - @Async usage patterns
 * - @Scheduled configuration patterns
 * - CompletableFuture return type patterns
 * - Thread pool configuration patterns
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

export type AsyncReturnStyle = 'completable-future' | 'future' | 'void' | 'mixed';
export type ScheduleStyle = 'fixed-rate' | 'fixed-delay' | 'cron' | 'mixed';

export interface SpringAsyncConventions {
  [key: string]: unknown;
  /** Preferred return type for @Async methods */
  asyncReturnStyle: AsyncReturnStyle;
  /** Preferred scheduling style */
  scheduleStyle: ScheduleStyle;
  /** Whether custom executor is used */
  usesCustomExecutor: boolean;
  /** Whether @Async specifies executor name */
  asyncSpecifiesExecutor: boolean;
}

interface AsyncPatternInfo {
  /** The async keyword found */
  keyword: string;
  /** Type of async pattern */
  patternType: 'async' | 'scheduled' | 'future' | 'executor' | 'config';
  /** Specific value for categorization (can be keyword or derived value like 'fixed-rate') */
  value: string;
  /** Whether it has parameters */
  hasParams: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractAsyncPatterns(content: string, file: string): AsyncPatternInfo[] {
  const results: AsyncPatternInfo[] = [];
  const keywords = SPRING_KEYWORD_GROUPS.async.keywords;

  for (const keyword of keywords) {
    const pattern = new RegExp(`@${keyword}\\b|\\b${keyword}\\b`, 'g');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip imports
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.slice(lineStart, content.indexOf('\n', match.index));
      if (lineContent.trim().startsWith('import ')) {continue;}

      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      // Categorize the pattern
      let patternType: AsyncPatternInfo['patternType'] = 'config';
      let value: string = keyword;
      let hasParams = false;

      if (keyword === 'Async') {
        patternType = 'async';
        // Check if @Async has executor parameter
        const afterMatch = content.slice(match.index, match.index + 50);
        hasParams = /@Async\s*\(\s*["']/.test(afterMatch);
      } else if (keyword === 'Scheduled' || keyword === 'Schedules') {
        patternType = 'scheduled';
        // Determine schedule type
        const afterMatch = content.slice(match.index, match.index + 100);
        if (/fixedRate\s*=/.test(afterMatch)) {value = 'fixed-rate';}
        else if (/fixedDelay\s*=/.test(afterMatch)) {value = 'fixed-delay';}
        else if (/cron\s*=/.test(afterMatch)) {value = 'cron';}
      } else if (['fixedRate', 'fixedDelay', 'cron'].includes(keyword)) {
        patternType = 'scheduled';
        value = keyword === 'fixedRate' ? 'fixed-rate' : 
                keyword === 'fixedDelay' ? 'fixed-delay' : 'cron';
      } else if (['CompletableFuture', 'Future', 'ListenableFuture'].includes(keyword)) {
        patternType = 'future';
        value = keyword === 'CompletableFuture' ? 'completable-future' : 'future';
      } else if (['ThreadPoolTaskExecutor', 'TaskExecutor', 'Executor'].includes(keyword)) {
        patternType = 'executor';
      } else if (['EnableAsync', 'EnableScheduling', 'AsyncConfigurer'].includes(keyword)) {
        patternType = 'config';
      }

      results.push({
        keyword,
        patternType,
        value,
        hasParams,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Detector
// ============================================================================

export class SpringAsyncLearningDetector extends LearningDetector<SpringAsyncConventions> {
  readonly id = 'spring/async-patterns-learning';
  readonly category = 'performance' as const;
  readonly subcategory = 'spring-async';
  readonly name = 'Spring Async Patterns Detector (Learning)';
  readonly description = 'Learns async and scheduling patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringAsyncConventions> {
    return ['asyncReturnStyle', 'scheduleStyle', 'usesCustomExecutor', 'asyncSpecifiesExecutor'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringAsyncConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractAsyncPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const returnStyleDist = distributions.get('asyncReturnStyle')!;
    const scheduleStyleDist = distributions.get('scheduleStyle')!;
    const customExecutorDist = distributions.get('usesCustomExecutor')!;
    const asyncExecutorDist = distributions.get('asyncSpecifiesExecutor')!;

    for (const pattern of patterns) {
      if (pattern.patternType === 'future') {
        returnStyleDist.add(pattern.value as AsyncReturnStyle, context.file);
      } else if (pattern.patternType === 'scheduled') {
        if (['fixed-rate', 'fixed-delay', 'cron'].includes(pattern.value)) {
          scheduleStyleDist.add(pattern.value as ScheduleStyle, context.file);
        }
      } else if (pattern.patternType === 'executor') {
        customExecutorDist.add(true, context.file);
      } else if (pattern.patternType === 'async' && pattern.keyword === 'Async') {
        asyncExecutorDist.add(pattern.hasParams, context.file);
      }
    }

    // Check for void return on @Async methods
    const asyncVoidPattern = /@Async[^)]*\)\s*\n\s*(?:public\s+)?void\s+\w+/g;
    if (asyncVoidPattern.test(context.content)) {
      returnStyleDist.add('void' as AsyncReturnStyle, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringAsyncConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractAsyncPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedReturnStyle = conventions.conventions.asyncReturnStyle?.value;
    const learnedScheduleStyle = conventions.conventions.scheduleStyle?.value;
    const learnedAsyncExecutor = conventions.conventions.asyncSpecifiesExecutor?.value;

    // Check for async return style consistency
    if (learnedReturnStyle && learnedReturnStyle !== 'mixed') {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'future') {
          const currentStyle = pattern.value as AsyncReturnStyle;
          if (currentStyle !== learnedReturnStyle) {
            violations.push(this.createConventionViolation(
              context.file, pattern.line, pattern.column,
              'async return type', pattern.keyword, 
              learnedReturnStyle === 'completable-future' ? 'CompletableFuture' : 'Future',
              `Using ${pattern.keyword} but project prefers ${learnedReturnStyle}`
            ));
          }
        }
      }
    }

    // Check for schedule style consistency
    if (learnedScheduleStyle && learnedScheduleStyle !== 'mixed') {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'scheduled' && 
            ['fixed-rate', 'fixed-delay', 'cron'].includes(pattern.value)) {
          if (pattern.value !== learnedScheduleStyle) {
            violations.push(this.createConventionViolation(
              context.file, pattern.line, pattern.column,
              'schedule style', pattern.value, learnedScheduleStyle,
              `Using ${pattern.value} scheduling but project prefers ${learnedScheduleStyle}`
            ));
          }
        }
      }
    }

    // Check for @Async executor specification consistency
    if (learnedAsyncExecutor !== undefined) {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'async' && pattern.keyword === 'Async') {
          if (pattern.hasParams !== learnedAsyncExecutor) {
            const expected = learnedAsyncExecutor ? 'with executor' : 'without executor';
            const actual = pattern.hasParams ? 'with executor' : 'without executor';
            violations.push(this.createConventionViolation(
              context.file, pattern.line, pattern.column,
              '@Async executor specification', actual, expected,
              `@Async ${actual} but project uses @Async ${expected}`
            ));
          }
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/async`,
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

export function createSpringAsyncLearningDetector(): SpringAsyncLearningDetector {
  return new SpringAsyncLearningDetector();
}
