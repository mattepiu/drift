/**
 * Spring Configuration Patterns Semantic Detector
 * 
 * Language-agnostic detector that finds Spring configuration patterns
 * by looking for semantic concepts like @Value, @ConfigurationProperties, etc.
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

export class SpringConfigSemanticDetector extends SemanticDetector {
  readonly id = 'spring/config-patterns';
  readonly name = 'Spring Config Patterns Detector';
  readonly description = 'Learns configuration patterns from Spring codebases';
  readonly category = 'config' as const;
  readonly subcategory = 'spring-config';

  override readonly supportedLanguages: Language[] = ['java'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: true, // Include strings for property expressions like "${app.name}"
    });
  }

  protected getSemanticKeywords(): string[] {
    return [...SPRING_KEYWORD_GROUPS.config.keywords];
  }

  protected getSemanticCategory(): string {
    return 'config';
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
    
    // Skip generic "Value" matches that aren't Spring @Value
    if (match.keyword === 'Value' && !/@Value\b/.test(match.lineContent)) {
      return false;
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
      message: `Config pattern differs from codebase norm: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your codebase uses '${dominantPattern.contextType}' for configuration in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createSpringConfigSemanticDetector(): SpringConfigSemanticDetector {
  return new SpringConfigSemanticDetector();
}
