/**
 * File Location Detector - SEMANTIC VERSION
 * 
 * Language-agnostic detector that finds type file location patterns
 * by looking for semantic concepts.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

export class FileLocationSemanticDetector extends SemanticDetector {
  readonly id = 'types/file-location';
  readonly name = 'File Location Detector';
  readonly description = 'Learns type file location patterns from your codebase';
  readonly category = 'types' as const;
  readonly subcategory = 'file-location';

  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'css', 'scss', 'json', 'yaml', 'markdown'
  ];

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
    return [
      'type',
      'types',
      'interface',
      'interfaces',
      'd.ts',
    ];
  }

  protected getSemanticCategory(): string {
    return 'types';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    if (/https?:\/\/|\/api\/|\/v\d+\//.test(match.lineContent)) {
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
      severity: 'warning',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent file location pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for file location in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  override generateQuickFix(_violation: Violation): null {
    return null;
  }
}

export function createFileLocationSemanticDetector(): FileLocationSemanticDetector {
  return new FileLocationSemanticDetector();
}
