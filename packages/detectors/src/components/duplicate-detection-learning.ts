/**
 * Duplicate Detection Detector - LEARNING VERSION
 *
 * Learns component duplication patterns from the user's codebase:
 * - Acceptable duplication thresholds
 * - Abstraction patterns
 * - Shared component conventions
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

export type AbstractionStyle = 'shared-components' | 'hoc' | 'render-props' | 'hooks';

export interface DuplicateDetectionConventions {
  [key: string]: unknown;
  abstractionStyle: AbstractionStyle;
  sharedComponentsPath: string;
  maxDuplicationThreshold: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

const ABSTRACTION_PATTERNS = {
  sharedComponents: /\/shared\/|\/common\/|\/components\/ui\//gi,
  hoc: /with\w+\s*\(|HOC|HigherOrder/gi,
  renderProps: /render=\{|children\s*:\s*\(/gi,
  hooks: /use[A-Z]\w+\s*=/g,
};

function detectAbstractionStyle(content: string, filePath: string): AbstractionStyle | null {
  if (ABSTRACTION_PATTERNS.sharedComponents.test(filePath)) {return 'shared-components';}
  if (ABSTRACTION_PATTERNS.hoc.test(content)) {return 'hoc';}
  if (ABSTRACTION_PATTERNS.renderProps.test(content)) {return 'render-props';}
  if (ABSTRACTION_PATTERNS.hooks.test(content)) {return 'hooks';}
  return null;
}

// ============================================================================
// Learning Duplicate Detection Detector
// ============================================================================

export class DuplicateDetectionLearningDetector extends LearningDetector<DuplicateDetectionConventions> {
  readonly id = 'components/duplicate-detection';
  readonly category = 'components' as const;
  readonly subcategory = 'duplicate-detection';
  readonly name = 'Duplicate Detection Detector (Learning)';
  readonly description = 'Learns component abstraction patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof DuplicateDetectionConventions> {
    return ['abstractionStyle', 'sharedComponentsPath', 'maxDuplicationThreshold'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof DuplicateDetectionConventions, ValueDistribution>
  ): void {
    const style = detectAbstractionStyle(context.content, context.file);
    const styleDist = distributions.get('abstractionStyle')!;
    
    if (style) {styleDist.add(style, context.file);}
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<DuplicateDetectionConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentStyle = detectAbstractionStyle(context.content, context.file);
    const learnedStyle = conventions.conventions.abstractionStyle?.value;
    
    if (currentStyle && learnedStyle && currentStyle !== learnedStyle) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'abstraction style', currentStyle, learnedStyle,
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

export function createDuplicateDetectionLearningDetector(): DuplicateDetectionLearningDetector {
  return new DuplicateDetectionLearningDetector();
}
