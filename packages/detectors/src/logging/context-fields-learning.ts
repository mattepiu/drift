/**
 * Context Fields Detector - LEARNING VERSION
 *
 * Learns logging context field patterns from the user's codebase:
 * - Common context fields used
 * - Field naming conventions
 * - Required vs optional fields
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

export type ContextFieldStyle = 'camelCase' | 'snake_case' | 'PascalCase';

export interface ContextFieldsConventions {
  [key: string]: unknown;
  fieldNaming: ContextFieldStyle;
  usesRequestId: boolean;
  usesUserId: boolean;
  usesTimestamp: boolean;
}

interface ContextFieldInfo {
  fieldName: string;
  style: ContextFieldStyle;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectFieldStyle(name: string): ContextFieldStyle {
  if (name.includes('_')) {return 'snake_case';}
  if (/^[A-Z]/.test(name)) {return 'PascalCase';}
  return 'camelCase';
}

function extractContextFields(content: string, file: string): ContextFieldInfo[] {
  const results: ContextFieldInfo[] = [];

  // Logger context patterns: logger.info('msg', { field: value })
  const logContextPattern = /(?:logger|log|console)\.\w+\s*\([^,]+,\s*\{([^}]+)\}/g;
  let match;
  while ((match = logContextPattern.exec(content)) !== null) {
    const contextObj = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    // Extract field names
    const fieldPattern = /(\w+)\s*:/g;
    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(contextObj)) !== null) {
      const fieldName = fieldMatch[1] || '';
      results.push({
        fieldName,
        style: detectFieldStyle(fieldName),
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Context Fields Detector
// ============================================================================

export class ContextFieldsLearningDetector extends LearningDetector<ContextFieldsConventions> {
  readonly id = 'logging/context-fields';
  readonly category = 'logging' as const;
  readonly subcategory = 'context-fields';
  readonly name = 'Context Fields Detector (Learning)';
  readonly description = 'Learns logging context field patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ContextFieldsConventions> {
    return ['fieldNaming', 'usesRequestId', 'usesUserId', 'usesTimestamp'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ContextFieldsConventions, ValueDistribution>
  ): void {
    const fields = extractContextFields(context.content, context.file);
    if (fields.length === 0) {return;}

    const namingDist = distributions.get('fieldNaming')!;
    const requestIdDist = distributions.get('usesRequestId')!;
    const userIdDist = distributions.get('usesUserId')!;
    const timestampDist = distributions.get('usesTimestamp')!;

    let hasRequestId = false;
    let hasUserId = false;
    let hasTimestamp = false;

    for (const field of fields) {
      namingDist.add(field.style, context.file);
      if (/request.?id/i.test(field.fieldName)) {hasRequestId = true;}
      if (/user.?id/i.test(field.fieldName)) {hasUserId = true;}
      if (/timestamp|time|date/i.test(field.fieldName)) {hasTimestamp = true;}
    }

    if (fields.length > 0) {
      requestIdDist.add(hasRequestId, context.file);
      userIdDist.add(hasUserId, context.file);
      timestampDist.add(hasTimestamp, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ContextFieldsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const fields = extractContextFields(context.content, context.file);
    if (fields.length === 0) {
      return this.createEmptyResult();
    }

    const learnedNaming = conventions.conventions.fieldNaming?.value;

    // Check field naming consistency
    if (learnedNaming) {
      for (const field of fields) {
        if (field.style !== learnedNaming) {
          violations.push(this.createConventionViolation(
            field.file, field.line, field.column,
            'context field naming', field.style, learnedNaming,
            `Field '${field.fieldName}' uses ${field.style} but project uses ${learnedNaming}`
          ));
        }
      }
    }

    if (fields.length > 0) {
      const first = fields[0]!;
      patterns.push({
        patternId: `${this.id}/context-field`,
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

export function createContextFieldsLearningDetector(): ContextFieldsLearningDetector {
  return new ContextFieldsLearningDetector();
}
