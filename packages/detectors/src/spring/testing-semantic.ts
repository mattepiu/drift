/**
 * Spring Testing Patterns Semantic Detector
 * 
 * Language-agnostic detector that finds Spring testing patterns
 * by looking for semantic concepts like @SpringBootTest, @MockBean, MockMvc, etc.
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

export class SpringTestingSemanticDetector extends SemanticDetector {
  readonly id = 'spring/testing-patterns';
  readonly name = 'Spring Testing Patterns Detector';
  readonly description = 'Learns testing patterns from Spring codebases';
  readonly category = 'testing' as const;
  readonly subcategory = 'spring-testing';

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
    return [...SPRING_KEYWORD_GROUPS.testing.keywords];
  }

  protected getSemanticCategory(): string {
    return 'testing';
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
    
    // Skip generic "Test" that isn't a JUnit annotation
    if (match.keyword === 'Test' && !/@Test\b/.test(match.lineContent)) {
      // Could be a class name like "UserServiceTest"
      if (!/Test\s*\(/.test(match.lineContent) && !/class\s+\w*Test/.test(match.lineContent)) {
        return false;
      }
    }
    
    // Skip generic "when" that isn't Mockito
    if (match.keyword === 'when') {
      if (!/when\s*\(/.test(match.lineContent)) {
        return false;
      }
    }
    
    // Skip generic "verify" that isn't Mockito
    if (match.keyword === 'verify') {
      if (!/verify\s*\(/.test(match.lineContent)) {
        return false;
      }
    }
    
    // Skip generic "any" that isn't Mockito
    if (match.keyword === 'any') {
      if (!/any\s*\(|any\(\)/.test(match.lineContent)) {
        return false;
      }
    }
    
    // Skip generic "eq" that isn't Mockito
    if (match.keyword === 'eq') {
      if (!/eq\s*\(/.test(match.lineContent)) {
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
      message: `Testing pattern differs from codebase norm: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your codebase uses '${dominantPattern.contextType}' for testing in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createSpringTestingSemanticDetector(): SpringTestingSemanticDetector {
  return new SpringTestingSemanticDetector();
}
