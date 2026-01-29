/**
 * Near Duplicate Detector - LEARNING VERSION
 *
 * Learns near-duplicate component patterns from the user's codebase:
 * - Similarity thresholds
 * - Acceptable variations
 * - Refactoring patterns
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

export type VariationStyle = 'props-variation' | 'style-variation' | 'logic-variation';

export interface NearDuplicateConventions {
  [key: string]: unknown;
  acceptableVariation: VariationStyle;
  similarityThreshold: number;
  prefersComposition: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectVariationStyle(content: string): VariationStyle | null {
  const hasPropsVariation = /\?\s*:|defaultProps|\.variant|\.size/.test(content);
  const hasStyleVariation = /className.*\?|style.*\?|styled\(/.test(content);
  const hasLogicVariation = /if\s*\(|switch\s*\(|&&\s*</.test(content);
  
  if (hasPropsVariation) {return 'props-variation';}
  if (hasStyleVariation) {return 'style-variation';}
  if (hasLogicVariation) {return 'logic-variation';}
  return null;
}

// ============================================================================
// Learning Near Duplicate Detector
// ============================================================================

export class NearDuplicateLearningDetector extends LearningDetector<NearDuplicateConventions> {
  readonly id = 'components/near-duplicate';
  readonly category = 'components' as const;
  readonly subcategory = 'near-duplicate';
  readonly name = 'Near Duplicate Detector (Learning)';
  readonly description = 'Learns near-duplicate handling patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof NearDuplicateConventions> {
    return ['acceptableVariation', 'similarityThreshold', 'prefersComposition'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof NearDuplicateConventions, ValueDistribution>
  ): void {
    const variation = detectVariationStyle(context.content);
    const variationDist = distributions.get('acceptableVariation')!;
    const compositionDist = distributions.get('prefersComposition')!;
    
    if (variation) {variationDist.add(variation, context.file);}
    
    const prefersComposition = /children|render=\{|slots/.test(context.content);
    compositionDist.add(prefersComposition, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    _conventions: LearningResult<NearDuplicateConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentVariation = detectVariationStyle(context.content);
    
    if (currentVariation) {
      patterns.push({
        patternId: `${this.id}/${currentVariation}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createNearDuplicateLearningDetector(): NearDuplicateLearningDetector {
  return new NearDuplicateLearningDetector();
}
