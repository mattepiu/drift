/**
 * Ref Forwarding Detector - LEARNING VERSION
 *
 * Learns ref forwarding patterns from the user's codebase:
 * - forwardRef usage
 * - useImperativeHandle patterns
 * - Ref typing conventions
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

export type RefForwardingStyle = 'forwardRef' | 'callback-ref' | 'ref-prop' | 'none';

export interface RefForwardingConventions {
  [key: string]: unknown;
  forwardingStyle: RefForwardingStyle;
  usesImperativeHandle: boolean;
  typesRefs: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const REF_PATTERNS = {
  forwardRef: /forwardRef\s*[<(]/g,
  callbackRef: /ref=\{\s*\([^)]*\)\s*=>/g,
  refProp: /ref:\s*\w+|ref=\{/g,
};

function detectRefForwardingStyle(content: string): RefForwardingStyle | null {
  if (REF_PATTERNS.forwardRef.test(content)) {return 'forwardRef';}
  if (REF_PATTERNS.callbackRef.test(content)) {return 'callback-ref';}
  if (REF_PATTERNS.refProp.test(content)) {return 'ref-prop';}
  return null;
}

// ============================================================================
// Learning Ref Forwarding Detector
// ============================================================================

export class RefForwardingLearningDetector extends LearningDetector<RefForwardingConventions> {
  readonly id = 'components/ref-forwarding';
  readonly category = 'components' as const;
  readonly subcategory = 'ref-forwarding';
  readonly name = 'Ref Forwarding Detector (Learning)';
  readonly description = 'Learns ref forwarding patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof RefForwardingConventions> {
    return ['forwardingStyle', 'usesImperativeHandle', 'typesRefs'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof RefForwardingConventions, ValueDistribution>
  ): void {
    const style = detectRefForwardingStyle(context.content);
    const styleDist = distributions.get('forwardingStyle')!;
    const imperativeDist = distributions.get('usesImperativeHandle')!;
    const typesDist = distributions.get('typesRefs')!;
    
    if (style) {styleDist.add(style, context.file);}
    
    const usesImperative = /useImperativeHandle/.test(context.content);
    const typesRefs = /Ref<|RefObject<|ForwardedRef</.test(context.content);
    
    imperativeDist.add(usesImperative, context.file);
    typesDist.add(typesRefs, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<RefForwardingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentStyle = detectRefForwardingStyle(context.content);
    const learnedStyle = conventions.conventions.forwardingStyle?.value;
    
    if (currentStyle && learnedStyle && currentStyle !== learnedStyle) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'ref forwarding style', currentStyle, learnedStyle,
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

export function createRefForwardingLearningDetector(): RefForwardingLearningDetector {
  return new RefForwardingLearningDetector();
}
