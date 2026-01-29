/**
 * Ref Forwarding Detector - SEMANTIC VERSION
 * 
 * Language-agnostic detector that finds ref forwarding patterns
 * by looking for semantic concepts.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

export class RefForwardingSemanticDetector extends SemanticDetector {
  readonly id = 'components/ref-forwarding';
  readonly name = 'Ref Forwarding Detector';
  readonly description = 'Learns ref forwarding patterns from your codebase';
  readonly category = 'components' as const;
  readonly subcategory = 'ref-forwarding';

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
      'ref',
      'Ref',
      'forwardRef',
      'ForwardRef',
      'useRef',
      'createRef',
      'reference',
      'Reference',
    ];
  }

  protected getSemanticCategory(): string {
    return 'components';
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
      message: `Inconsistent ref forwarding pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for ref forwarding in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createRefForwardingSemanticDetector(): RefForwardingSemanticDetector {
  return new RefForwardingSemanticDetector();
}
