/**
 * Default Values Detector - LEARNING VERSION
 *
 * Learns default value patterns from the user's codebase:
 * - Default value assignment style
 * - Fallback patterns
 * - Nullish coalescing usage
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

export type DefaultValueStyle = 'nullish-coalescing' | 'logical-or' | 'ternary' | 'if-statement';

export interface DefaultValuesConventions {
  [key: string]: unknown;
  defaultValueStyle: DefaultValueStyle;
  usesNullishCoalescing: boolean;
  usesOptionalChaining: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const DEFAULT_PATTERNS = {
  nullishCoalescing: /\?\?/g,
  logicalOr: /\|\|/g,
  ternary: /\?\s*[^:]+\s*:/g,
  ifStatement: /if\s*\(\s*!\w+\s*\)\s*\{?\s*\w+\s*=/g,
};

function detectDefaultValueStyle(content: string): DefaultValueStyle | null {
  if (DEFAULT_PATTERNS.nullishCoalescing.test(content)) {return 'nullish-coalescing';}
  if (DEFAULT_PATTERNS.logicalOr.test(content)) {return 'logical-or';}
  if (DEFAULT_PATTERNS.ternary.test(content)) {return 'ternary';}
  if (DEFAULT_PATTERNS.ifStatement.test(content)) {return 'if-statement';}
  return null;
}

// ============================================================================
// Learning Default Values Detector
// ============================================================================

export class DefaultValuesLearningDetector extends LearningDetector<DefaultValuesConventions> {
  readonly id = 'config/default-values';
  readonly category = 'config' as const;
  readonly subcategory = 'default-values';
  readonly name = 'Default Values Detector (Learning)';
  readonly description = 'Learns default value patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof DefaultValuesConventions> {
    return ['defaultValueStyle', 'usesNullishCoalescing', 'usesOptionalChaining'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof DefaultValuesConventions, ValueDistribution>
  ): void {
    const style = detectDefaultValueStyle(context.content);
    const styleDist = distributions.get('defaultValueStyle')!;
    const nullishDist = distributions.get('usesNullishCoalescing')!;
    const optionalDist = distributions.get('usesOptionalChaining')!;
    
    if (style) {styleDist.add(style, context.file);}
    
    const usesNullish = /\?\?/.test(context.content);
    const usesOptional = /\?\./.test(context.content);
    
    nullishDist.add(usesNullish, context.file);
    optionalDist.add(usesOptional, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<DefaultValuesConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentStyle = detectDefaultValueStyle(context.content);
    const learnedStyle = conventions.conventions.defaultValueStyle?.value;
    
    if (currentStyle && learnedStyle && currentStyle !== learnedStyle) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'default value style', currentStyle, learnedStyle,
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

export function createDefaultValuesLearningDetector(): DefaultValuesLearningDetector {
  return new DefaultValuesLearningDetector();
}
