/**
 * Spring Async Patterns Semantic Detector
 * 
 * Language-agnostic detector that finds Spring async/scheduling patterns
 * by looking for semantic concepts like @Async, @Scheduled, CompletableFuture, etc.
 * 
 * NO HARDCODED RULES - learns what's normal from frequency.
 */

import { SPRING_KEYWORD_GROUPS } from './keywords.js';
import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

export class SpringAsyncSemanticDetector extends SemanticDetector {
  readonly id = 'spring/async-patterns';
  readonly name = 'Spring Async Patterns Detector';
  readonly description = 'Learns async and scheduling patterns from Spring codebases';
  readonly category = 'performance' as const;
  readonly subcategory = 'spring-async';

  override readonly supportedLanguages: Language[] = ['java'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: true, // Include strings for cron expressions
    });
  }

  protected getSemanticKeywords(): string[] {
    return [...SPRING_KEYWORD_GROUPS.async.keywords];
  }

  protected getSemanticCategory(): string {
    return 'async';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    // Skip if it's just in a URL or path
    if (/https?:\/\/|\/api\/|\/v\d+\//.test(match.lineContent)) {
      return false;
    }
    
    // Skip if it's in an import statement
    if (/^\s*import\s+/.test(match.lineContent)) {
      return false;
    }
    
    // Skip generic "Future" that isn't CompletableFuture or Spring-related
    if (match.keyword === 'Future') {
      if (!/CompletableFuture|ListenableFuture|Future</.test(match.lineContent)) {
        return false;
      }
    }
    
    // Skip generic "Executor" that isn't Spring-related
    if (match.keyword === 'Executor') {
      if (!/TaskExecutor|ThreadPoolTaskExecutor|Executor\s+\w+\s*=/.test(match.lineContent)) {
        return false;
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
      severity: 'info',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Async pattern differs from codebase norm: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your codebase uses '${dominantPattern.contextType}' for async patterns in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is different from the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: false,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  override generateQuickFix(_violation: Violation): null {
    return null;
  }
}

export function createSpringAsyncSemanticDetector(): SpringAsyncSemanticDetector {
  return new SpringAsyncSemanticDetector();
}
