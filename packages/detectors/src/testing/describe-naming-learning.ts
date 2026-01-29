/**
 * Describe Naming Detector - LEARNING VERSION
 *
 * Learns test describe block naming conventions from the user's codebase:
 * - Describe block naming patterns
 * - It block naming patterns
 * - Test organization patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code
 */

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

export type DescribeNamingStyle = 
  | 'component-name'      // describe('Button', ...)
  | 'function-name'       // describe('calculateTotal', ...)
  | 'should-style'        // describe('should render correctly', ...)
  | 'when-style'          // describe('when user clicks', ...)
  | 'given-style'         // describe('given valid input', ...)
  | 'module-path';        // describe('utils/helpers', ...)

export type ItNamingStyle =
  | 'should-style'        // it('should return true', ...)
  | 'verb-style'          // it('returns true', ...)
  | 'when-style'          // it('when called with null', ...)
  | 'descriptive';        // it('correctly handles edge cases', ...)

export interface DescribeNamingConventions {
  [key: string]: unknown;
  /** Top-level describe naming style */
  describeStyle: DescribeNamingStyle;
  /** Nested describe naming style */
  nestedDescribeStyle: DescribeNamingStyle;
  /** It block naming style */
  itStyle: ItNamingStyle;
  /** Uses test() vs it() */
  usesTestKeyword: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectDescribeStyle(text: string): DescribeNamingStyle {
  if (/^should\s/i.test(text)) {return 'should-style';}
  if (/^when\s/i.test(text)) {return 'when-style';}
  if (/^given\s/i.test(text)) {return 'given-style';}
  if (/^[A-Z][a-zA-Z]+$/.test(text)) {return 'component-name';}
  if (/^[a-z][a-zA-Z]+$/.test(text)) {return 'function-name';}
  if (text.includes('/')) {return 'module-path';}
  
  return 'component-name';
}

function detectItStyle(text: string): ItNamingStyle {
  if (/^should\s/i.test(text)) {return 'should-style';}
  if (/^when\s/i.test(text)) {return 'when-style';}
  if (/^[a-z]+s\s/i.test(text)) {return 'verb-style';} // "returns", "throws", etc.
  return 'descriptive';
}

interface TestBlock {
  type: 'describe' | 'it' | 'test';
  text: string;
  line: number;
  column: number;
  isNested: boolean;
}

function extractTestBlocks(content: string): TestBlock[] {
  const blocks: TestBlock[] = [];
  
  // Match describe/it/test blocks
  const patterns = [
    { regex: /describe\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'describe' as const },
    { regex: /it\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'it' as const },
    { regex: /test\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'test' as const },
  ];
  
  let describeDepth = 0;
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    
    // Track describe depth
    const describeOpens = (line.match(/describe\s*\(/g) || []).length;
    const closes = (line.match(/\}\s*\)/g) || []).length;
    
    for (const { regex, type } of patterns) {
      const lineRegex = new RegExp(regex.source, 'g');
      let match;
      while ((match = lineRegex.exec(line)) !== null) {
        const text = match[1];
        if (text) {
          blocks.push({
            type,
            text,
            line: i + 1,
            column: match.index + 1,
            isNested: type === 'describe' && describeDepth > 0,
          });
        }
      }
    }
    
    describeDepth += describeOpens - closes;
    if (describeDepth < 0) {describeDepth = 0;}
  }
  
  return blocks;
}

// ============================================================================
// Learning Detector
// ============================================================================

export class DescribeNamingLearningDetector extends LearningDetector<DescribeNamingConventions> {
  readonly id = 'testing/describe-naming';
  readonly category = 'testing' as const;
  readonly subcategory = 'naming';
  readonly name = 'Describe Naming Detector (Learning)';
  readonly description = 'Learns test describe/it naming conventions from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof DescribeNamingConventions> {
    return ['describeStyle', 'nestedDescribeStyle', 'itStyle', 'usesTestKeyword'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof DescribeNamingConventions, ValueDistribution>
  ): void {
    // Only analyze test files
    if (!context.isTestFile) {return;}
    
    const blocks = extractTestBlocks(context.content);
    
    for (const block of blocks) {
      if (block.type === 'describe') {
        const style = detectDescribeStyle(block.text);
        if (block.isNested) {
          distributions.get('nestedDescribeStyle')!.add(style, context.file);
        } else {
          distributions.get('describeStyle')!.add(style, context.file);
        }
      } else if (block.type === 'it') {
        const style = detectItStyle(block.text);
        distributions.get('itStyle')!.add(style, context.file);
        distributions.get('usesTestKeyword')!.add(false, context.file);
      } else if (block.type === 'test') {
        const style = detectItStyle(block.text);
        distributions.get('itStyle')!.add(style, context.file);
        distributions.get('usesTestKeyword')!.add(true, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<DescribeNamingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    if (!context.isTestFile) {
      return this.createEmptyResult();
    }
    
    const blocks = extractTestBlocks(context.content);
    const learnedDescribeStyle = conventions.conventions.describeStyle?.value;
    const learnedNestedStyle = conventions.conventions.nestedDescribeStyle?.value;
    const learnedItStyle = conventions.conventions.itStyle?.value;
    const usesTest = conventions.conventions.usesTestKeyword?.value;
    
    for (const block of blocks) {
      if (block.type === 'describe') {
        const actualStyle = detectDescribeStyle(block.text);
        const expectedStyle = block.isNested ? learnedNestedStyle : learnedDescribeStyle;
        
        if (expectedStyle && actualStyle !== expectedStyle) {
          violations.push(this.createConventionViolation(
            context.file,
            block.line,
            block.column,
            'describe naming',
            actualStyle,
            expectedStyle,
            `Describe block '${block.text}' uses ${actualStyle} style but project uses ${expectedStyle}`
          ));
        }
      } else if (block.type === 'it' || block.type === 'test') {
        const actualStyle = detectItStyle(block.text);
        
        if (learnedItStyle && actualStyle !== learnedItStyle) {
          violations.push(this.createConventionViolation(
            context.file,
            block.line,
            block.column,
            'it/test naming',
            actualStyle,
            learnedItStyle,
            `Test '${block.text}' uses ${actualStyle} style but project uses ${learnedItStyle}`
          ));
        }
        
        // Check test vs it keyword
        if (usesTest !== undefined) {
          const actualUsesTest = block.type === 'test';
          if (actualUsesTest !== usesTest) {
            const expected = usesTest ? 'test()' : 'it()';
            const actual = actualUsesTest ? 'test()' : 'it()';
            violations.push(this.createConventionViolation(
              context.file,
              block.line,
              block.column,
              'test keyword',
              actual,
              expected,
              `Project uses ${expected} but found ${actual}`
            ));
          }
        }
      }
    }
    
    return this.createResult(patterns, violations, violations.length === 0 ? 1.0 : 0.8);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createDescribeNamingLearningDetector(): DescribeNamingLearningDetector {
  return new DescribeNamingLearningDetector();
}
