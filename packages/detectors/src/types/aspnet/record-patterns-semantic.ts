/**
 * Record Patterns Semantic Detector for C#
 *
 * Learns record type usage patterns from the codebase:
 * - record vs record class vs record struct
 * - Primary constructor parameters
 * - with expression usage
 * - Positional records
 *
 * Uses semantic learning to understand how records are used
 * and detect inconsistencies.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';


// ============================================================================
// Context Validation Patterns
// ============================================================================

/** File paths that typically contain record definitions */
const RECORD_FILE_PATTERNS = [
  /model/i, /dto/i, /entity/i, /domain/i, /types/i,
  /contract/i, /request/i, /response/i, /event/i,
  /command/i, /query/i, /message/i,
];

/** Keywords in surrounding context that indicate record usage */
const RECORD_CONTEXT_KEYWORDS = [
  'record', 'struct', 'class', 'with', 'init',
  'required', 'primary', 'constructor', 'positional',
  'immutable', 'value', 'equality',
];

// ============================================================================
// Record Patterns Semantic Detector
// ============================================================================

export class RecordPatternsSemanticDetector extends SemanticDetector {
  readonly id = 'types/csharp-record-patterns';
  readonly name = 'C# Record Patterns Detector';
  readonly description = 'Learns record type usage patterns from your C# codebase';
  readonly category = 'types' as const;
  readonly subcategory = 'type-definitions';

  // C# specific
  override readonly supportedLanguages: Language[] = ['csharp'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: false,
    });
  }


  /**
   * Semantic keywords for record pattern detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // Record declarations
      'record', 'struct',
      // with expression
      'with',
      // Init-only setters
      'init',
      // Required members
      'required',
    ];
  }

  protected getSemanticCategory(): string {
    return 'types';
  }

  /**
   * Context-aware filtering for record patterns
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { lineContent, keyword, surroundingContext, file } = match;
    const lineLower = lineContent.toLowerCase();
    const contextLower = surroundingContext.toLowerCase();

    // Skip if it's in a string literal
    if (/["'].*record.*["']/i.test(lineContent)) {
      return false;
    }

    // Skip if it's a comment
    if (/^\s*\/\//.test(lineContent) && !lineContent.includes('///')) {
      return false;
    }


    // High-confidence: record declarations
    if (/(?:public|internal|private|protected)?\s*record\s+struct\s+\w+/.test(lineContent)) {
      return true;
    }

    if (/(?:public|internal|private|protected)?\s*record\s+(?:class\s+)?\w+/.test(lineContent)) {
      return true;
    }

    // with expression usage
    if (/\s+with\s*\{/.test(lineContent)) {
      return true;
    }

    // init-only setter
    if (/\{\s*get;\s*init;\s*\}/.test(lineContent)) {
      return true;
    }

    // required modifier
    if (/\brequired\s+\w+/.test(lineContent)) {
      return true;
    }

    // Check file path for record patterns
    for (const pattern of RECORD_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const hasRecordContext = RECORD_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (hasRecordContext) {
          return true;
        }
      }
    }

    // Check for record context in surrounding code
    const hasRecordContext = RECORD_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
    return hasRecordContext && lineLower.includes(keyword.toLowerCase());
  }


  /**
   * Create violation for inconsistent record pattern
   */
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
      message: `Inconsistent record pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for record types in ${(dominantPattern.percentage * 100).toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Consistent record patterns improve code readability and maintainability.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createRecordPatternsSemanticDetector(): RecordPatternsSemanticDetector {
  return new RecordPatternsSemanticDetector();
}
