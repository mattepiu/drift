/**
 * Describe Naming Detector - Test describe block naming pattern detection
 *
 * Detects describe block naming patterns including:
 * - Component/function name conventions
 * - Method grouping patterns
 * - Nested describe patterns
 *
 * @requirements 14.6 - Describe naming patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type DescribeNamingPatternType =
  | 'component-name'
  | 'function-name'
  | 'method-group'
  | 'feature-group'
  | 'nested-describe';

export interface DescribeNamingPatternInfo {
  type: DescribeNamingPatternType;
  line: number;
  column: number;
  match: string;
  name: string;
  depth: number;
}

export interface DescribeNamingAnalysis {
  patterns: DescribeNamingPatternInfo[];
  maxDepth: number;
  hasConsistentNaming: boolean;
  describeCount: number;
}

// ============================================================================
// Patterns
// ============================================================================

export const COMPONENT_NAME_PATTERNS = [
  // JavaScript/TypeScript
  /describe\s*\(\s*['"`]<?\w+>?\s*(?:component)?['"`]/gi,
  /describe\s*\(\s*['"`]\w+Component['"`]/gi,
  // Python pytest classes
  /class\s+Test\w+\s*:/gi,
  /class\s+\w+Test\s*:/gi,
];

export const FUNCTION_NAME_PATTERNS = [
  /describe\s*\(\s*['"`]\w+\s*\(\)['"`]/gi,
  /describe\s*\(\s*['"`]#\w+['"`]/gi,
];

export const METHOD_GROUP_PATTERNS = [
  /describe\s*\(\s*['"`](?:when|with|given|if)\s+/gi,
  /describe\s*\(\s*['"`]\.?\w+\s*\(\)['"`]/gi,
];

export const FEATURE_GROUP_PATTERNS = [
  /describe\s*\(\s*['"`](?:Feature|Scenario|Story):\s*/gi,
  /describe\s*\(\s*['"`]\w+\s+(?:feature|functionality|behavior)['"`]/gi,
];

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  // JavaScript/TypeScript test files
  if (/\.(test|spec)\.[jt]sx?$/.test(filePath) || /__tests__\//.test(filePath)) {
    return false;
  }
  // Python test files
  if (/test_\w+\.py$/.test(filePath) || /\w+_test\.py$/.test(filePath)) {
    return false;
  }
  return true;
}

export function extractDescribeBlocks(content: string): DescribeNamingPatternInfo[] {
  const results: DescribeNamingPatternInfo[] = [];
  const lines = content.split('\n');
  let currentDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Track depth by counting braces (simplified)
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    // Check for describe blocks
    const describeMatch = line.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (describeMatch) {
      const name = describeMatch[1]!;
      let type: DescribeNamingPatternType = 'feature-group';

      // Determine type based on naming pattern
      if (/^<?\w+>?\s*(?:component)?$/i.test(name) || /Component$/.test(name)) {
        type = 'component-name';
      } else if (/\w+\s*\(\)$/.test(name) || /^#\w+$/.test(name)) {
        type = 'function-name';
      } else if (/^(?:when|with|given|if)\s+/i.test(name)) {
        type = 'method-group';
      } else if (/^(?:Feature|Scenario|Story):/i.test(name)) {
        type = 'feature-group';
      }

      if (currentDepth > 0) {
        type = 'nested-describe';
      }

      results.push({
        type,
        line: i + 1,
        column: (describeMatch.index || 0) + 1,
        match: describeMatch[0],
        name,
        depth: currentDepth,
      });
    }

    currentDepth += openBraces - closeBraces;
    if (currentDepth < 0) {currentDepth = 0;}
  }

  return results;
}

export function analyzeDescribeNaming(content: string, filePath: string): DescribeNamingAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      maxDepth: 0,
      hasConsistentNaming: true,
      describeCount: 0,
    };
  }

  const patterns = extractDescribeBlocks(content);

  const maxDepth = patterns.reduce((max, p) => Math.max(max, p.depth), 0);

  // Check naming consistency (all same type at depth 0)
  const topLevelTypes = new Set(
    patterns.filter((p) => p.depth === 0).map((p) => p.type)
  );
  const hasConsistentNaming = topLevelTypes.size <= 1;

  return {
    patterns,
    maxDepth,
    hasConsistentNaming,
    describeCount: patterns.length,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class DescribeNamingDetector extends RegexDetector {
  readonly id = 'testing/describe-naming';
  readonly name = 'Describe Naming Detector';
  readonly description = 'Detects describe block naming patterns and consistency';
  readonly category: PatternCategory = 'testing';
  readonly subcategory = 'describe-naming';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeDescribeNaming(context.content, context.file);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = analysis.hasConsistentNaming ? 0.95 : 0.8;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        maxDepth: analysis.maxDepth,
        hasConsistentNaming: analysis.hasConsistentNaming,
        describeCount: analysis.describeCount,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createDescribeNamingDetector(): DescribeNamingDetector {
  return new DescribeNamingDetector();
}
