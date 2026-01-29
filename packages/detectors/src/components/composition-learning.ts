/**
 * Component Composition Detector - LEARNING VERSION
 *
 * Learns component composition patterns from the user's codebase:
 * - Composition patterns (children, render props, HOCs)
 * - Slot patterns
 * - Compound components
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

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type CompositionStyle = 'children' | 'render-props' | 'hoc' | 'compound' | 'slots';

export interface CompositionConventions {
  [key: string]: unknown;
  preferredStyle: CompositionStyle;
  usesChildren: boolean;
  usesRenderProps: boolean;
  usesHOCs: boolean;
}

interface CompositionPatternInfo {
  style: CompositionStyle;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractCompositionPatterns(content: string, file: string): CompositionPatternInfo[] {
  const results: CompositionPatternInfo[] = [];

  // Children prop usage
  const childrenPattern = /\{?\s*children\s*\}?|props\.children|ReactNode/g;
  let match;
  while ((match = childrenPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'children',
      line,
      column,
      file,
    });
  }

  // Render props
  const renderPropsPattern = /render\s*=\s*\{|renderItem|renderHeader|render\w+\s*:/g;
  while ((match = renderPropsPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'render-props',
      line,
      column,
      file,
    });
  }

  // HOC patterns
  const hocPattern = /with[A-Z]\w+\s*\(|export\s+default\s+\w+\s*\(\s*\w+\s*\)/g;
  while ((match = hocPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'hoc',
      line,
      column,
      file,
    });
  }

  // Compound components
  const compoundPattern = /\w+\.\w+\s*=\s*(?:function|const|\()/g;
  while ((match = compoundPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'compound',
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Composition Detector
// ============================================================================

export class CompositionLearningDetector extends LearningDetector<CompositionConventions> {
  readonly id = 'components/composition';
  readonly category = 'components' as const;
  readonly subcategory = 'composition';
  readonly name = 'Component Composition Detector (Learning)';
  readonly description = 'Learns component composition patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof CompositionConventions> {
    return ['preferredStyle', 'usesChildren', 'usesRenderProps', 'usesHOCs'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof CompositionConventions, ValueDistribution>
  ): void {
    const patterns = extractCompositionPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('preferredStyle')!;
    const childrenDist = distributions.get('usesChildren')!;
    const renderPropsDist = distributions.get('usesRenderProps')!;
    const hocDist = distributions.get('usesHOCs')!;

    let hasChildren = false;
    let hasRenderProps = false;
    let hasHOCs = false;

    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
      if (pattern.style === 'children') {hasChildren = true;}
      if (pattern.style === 'render-props') {hasRenderProps = true;}
      if (pattern.style === 'hoc') {hasHOCs = true;}
    }

    childrenDist.add(hasChildren, context.file);
    renderPropsDist.add(hasRenderProps, context.file);
    hocDist.add(hasHOCs, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    _conventions: LearningResult<CompositionConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const compPatterns = extractCompositionPatterns(context.content, context.file);
    if (compPatterns.length === 0) {
      return this.createEmptyResult();
    }

    if (compPatterns.length > 0) {
      const first = compPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/composition`,
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

export function createCompositionLearningDetector(): CompositionLearningDetector {
  return new CompositionLearningDetector();
}
