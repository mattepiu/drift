/**
 * XML Documentation Semantic Detector for C#
 *
 * Learns XML documentation patterns from the codebase:
 * - /// <summary> comments
 * - <param>, <returns>, <exception> tags
 * - <inheritdoc/> usage
 * - Documentation coverage patterns
 *
 * Uses semantic learning to understand how documentation is used
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

/** Keywords in surrounding context that indicate documentation usage */
const DOC_CONTEXT_KEYWORDS = [
  'summary', 'param', 'returns', 'exception', 'remarks',
  'example', 'inheritdoc', 'see', 'seealso', 'value',
  'typeparam', 'include', 'permission', 'cref',
];

// ============================================================================
// XML Documentation Semantic Detector
// ============================================================================

export class XmlDocumentationSemanticDetector extends SemanticDetector {
  readonly id = 'documentation/csharp-xml-docs';
  readonly name = 'C# XML Documentation Detector';
  readonly description = 'Learns XML documentation patterns from your C# codebase';
  readonly category = 'documentation' as const;
  readonly subcategory = 'api-documentation';

  // C# specific
  override readonly supportedLanguages: Language[] = ['csharp'];

  constructor() {
    super({
      minOccurrences: 3,
      dominanceThreshold: 0.3,
      minFiles: 2,
      includeComments: true, // XML docs are in comments
      includeStrings: false,
    });
  }

  /**
   * Semantic keywords for XML documentation detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // XML doc tags
      'summary', 'param', 'returns', 'exception', 'remarks',
      'example', 'inheritdoc', 'see', 'seealso', 'value',
      'typeparam', 'include', 'permission',
      // Triple-slash indicator
      '///',
    ];
  }

  protected getSemanticCategory(): string {
    return 'documentation';
  }

  /**
   * Context-aware filtering for XML documentation
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { lineContent, keyword } = match;
    const lineLower = lineContent.toLowerCase();

    // Must be in a triple-slash comment or XML tag context
    if (!lineContent.includes('///') && !lineContent.includes('<') && !lineContent.includes('>')) {
      return false;
    }

    // Skip if it's just a regular comment without XML structure
    if (lineContent.includes('//') && !lineContent.includes('///')) {
      return false;
    }

    // Skip if it's in a string literal (not a doc comment)
    if (/["'].*<.*>.*["']/.test(lineContent) && !lineContent.includes('///')) {
      return false;
    }

    // High-confidence: actual XML doc tags
    const xmlTagPattern = new RegExp(`<\\s*${keyword}[\\s>]|</${keyword}>`, 'i');
    if (xmlTagPattern.test(lineContent)) {
      return true;
    }

    // Triple-slash comments are always relevant
    if (lineContent.trim().startsWith('///')) {
      return true;
    }

    // Check for doc context keywords
    const hasDocContext = DOC_CONTEXT_KEYWORDS.some(k => lineLower.includes(k));
    return hasDocContext;
  }

  /**
   * Create violation for inconsistent documentation pattern
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
      message: `Inconsistent XML documentation pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for XML documentation in ${(dominantPattern.percentage * 100).toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createXmlDocumentationSemanticDetector(): XmlDocumentationSemanticDetector {
  return new XmlDocumentationSemanticDetector();
}
