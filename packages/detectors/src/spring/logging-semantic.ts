/**
 * Spring Logging Patterns Semantic Detector
 * 
 * Language-agnostic detector that finds Spring/SLF4J logging patterns
 * by looking for semantic concepts like Logger, LoggerFactory, MDC, etc.
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

export class SpringLoggingSemanticDetector extends SemanticDetector {
  readonly id = 'spring/logging-patterns';
  readonly name = 'Spring Logging Patterns Detector';
  readonly description = 'Learns logging patterns from Spring codebases';
  readonly category = 'logging' as const;
  readonly subcategory = 'spring-logging';

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
    return [...SPRING_KEYWORD_GROUPS.logging.keywords];
  }

  protected getSemanticCategory(): string {
    return 'logging';
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
    
    // Skip generic "log" that might be Math.log or similar
    if (match.keyword === 'log') {
      if (/Math\.log/.test(match.lineContent)) {
        return false;
      }
      // Keep if it's a logger call like log.info, log.debug, etc.
      if (!/\blog\.(trace|debug|info|warn|error)\b/.test(match.lineContent)) {
        // Check if it's a logger field declaration
        if (!/\bLogger\b.*\blog\b|\blog\b.*=.*Logger/.test(match.lineContent)) {
          return false;
        }
      }
    }
    
    // Skip generic "put", "get", "remove", "clear" that aren't MDC-related
    if (['put', 'get', 'remove', 'clear'].includes(match.keyword)) {
      if (!/MDC\.(put|get|remove|clear)/.test(match.lineContent)) {
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
      message: `Logging pattern differs from codebase norm: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your codebase uses '${dominantPattern.contextType}' for logging in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createSpringLoggingSemanticDetector(): SpringLoggingSemanticDetector {
  return new SpringLoggingSemanticDetector();
}
