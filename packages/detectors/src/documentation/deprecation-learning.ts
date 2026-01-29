/**
 * Deprecation Detector - LEARNING VERSION
 *
 * Learns deprecation patterns from the user's codebase:
 * - Deprecation annotation style
 * - Migration guidance patterns
 * - Version tracking
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

export type DeprecationStyle = 'jsdoc' | 'decorator' | 'comment' | 'console-warn';

export interface DeprecationConventions {
  [key: string]: unknown;
  deprecationStyle: DeprecationStyle;
  includesReplacement: boolean;
  includesVersion: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const DEPRECATION_PATTERNS = {
  jsdoc: /@deprecated/gi,
  decorator: /@Deprecated\s*\(/gi,
  comment: /\/\/\s*DEPRECATED|\/\*\s*DEPRECATED/gi,
  consoleWarn: /console\.warn\s*\([^)]*deprecat/gi,
};

function detectDeprecationStyle(content: string): DeprecationStyle | null {
  for (const [style, pattern] of Object.entries(DEPRECATION_PATTERNS)) {
    if (pattern.test(content)) {return style as DeprecationStyle;}
  }
  return null;
}

// ============================================================================
// Learning Deprecation Detector
// ============================================================================

export class DeprecationLearningDetector extends LearningDetector<DeprecationConventions> {
  readonly id = 'documentation/deprecation';
  readonly category = 'documentation' as const;
  readonly subcategory = 'deprecation';
  readonly name = 'Deprecation Detector (Learning)';
  readonly description = 'Learns deprecation patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof DeprecationConventions> {
    return ['deprecationStyle', 'includesReplacement', 'includesVersion'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof DeprecationConventions, ValueDistribution>
  ): void {
    const style = detectDeprecationStyle(context.content);
    const styleDist = distributions.get('deprecationStyle')!;
    const replaceDist = distributions.get('includesReplacement')!;
    const versionDist = distributions.get('includesVersion')!;
    
    if (style) {
      styleDist.add(style, context.file);
      
      const hasReplacement = /use\s+\w+\s+instead|replaced\s+by|migrate\s+to/i.test(context.content);
      const hasVersion = /since\s+v?\d|@since|version\s+\d/i.test(context.content);
      
      replaceDist.add(hasReplacement, context.file);
      versionDist.add(hasVersion, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<DeprecationConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentStyle = detectDeprecationStyle(context.content);
    const learnedStyle = conventions.conventions.deprecationStyle?.value;
    
    if (currentStyle && learnedStyle && currentStyle !== learnedStyle) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'deprecation style', currentStyle, learnedStyle,
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

export function createDeprecationLearningDetector(): DeprecationLearningDetector {
  return new DeprecationLearningDetector();
}
