/**
 * Fixture Patterns Detector - Test fixture pattern detection
 *
 * Detects fixture patterns including:
 * - Factory functions
 * - Builder patterns
 * - Fixture files
 * - Test data patterns
 *
 * @requirements 14.5 - Fixture patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type FixturePatternType =
  | 'factory-function'
  | 'builder-pattern'
  | 'fixture-file'
  | 'test-data'
  | 'faker-usage';

export interface FixturePatternInfo {
  type: FixturePatternType;
  line: number;
  column: number;
  match: string;
  name?: string;
}

export interface FixtureAnalysis {
  patterns: FixturePatternInfo[];
  hasFactories: boolean;
  hasBuilders: boolean;
  fixtureCount: number;
}

// ============================================================================
// Patterns
// ============================================================================

export const FACTORY_FUNCTION_PATTERNS = [
  // JavaScript/TypeScript
  /(?:create|make|build|generate)\w*Factory\s*[=:]/gi,
  /function\s+(?:create|make|build|generate)\w+\s*\(/gi,
  /const\s+(?:create|make|build)\w+\s*=\s*(?:\([^)]*\)|[^=])\s*=>/gi,
  // Python
  /def\s+(?:create|make|build|generate)_\w+\s*\(/gi,
  /def\s+\w+_factory\s*\(/gi,
  /class\s+\w+Factory\s*:/gi,
];

export const BUILDER_PATTERN_PATTERNS = [
  /class\s+\w+Builder\s*\{/gi,
  /\.with\w+\s*\([^)]*\)\s*\./gi,
  /\.build\s*\(\s*\)/gi,
  /Builder\.create\s*\(/gi,
];

export const FIXTURE_FILE_PATTERNS = [
  // JavaScript/TypeScript
  /fixtures?\.[jt]sx?$/gi,
  /\/fixtures?\//gi,
  /\.fixture\.[jt]sx?$/gi,
  // Python pytest
  /conftest\.py$/gi,
  /fixtures?\.py$/gi,
];

export const TEST_DATA_PATTERNS = [
  // JavaScript/TypeScript
  /const\s+(?:mock|fake|stub|test)\w*Data\s*=/gi,
  /const\s+\w+(?:Mock|Fake|Stub|Fixture)\s*=/gi,
  /export\s+const\s+\w+Fixture\s*=/gi,
  // Python
  /\w+_data\s*=/gi,
  /mock_\w+\s*=/gi,
  /fake_\w+\s*=/gi,
  /test_\w+_data\s*=/gi,
  /@pytest\.fixture/gi,
];

export const FAKER_USAGE_PATTERNS = [
  // JavaScript/TypeScript
  /faker\.\w+\.\w+\s*\(/gi,
  /@faker-js\/faker/gi,
  /import.*faker/gi,
  /chance\.\w+\s*\(/gi,
  // Python
  /from\s+faker\s+import/gi,
  /Faker\s*\(\s*\)/gi,
  /fake\.\w+\s*\(/gi,
  /factory_boy/gi,
  /factory\.Faker/gi,
];

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [/\.d\.ts$/, /node_modules\//];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectFactoryFunctions(content: string): FixturePatternInfo[] {
  const results: FixturePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of FACTORY_FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'factory-function',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectBuilderPatterns(content: string): FixturePatternInfo[] {
  const results: FixturePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of BUILDER_PATTERN_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'builder-pattern',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectFixtureFiles(filePath: string): FixturePatternInfo[] {
  const results: FixturePatternInfo[] = [];

  for (const pattern of FIXTURE_FILE_PATTERNS) {
    if (pattern.test(filePath)) {
      results.push({
        type: 'fixture-file',
        line: 1,
        column: 1,
        match: filePath,
      });
      break;
    }
  }

  return results;
}

export function detectTestData(content: string): FixturePatternInfo[] {
  const results: FixturePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TEST_DATA_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'test-data',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectFakerUsage(content: string): FixturePatternInfo[] {
  const results: FixturePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of FAKER_USAGE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'faker-usage',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function analyzeFixturePatterns(content: string, filePath: string): FixtureAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      hasFactories: false,
      hasBuilders: false,
      fixtureCount: 0,
    };
  }

  const patterns: FixturePatternInfo[] = [
    ...detectFactoryFunctions(content),
    ...detectBuilderPatterns(content),
    ...detectFixtureFiles(filePath),
    ...detectTestData(content),
    ...detectFakerUsage(content),
  ];

  const hasFactories = patterns.some((p) => p.type === 'factory-function');
  const hasBuilders = patterns.some((p) => p.type === 'builder-pattern');

  return {
    patterns,
    hasFactories,
    hasBuilders,
    fixtureCount: patterns.length,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class FixturePatternsDetector extends RegexDetector {
  readonly id = 'testing/fixture-patterns';
  readonly name = 'Fixture Patterns Detector';
  readonly description = 'Detects test fixture patterns like factories and builders';
  readonly category: PatternCategory = 'testing';
  readonly subcategory = 'fixture-patterns';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeFixturePatterns(context.content, context.file);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = 0.9;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        hasFactories: analysis.hasFactories,
        hasBuilders: analysis.hasBuilders,
        fixtureCount: analysis.fixtureCount,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createFixturePatternsDetector(): FixturePatternsDetector {
  return new FixturePatternsDetector();
}
