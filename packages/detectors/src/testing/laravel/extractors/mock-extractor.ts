/**
 * Laravel Mock Extractor
 *
 * Extracts mock, spy, and fake usages from Laravel tests.
 *
 * @module testing/laravel/extractors/mock-extractor
 */

import type {
  MockUsageInfo,
  MockExpectationInfo,
  MockExtractionResult,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Mockery mock
 */
const MOCKERY_MOCK_PATTERN = /Mockery::mock\s*\(\s*([A-Z][\w\\]+)(?:::class)?\s*\)/g;

/**
 * Mockery spy
 */
const MOCKERY_SPY_PATTERN = /Mockery::spy\s*\(\s*([A-Z][\w\\]+)(?:::class)?\s*\)/g;

/**
 * Laravel mock helper
 */
const LARAVEL_MOCK_PATTERN = /\$this->mock\s*\(\s*([A-Z][\w\\]+)::class/g;

/**
 * Laravel partial mock
 */
const LARAVEL_PARTIAL_PATTERN = /\$this->partialMock\s*\(\s*([A-Z][\w\\]+)::class/g;

/**
 * Laravel spy helper
 */
const LARAVEL_SPY_PATTERN = /\$this->spy\s*\(\s*([A-Z][\w\\]+)::class/g;

/**
 * Laravel fake helpers
 */
const FAKE_PATTERNS = {
  event: /Event::fake\s*\(/g,
  queue: /Queue::fake\s*\(/g,
  mail: /Mail::fake\s*\(/g,
  notification: /Notification::fake\s*\(/g,
  storage: /Storage::fake\s*\(/g,
  bus: /Bus::fake\s*\(/g,
  http: /Http::fake\s*\(/g,
};

/**
 * Mock expectation - shouldReceive
 */
const SHOULD_RECEIVE_PATTERN = /->shouldReceive\s*\(\s*['"](\w+)['"]\s*\)/g;

/**
 * Mock expectation - expects
 */
const EXPECTS_PATTERN = /->expects\s*\(\s*['"](\w+)['"]\s*\)/g;

/**
 * Times expectation
 */
const TIMES_PATTERN = /->times\s*\(\s*(\d+)\s*\)/;

/**
 * Once expectation
 */
const ONCE_PATTERN = /->once\s*\(/;

/**
 * Twice expectation
 */
const TWICE_PATTERN = /->twice\s*\(/;

/**
 * Never expectation
 */
const NEVER_PATTERN = /->never\s*\(/;

/**
 * Return value
 */
const RETURN_PATTERN = /->andReturn\s*\(\s*([^)]+)\s*\)/;

// ============================================================================
// Mock Extractor
// ============================================================================

/**
 * Extracts mock usages from Laravel tests
 */
export class MockExtractor {
  /**
   * Extract all mocks from content
   */
  extract(content: string, file: string): MockExtractionResult {
    const mocks = this.extractMocks(content, file);
    const confidence = mocks.length > 0 ? 0.9 : 0;

    return {
      mocks,
      confidence,
    };
  }

  /**
   * Check if content contains mocks
   */
  hasMocks(content: string): boolean {
    return (
      content.includes('Mockery::') ||
      content.includes('$this->mock(') ||
      content.includes('$this->spy(') ||
      content.includes('::fake(')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract all mock usages
   */
  private extractMocks(content: string, file: string): MockUsageInfo[] {
    const mocks: MockUsageInfo[] = [];

    // Mockery mocks
    mocks.push(...this.extractMockeryMocks(content, file));

    // Laravel mocks
    mocks.push(...this.extractLaravelMocks(content, file));

    // Laravel fakes
    mocks.push(...this.extractFakes(content, file));

    return mocks;
  }

  /**
   * Extract Mockery mock usages
   */
  private extractMockeryMocks(content: string, file: string): MockUsageInfo[] {
    const mocks: MockUsageInfo[] = [];

    // Regular mocks
    MOCKERY_MOCK_PATTERN.lastIndex = 0;
    let match;
    while ((match = MOCKERY_MOCK_PATTERN.exec(content)) !== null) {
      const targetClass = this.extractClassName(match[1] || '');
      const line = this.getLineNumber(content, match.index);
      const expectations = this.extractExpectations(content, match.index);

      mocks.push({
        type: 'mock',
        targetClass,
        expectations,
        file,
        line,
      });
    }

    // Spies
    MOCKERY_SPY_PATTERN.lastIndex = 0;
    while ((match = MOCKERY_SPY_PATTERN.exec(content)) !== null) {
      const targetClass = this.extractClassName(match[1] || '');
      const line = this.getLineNumber(content, match.index);
      const expectations = this.extractExpectations(content, match.index);

      mocks.push({
        type: 'spy',
        targetClass,
        expectations,
        file,
        line,
      });
    }

    return mocks;
  }

  /**
   * Extract Laravel mock helper usages
   */
  private extractLaravelMocks(content: string, file: string): MockUsageInfo[] {
    const mocks: MockUsageInfo[] = [];

    // Regular mocks
    LARAVEL_MOCK_PATTERN.lastIndex = 0;
    let match;
    while ((match = LARAVEL_MOCK_PATTERN.exec(content)) !== null) {
      const targetClass = this.extractClassName(match[1] || '');
      const line = this.getLineNumber(content, match.index);
      const expectations = this.extractExpectations(content, match.index);

      mocks.push({
        type: 'mock',
        targetClass,
        expectations,
        file,
        line,
      });
    }

    // Partial mocks
    LARAVEL_PARTIAL_PATTERN.lastIndex = 0;
    while ((match = LARAVEL_PARTIAL_PATTERN.exec(content)) !== null) {
      const targetClass = this.extractClassName(match[1] || '');
      const line = this.getLineNumber(content, match.index);
      const expectations = this.extractExpectations(content, match.index);

      mocks.push({
        type: 'partial',
        targetClass,
        expectations,
        file,
        line,
      });
    }

    // Spies
    LARAVEL_SPY_PATTERN.lastIndex = 0;
    while ((match = LARAVEL_SPY_PATTERN.exec(content)) !== null) {
      const targetClass = this.extractClassName(match[1] || '');
      const line = this.getLineNumber(content, match.index);
      const expectations = this.extractExpectations(content, match.index);

      mocks.push({
        type: 'spy',
        targetClass,
        expectations,
        file,
        line,
      });
    }

    return mocks;
  }

  /**
   * Extract Laravel fake usages
   */
  private extractFakes(content: string, file: string): MockUsageInfo[] {
    const mocks: MockUsageInfo[] = [];

    for (const [facade, pattern] of Object.entries(FAKE_PATTERNS)) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);

        mocks.push({
          type: 'fake',
          targetClass: this.ucfirst(facade),
          expectations: [],
          file,
          line,
        });
      }
    }

    return mocks;
  }

  /**
   * Extract expectations from mock chain
   */
  private extractExpectations(content: string, startIndex: number): MockExpectationInfo[] {
    const expectations: MockExpectationInfo[] = [];

    // Get the statement containing the mock (until semicolon or next statement)
    const statementEnd = content.indexOf(';', startIndex);
    if (statementEnd === -1) {return expectations;}

    const statement = content.substring(startIndex, statementEnd);

    // Extract shouldReceive expectations
    SHOULD_RECEIVE_PATTERN.lastIndex = 0;
    let match;
    while ((match = SHOULD_RECEIVE_PATTERN.exec(statement)) !== null) {
      const method = match[1] || '';
      const line = this.getLineNumber(content, startIndex + match.index);

      // Extract times
      const times = this.extractTimes(statement.substring(match.index));

      // Extract return value
      const returnMatch = statement.substring(match.index).match(RETURN_PATTERN);
      const returns = returnMatch ? returnMatch[1]?.trim() || null : null;

      expectations.push({
        method,
        times,
        returns,
        line,
      });
    }

    // Extract expects expectations
    EXPECTS_PATTERN.lastIndex = 0;
    while ((match = EXPECTS_PATTERN.exec(statement)) !== null) {
      const method = match[1] || '';
      const line = this.getLineNumber(content, startIndex + match.index);

      expectations.push({
        method,
        times: null,
        returns: null,
        line,
      });
    }

    return expectations;
  }

  /**
   * Extract times from expectation chain
   */
  private extractTimes(chain: string): number | null {
    if (ONCE_PATTERN.test(chain)) {return 1;}
    if (TWICE_PATTERN.test(chain)) {return 2;}
    if (NEVER_PATTERN.test(chain)) {return 0;}

    const timesMatch = chain.match(TIMES_PATTERN);
    if (timesMatch?.[1]) {
      return parseInt(timesMatch[1], 10);
    }

    return null;
  }

  /**
   * Extract class name from FQN
   */
  private extractClassName(fqn: string): string {
    const parts = fqn.replace(/^\\/, '').split('\\');
    return parts[parts.length - 1] || fqn;
  }

  /**
   * Uppercase first character
   */
  private ucfirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new mock extractor
 */
export function createMockExtractor(): MockExtractor {
  return new MockExtractor();
}
