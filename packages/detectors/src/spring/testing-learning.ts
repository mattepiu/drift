/**
 * Spring Testing Patterns Detector - LEARNING VERSION
 *
 * Learns testing patterns from the user's codebase:
 * - Test slice preferences (@SpringBootTest, @WebMvcTest, @DataJpaTest)
 * - Mock framework usage (@MockBean, Mockito)
 * - Assertion library preferences
 * - Test organization patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import { SPRING_KEYWORD_GROUPS } from './keywords.js';
import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type TestSliceStyle = 'full' | 'web' | 'data' | 'mixed';
export type MockStyle = 'mockbean' | 'mockito' | 'both';
export type AssertionStyle = 'assertj' | 'junit' | 'hamcrest' | 'mixed';

export interface SpringTestingConventions {
  [key: string]: unknown;
  /** Preferred test slice annotation */
  testSliceStyle: TestSliceStyle;
  /** Mock framework preference */
  mockStyle: MockStyle;
  /** Assertion library preference */
  assertionStyle: AssertionStyle;
  /** Whether MockMvc is used for web tests */
  usesMockMvc: boolean;
}

interface TestingPatternInfo {
  /** The testing keyword found */
  keyword: string;
  /** Type of testing pattern */
  patternType: 'slice' | 'mock' | 'assertion' | 'mvc' | 'lifecycle';
  /** Specific value for categorization (slice style, mock style, or assertion style) */
  sliceValue: TestSliceStyle | null;
  mockValue: MockStyle | null;
  assertionValue: AssertionStyle | null;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractTestingPatterns(content: string, file: string): TestingPatternInfo[] {
  const results: TestingPatternInfo[] = [];
  const keywords = SPRING_KEYWORD_GROUPS.testing.keywords;

  for (const keyword of keywords) {
    const pattern = new RegExp(`@${keyword}\\b|\\b${keyword}\\b`, 'g');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip imports
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.slice(lineStart, content.indexOf('\n', match.index));
      if (lineContent.trim().startsWith('import ')) {continue;}

      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      // Categorize the pattern
      let patternType: TestingPatternInfo['patternType'] = 'lifecycle';
      let sliceValue: TestSliceStyle | null = null;
      let mockValue: MockStyle | null = null;
      let assertionValue: AssertionStyle | null = null;

      // Test slice annotations
      if (['SpringBootTest', 'WebMvcTest', 'DataJpaTest', 'WebFluxTest', 
           'JsonTest', 'RestClientTest'].includes(keyword)) {
        patternType = 'slice';
        if (keyword === 'SpringBootTest') {sliceValue = 'full';}
        else if (keyword === 'WebMvcTest' || keyword === 'WebFluxTest') {sliceValue = 'web';}
        else if (keyword === 'DataJpaTest') {sliceValue = 'data';}
        else {sliceValue = 'mixed';}
      }
      // Mock annotations
      else if (['MockBean', 'SpyBean', 'Mock', 'InjectMocks'].includes(keyword)) {
        patternType = 'mock';
        mockValue = ['MockBean', 'SpyBean'].includes(keyword) ? 'mockbean' : 'mockito';
      }
      // Mockito methods
      else if (['when', 'thenReturn', 'verify', 'any', 'eq', 'ArgumentCaptor'].includes(keyword)) {
        patternType = 'mock';
        mockValue = 'mockito';
      }
      // Assertions
      else if (['assertThat', 'assertEquals', 'assertTrue', 'assertFalse', 
                'assertThrows', 'assertNotNull'].includes(keyword)) {
        patternType = 'assertion';
        assertionValue = keyword === 'assertThat' ? 'assertj' : 'junit';
      }
      // MockMvc
      else if (['MockMvc', 'perform', 'andExpect', 'andReturn'].includes(keyword)) {
        patternType = 'mvc';
      }

      results.push({
        keyword,
        patternType,
        sliceValue,
        mockValue,
        assertionValue,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Detector
// ============================================================================

export class SpringTestingLearningDetector extends LearningDetector<SpringTestingConventions> {
  readonly id = 'spring/testing-patterns-learning';
  readonly category = 'testing' as const;
  readonly subcategory = 'spring-testing';
  readonly name = 'Spring Testing Patterns Detector (Learning)';
  readonly description = 'Learns testing patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringTestingConventions> {
    return ['testSliceStyle', 'mockStyle', 'assertionStyle', 'usesMockMvc'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringTestingConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}
    // Only analyze test files for testing patterns
    if (!context.isTestFile && !context.file.includes('Test')) {return;}

    const patterns = extractTestingPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const sliceDist = distributions.get('testSliceStyle')!;
    const mockDist = distributions.get('mockStyle')!;
    const assertionDist = distributions.get('assertionStyle')!;
    const mockMvcDist = distributions.get('usesMockMvc')!;

    for (const pattern of patterns) {
      if (pattern.patternType === 'slice' && pattern.sliceValue) {
        sliceDist.add(pattern.sliceValue, context.file);
      } else if (pattern.patternType === 'mock' && pattern.mockValue) {
        mockDist.add(pattern.mockValue, context.file);
      } else if (pattern.patternType === 'assertion' && pattern.assertionValue) {
        assertionDist.add(pattern.assertionValue, context.file);
      } else if (pattern.patternType === 'mvc') {
        mockMvcDist.add(true, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringTestingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    // Only check test files
    if (!context.isTestFile && !context.file.includes('Test')) {
      return this.createEmptyResult();
    }

    const foundPatterns = extractTestingPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedSlice = conventions.conventions.testSliceStyle?.value;
    const learnedMock = conventions.conventions.mockStyle?.value;
    const learnedAssertion = conventions.conventions.assertionStyle?.value;

    // Check for test slice consistency
    if (learnedSlice && learnedSlice !== 'mixed') {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'slice' && pattern.sliceValue && pattern.sliceValue !== learnedSlice) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'test slice', pattern.keyword, learnedSlice === 'full' ? 'SpringBootTest' : 
              learnedSlice === 'web' ? 'WebMvcTest' : 'DataJpaTest',
            `Using @${pattern.keyword} but project prefers ${learnedSlice} test slices`
          ));
        }
      }
    }

    // Check for mock style consistency
    if (learnedMock && learnedMock !== 'both') {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'mock' && pattern.mockValue && pattern.mockValue !== learnedMock) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'mock style', pattern.mockValue, learnedMock,
            `Using ${pattern.mockValue} mocking but project uses ${learnedMock}`
          ));
        }
      }
    }

    // Check for assertion style consistency
    if (learnedAssertion && learnedAssertion !== 'mixed') {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'assertion' && pattern.assertionValue && pattern.assertionValue !== learnedAssertion) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'assertion style', pattern.assertionValue, learnedAssertion,
            `Using ${pattern.assertionValue} assertions but project uses ${learnedAssertion}`
          ));
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/testing`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createSpringTestingLearningDetector(): SpringTestingLearningDetector {
  return new SpringTestingLearningDetector();
}
