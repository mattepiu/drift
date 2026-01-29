/**
 * ARIA Roles Detector - LEARNING VERSION
 *
 * Learns ARIA role patterns from the user's codebase:
 * - Role usage patterns
 * - ARIA attribute conventions
 * - Component accessibility patterns
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

export type AriaUsageStyle = 'explicit-roles' | 'semantic-html' | 'mixed';

export interface AriaRolesConventions {
  [key: string]: unknown;
  usageStyle: AriaUsageStyle;
  usesAriaLabels: boolean;
  usesAriaDescribedby: boolean;
}

interface AriaPatternInfo {
  type: 'role' | 'label' | 'describedby' | 'semantic';
  value: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractAriaPatterns(content: string, file: string): AriaPatternInfo[] {
  const results: AriaPatternInfo[] = [];

  // ARIA role patterns
  const rolePattern = /role\s*=\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = rolePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'role',
      value: match[1] || '',
      line,
      column,
      file,
    });
  }

  // aria-label patterns
  const labelPattern = /aria-label\s*=\s*['"]([^'"]+)['"]/g;
  while ((match = labelPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'label',
      value: match[1] || '',
      line,
      column,
      file,
    });
  }

  // aria-describedby patterns
  const describedbyPattern = /aria-describedby\s*=\s*['"]([^'"]+)['"]/g;
  while ((match = describedbyPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'describedby',
      value: match[1] || '',
      line,
      column,
      file,
    });
  }

  // Semantic HTML elements
  const semanticPattern = /<(nav|main|article|section|aside|header|footer|figure|figcaption)\b/g;
  while ((match = semanticPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'semantic',
      value: match[1] || '',
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning ARIA Roles Detector
// ============================================================================

export class AriaRolesLearningDetector extends LearningDetector<AriaRolesConventions> {
  readonly id = 'accessibility/aria-roles';
  readonly category = 'accessibility' as const;
  readonly subcategory = 'aria-roles';
  readonly name = 'ARIA Roles Detector (Learning)';
  readonly description = 'Learns ARIA role patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof AriaRolesConventions> {
    return ['usageStyle', 'usesAriaLabels', 'usesAriaDescribedby'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof AriaRolesConventions, ValueDistribution>
  ): void {
    const patterns = extractAriaPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('usageStyle')!;
    const labelDist = distributions.get('usesAriaLabels')!;
    const describedbyDist = distributions.get('usesAriaDescribedby')!;

    let hasRoles = false;
    let hasSemantic = false;
    let hasLabels = false;
    let hasDescribedby = false;

    for (const pattern of patterns) {
      if (pattern.type === 'role') {hasRoles = true;}
      if (pattern.type === 'semantic') {hasSemantic = true;}
      if (pattern.type === 'label') {hasLabels = true;}
      if (pattern.type === 'describedby') {hasDescribedby = true;}
    }

    if (hasRoles && hasSemantic) {
      styleDist.add('mixed', context.file);
    } else if (hasRoles) {
      styleDist.add('explicit-roles', context.file);
    } else if (hasSemantic) {
      styleDist.add('semantic-html', context.file);
    }

    labelDist.add(hasLabels, context.file);
    describedbyDist.add(hasDescribedby, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    _conventions: LearningResult<AriaRolesConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const ariaPatterns = extractAriaPatterns(context.content, context.file);
    if (ariaPatterns.length === 0) {
      return this.createEmptyResult();
    }

    // Record patterns found
    if (ariaPatterns.length > 0) {
      const first = ariaPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/aria`,
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

export function createAriaRolesLearningDetector(): AriaRolesLearningDetector {
  return new AriaRolesLearningDetector();
}
