/**
 * Laravel Testing Patterns Detector - SEMANTIC VERSION
 *
 * Learns testing patterns from your Laravel codebase:
 * - Test case patterns (Feature vs Unit)
 * - Database testing patterns (RefreshDatabase, DatabaseTransactions)
 * - HTTP testing patterns (get, post, assertStatus)
 * - Mock and fake patterns
 * - Factory usage patterns
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

const TESTING_FILE_PATTERNS = [
  /tests\//i, /test\.php$/i, /spec\.php$/i,
  /feature\//i, /unit\//i,
];

const TESTING_CONTEXT_KEYWORDS = [
  'phpunit', 'testcase', 'tests\\testcase',
  'illuminate\\foundation\\testing',
  'refreshdatabase', 'databasetransactions', 'withoutmiddleware',
  'actingas', 'assertstatus', 'assertjson', 'assertsee',
  'mock', 'spy', 'fake', 'mockery',
];

// ============================================================================
// Laravel Testing Semantic Detector
// ============================================================================

export class LaravelTestingSemanticDetector extends SemanticDetector {
  readonly id = 'testing/laravel-testing-semantic';
  readonly name = 'Laravel Testing Patterns Detector';
  readonly description = 'Learns testing patterns from your Laravel codebase';
  readonly category = 'testing' as const;
  readonly subcategory = 'laravel';

  override readonly supportedLanguages: Language[] = ['php'];

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
      // Test case patterns
      'TestCase', 'test_', 'test', 'it_', 'should_',
      'Feature', 'Unit', 'Browser', 'Dusk',
      
      // Database testing
      'RefreshDatabase', 'DatabaseTransactions', 'DatabaseMigrations',
      'WithFaker', 'WithoutMiddleware', 'WithoutEvents',
      
      // HTTP testing
      'get', 'post', 'put', 'patch', 'delete', 'json',
      'getJson', 'postJson', 'putJson', 'patchJson', 'deleteJson',
      'actingAs', 'withHeaders', 'withCookies', 'withSession',
      
      // Assertions
      'assertStatus', 'assertOk', 'assertCreated', 'assertNoContent',
      'assertJson', 'assertJsonPath', 'assertJsonStructure',
      'assertSee', 'assertDontSee', 'assertSeeText',
      'assertDatabaseHas', 'assertDatabaseMissing', 'assertDatabaseCount',
      'assertAuthenticated', 'assertGuest',
      
      // Mocking
      'mock', 'spy', 'partialMock', 'Mockery',
      'shouldReceive', 'shouldNotReceive', 'andReturn', 'andThrow',
      
      // Fakes
      'fake', 'Bus', 'Event', 'Mail', 'Notification', 'Queue', 'Storage',
      'assertDispatched', 'assertNotDispatched',
      
      // Factories
      'factory', 'create', 'make', 'state', 'has', 'for',
    ];
  }

  protected getSemanticCategory(): string {
    return 'testing';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    // Only match in test files
    const inTestFile = TESTING_FILE_PATTERNS.some(p => p.test(file));
    if (!inTestFile) {
      return false;
    }

    // High-confidence keywords
    const highConfidenceKeywords = [
      'TestCase', 'RefreshDatabase', 'DatabaseTransactions',
      'assertStatus', 'assertJson', 'assertDatabaseHas',
      'Mockery', 'actingAs',
    ];
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    // Skip comments
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // For ambiguous keywords, require testing context
    const ambiguousKeywords = ['get', 'post', 'put', 'delete', 'create', 'make', 'mock', 'fake'];
    if (ambiguousKeywords.includes(keyword.toLowerCase())) {
      const hasContext = TESTING_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {return false;}
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
      message: `Inconsistent testing pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for testing in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelTestingSemanticDetector(): LaravelTestingSemanticDetector {
  return new LaravelTestingSemanticDetector();
}
