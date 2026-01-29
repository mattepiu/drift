/**
 * Example Code Detector - LEARNING VERSION
 *
 * Learns example code documentation patterns from the user's codebase:
 * - Example placement
 * - Code block formatting
 * - Runnable examples
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ExampleStyle = 'jsdoc-example' | 'readme' | 'storybook' | 'doctest';

export interface ExampleCodeConventions {
  [key: string]: unknown;
  exampleStyle: ExampleStyle;
  usesCodeBlocks: boolean;
  includesOutput: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const EXAMPLE_PATTERNS = {
  jsdocExample: /@example/gi,
  readme: /```(?:js|ts|javascript|typescript)/gi,
  storybook: /\.stories\.[tj]sx?$/i,
  doctest: />>>\s+|doctest/gi,
};

function detectExampleStyle(content: string, filePath: string): ExampleStyle | null {
  if (EXAMPLE_PATTERNS.storybook.test(filePath)) {return 'storybook';}
  if (EXAMPLE_PATTERNS.jsdocExample.test(content)) {return 'jsdoc-example';}
  if (EXAMPLE_PATTERNS.readme.test(content)) {return 'readme';}
  if (EXAMPLE_PATTERNS.doctest.test(content)) {return 'doctest';}
  return null;
}

// ============================================================================
// Learning Example Code Detector
// ============================================================================

export class ExampleCodeLearningDetector extends LearningDetector<ExampleCodeConventions> {
  readonly id = 'documentation/example-code';
  readonly category = 'documentation' as const;
  readonly subcategory = 'example-code';
  readonly name = 'Example Code Detector (Learning)';
  readonly description = 'Learns example code patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ExampleCodeConventions> {
    return ['exampleStyle', 'usesCodeBlocks', 'includesOutput'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ExampleCodeConventions, ValueDistribution>
  ): void {
    const style = detectExampleStyle(context.content, context.file);
    const styleDist = distributions.get('exampleStyle')!;
    const codeBlockDist = distributions.get('usesCodeBlocks')!;
    const outputDist = distributions.get('includesOutput')!;
    
    if (style) {
      styleDist.add(style, context.file);
      codeBlockDist.add(/```/.test(context.content), context.file);
      outputDist.add(/\/\/\s*=>\s*|\/\/\s*Output:|console\.log/.test(context.content), context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ExampleCodeConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentStyle = detectExampleStyle(context.content, context.file);
    const learnedStyle = conventions.conventions.exampleStyle?.value;
    
    if (currentStyle && learnedStyle && currentStyle !== learnedStyle) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'example code style', currentStyle, learnedStyle,
        `Using '${currentStyle}' but your project uses '${learnedStyle}'`
      ));
    }
    
    if (currentStyle) {
      patterns.push({
        patternId: `${this.id}/${currentStyle}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createExampleCodeLearningDetector(): ExampleCodeLearningDetector {
  return new ExampleCodeLearningDetector();
}
