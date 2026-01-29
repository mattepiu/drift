/**
 * xUnit Patterns Semantic Detector for C#
 *
 * Learns xUnit test patterns from the codebase:
 * - [Fact] / [Theory] attributes
 * - [InlineData] / [MemberData] / [ClassData]
 * - IClassFixture<T> / ICollectionFixture<T>
 * - Test naming conventions
 *
 * Uses semantic learning to understand how tests are structured
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

/** File paths that indicate test code */
const TEST_FILE_PATTERNS = [
  /test/i, /spec/i, /\.tests\./i, /\.test\./i,
  /tests\//i, /spec\//i, /_test/i, /_spec/i,
];

/** Keywords in surrounding context that indicate xUnit usage */
const XUNIT_CONTEXT_KEYWORDS = [
  'fact', 'theory', 'inlinedata', 'memberdata', 'classdata',
  'iclassfixture', 'icollectionfixture', 'itestoutputhelper',
  'assert', 'xunit', 'collection', 'trait', 'skip',
];

// ============================================================================
// xUnit Patterns Semantic Detector
// ============================================================================

export class XUnitPatternsSemanticDetector extends SemanticDetector {
  readonly id = 'testing/xunit-patterns';
  readonly name = 'xUnit Patterns Detector';
  readonly description = 'Learns xUnit test patterns from your C# codebase';
  readonly category = 'testing' as const;
  readonly subcategory = 'unit-testing';

  // C# specific
  override readonly supportedLanguages: Language[] = ['csharp'];

  constructor() {
    super({
      minOccurrences: 3,
      dominanceThreshold: 0.3,
      minFiles: 1, // Tests often in single file
      includeComments: false,
      includeStrings: false,
    });
  }


  /**
   * Semantic keywords for xUnit pattern detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // Test attributes
      'Fact', 'Theory',
      // Data attributes
      'InlineData', 'MemberData', 'ClassData',
      // Fixtures
      'IClassFixture', 'ICollectionFixture', 'Collection',
      // Output
      'ITestOutputHelper',
      // Assertions
      'Assert', 'Equal', 'True', 'False', 'Null', 'NotNull',
      'Throws', 'ThrowsAsync', 'Contains', 'Empty', 'NotEmpty',
      // Traits
      'Trait', 'Skip',
    ];
  }

  protected getSemanticCategory(): string {
    return 'testing';
  }

  /**
   * Context-aware filtering for xUnit patterns
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { lineContent, keyword, surroundingContext, file } = match;
    const lineLower = lineContent.toLowerCase();
    const contextLower = surroundingContext.toLowerCase();

    // Skip if it's in a string literal
    if (/["'].*\[Fact\].*["']|["'].*\[Theory\].*["']/i.test(lineContent)) {
      return false;
    }

    // Skip if it's a comment
    if (/^\s*\/\//.test(lineContent) && !lineContent.includes('///')) {
      return false;
    }


    // High-confidence: xUnit attributes
    if (/\[Fact(?:\(|])|\[Theory(?:\(|])/.test(lineContent)) {
      return true;
    }

    // Data attributes
    if (/\[InlineData\s*\(|\[MemberData\s*\(|\[ClassData\s*\(/.test(lineContent)) {
      return true;
    }

    // Fixtures
    if (/IClassFixture<|ICollectionFixture</.test(lineContent)) {
      return true;
    }

    // Test output helper
    if (/ITestOutputHelper/.test(lineContent)) {
      return true;
    }

    // Assert statements
    if (/Assert\.\w+\s*\(/.test(lineContent)) {
      return true;
    }

    // Trait attribute
    if (/\[Trait\s*\(/.test(lineContent)) {
      return true;
    }

    // Check file path for test patterns
    for (const pattern of TEST_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const hasXUnitContext = XUNIT_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (hasXUnitContext) {
          return true;
        }
      }
    }

    // Check for xUnit context in surrounding code
    const hasXUnitContext = XUNIT_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
    return hasXUnitContext && lineLower.includes(keyword.toLowerCase());
  }


  /**
   * Create violation for inconsistent xUnit pattern
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
      message: `Inconsistent xUnit pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for xUnit tests in ${(dominantPattern.percentage * 100).toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Consistent test patterns improve readability and maintainability.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createXUnitPatternsSemanticDetector(): XUnitPatternsSemanticDetector {
  return new XUnitPatternsSemanticDetector();
}
