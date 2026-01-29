/**
 * Spring Error Handling Patterns Semantic Detector
 * 
 * Language-agnostic detector that finds Spring error handling patterns
 * by looking for semantic concepts like @ExceptionHandler, @ControllerAdvice, etc.
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

export class SpringErrorsSemanticDetector extends SemanticDetector {
  readonly id = 'spring/errors-patterns';
  readonly name = 'Spring Error Handling Patterns Detector';
  readonly description = 'Learns error handling patterns from Spring codebases';
  readonly category = 'errors' as const;
  readonly subcategory = 'spring-errors';

  override readonly supportedLanguages: Language[] = ['java'];

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
    return [...SPRING_KEYWORD_GROUPS.errors.keywords];
  }

  protected getSemanticCategory(): string {
    return 'errors';
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
    
    // Skip generic "Exception" in catch blocks that aren't Spring-specific
    // We want to focus on Spring error handling patterns
    if (match.keyword === 'Exception' || match.keyword === 'RuntimeException') {
      // Keep if it's a class definition (custom exception)
      if (/class\s+\w+.*extends.*Exception/.test(match.lineContent)) {
        return true;
      }
      // Keep if it's in a throws clause
      if (/throws\s+.*Exception/.test(match.lineContent)) {
        return true;
      }
      // Skip generic catch blocks
      if (/catch\s*\(/.test(match.lineContent)) {
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
      message: `Error handling pattern differs from codebase norm: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your codebase uses '${dominantPattern.contextType}' for error handling in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createSpringErrorsSemanticDetector(): SpringErrorsSemanticDetector {
  return new SpringErrorsSemanticDetector();
}
