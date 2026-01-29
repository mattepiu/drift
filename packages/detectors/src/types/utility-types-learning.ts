/**
 * Utility Types Detector - LEARNING VERSION
 *
 * Learns utility type patterns from the user's codebase:
 * - Built-in vs custom utility types
 * - Common utility type usage
 * - Type composition patterns
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

export type UtilityTypeCategory = 'builtin' | 'custom' | 'library';

export interface UtilityTypesConventions {
  [key: string]: unknown;
  preferredCategory: UtilityTypeCategory;
  usesPartial: boolean;
  usesOmit: boolean;
  usesPick: boolean;
}

interface UtilityTypeInfo {
  name: string;
  category: UtilityTypeCategory;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const BUILTIN_UTILITIES = new Set([
  'Partial', 'Required', 'Readonly', 'Record', 'Pick', 'Omit',
  'Exclude', 'Extract', 'NonNullable', 'Parameters', 'ReturnType',
  'InstanceType', 'ThisType', 'Awaited', 'Uppercase', 'Lowercase',
  'Capitalize', 'Uncapitalize'
]);

function extractUtilityTypes(content: string, file: string): UtilityTypeInfo[] {
  const results: UtilityTypeInfo[] = [];

  // Utility type usage
  const utilityPattern = /\b(Partial|Required|Readonly|Record|Pick|Omit|Exclude|Extract|NonNullable|Parameters|ReturnType|InstanceType|Awaited|DeepPartial|DeepReadonly)\s*</g;
  let match;
  while ((match = utilityPattern.exec(content)) !== null) {
    const name = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    let category: UtilityTypeCategory = 'custom';
    if (BUILTIN_UTILITIES.has(name)) {category = 'builtin';}

    results.push({
      name,
      category,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Utility Types Detector
// ============================================================================

export class UtilityTypesLearningDetector extends LearningDetector<UtilityTypesConventions> {
  readonly id = 'types/utility-types';
  readonly category = 'types' as const;
  readonly subcategory = 'utility-types';
  readonly name = 'Utility Types Detector (Learning)';
  readonly description = 'Learns utility type patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript'];

  protected getConventionKeys(): Array<keyof UtilityTypesConventions> {
    return ['preferredCategory', 'usesPartial', 'usesOmit', 'usesPick'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof UtilityTypesConventions, ValueDistribution>
  ): void {
    const types = extractUtilityTypes(context.content, context.file);
    if (types.length === 0) {return;}

    const categoryDist = distributions.get('preferredCategory')!;
    const partialDist = distributions.get('usesPartial')!;
    const omitDist = distributions.get('usesOmit')!;
    const pickDist = distributions.get('usesPick')!;

    let hasPartial = false;
    let hasOmit = false;
    let hasPick = false;

    for (const type of types) {
      categoryDist.add(type.category, context.file);
      if (type.name === 'Partial') {hasPartial = true;}
      if (type.name === 'Omit') {hasOmit = true;}
      if (type.name === 'Pick') {hasPick = true;}
    }

    partialDist.add(hasPartial, context.file);
    omitDist.add(hasOmit, context.file);
    pickDist.add(hasPick, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    _conventions: LearningResult<UtilityTypesConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const utilityTypes = extractUtilityTypes(context.content, context.file);
    if (utilityTypes.length === 0) {
      return this.createEmptyResult();
    }

    // Record patterns found
    if (utilityTypes.length > 0) {
      const first = utilityTypes[0]!;
      patterns.push({
        patternId: `${this.id}/utility`,
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

export function createUtilityTypesLearningDetector(): UtilityTypesLearningDetector {
  return new UtilityTypesLearningDetector();
}
