/**
 * Type Naming Conventions Detector - LEARNING VERSION
 *
 * Learns type naming patterns from the user's codebase:
 * - Type/interface naming conventions
 * - Prefix/suffix patterns (I prefix, Type suffix, etc.)
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

export type TypeNamingStyle = 'PascalCase' | 'IPrefixed' | 'TSuffixed';

export interface TypeNamingConventions {
  [key: string]: unknown;
  interfaceNaming: TypeNamingStyle;
  typeNaming: TypeNamingStyle;
  usesIPrefix: boolean;
}

interface TypeNamingInfo {
  kind: 'interface' | 'type';
  name: string;
  hasIPrefix: boolean;
  hasTSuffix: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractTypeNames(content: string, file: string): TypeNamingInfo[] {
  const results: TypeNamingInfo[] = [];

  // Interface names
  const interfacePattern = /interface\s+([A-Z]\w*)/g;
  let match;
  while ((match = interfacePattern.exec(content)) !== null) {
    const name = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      kind: 'interface',
      name,
      hasIPrefix: /^I[A-Z]/.test(name),
      hasTSuffix: name.endsWith('Type'),
      line,
      column,
      file,
    });
  }

  // Type names
  const typePattern = /type\s+([A-Z]\w*)\s*(?:<[^>]+>)?\s*=/g;
  while ((match = typePattern.exec(content)) !== null) {
    const name = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      kind: 'type',
      name,
      hasIPrefix: /^I[A-Z]/.test(name),
      hasTSuffix: name.endsWith('Type'),
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Type Naming Conventions Detector
// ============================================================================

export class TypeNamingConventionsLearningDetector extends LearningDetector<TypeNamingConventions> {
  readonly id = 'types/naming-conventions';
  readonly category = 'types' as const;
  readonly subcategory = 'naming-conventions';
  readonly name = 'Type Naming Conventions Detector (Learning)';
  readonly description = 'Learns type naming conventions from your codebase';
  readonly supportedLanguages: Language[] = ['typescript'];

  protected getConventionKeys(): Array<keyof TypeNamingConventions> {
    return ['interfaceNaming', 'typeNaming', 'usesIPrefix'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TypeNamingConventions, ValueDistribution>
  ): void {
    const typeNames = extractTypeNames(context.content, context.file);
    if (typeNames.length === 0) {return;}

    const iPrefixDist = distributions.get('usesIPrefix')!;

    for (const typeName of typeNames) {
      if (typeName.kind === 'interface') {
        iPrefixDist.add(typeName.hasIPrefix, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TypeNamingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const typeNames = extractTypeNames(context.content, context.file);
    if (typeNames.length === 0) {
      return this.createEmptyResult();
    }

    const learnedUsesIPrefix = conventions.conventions.usesIPrefix?.value;

    // Check I prefix consistency for interfaces
    if (learnedUsesIPrefix !== undefined) {
      for (const typeName of typeNames) {
        if (typeName.kind === 'interface') {
          if (learnedUsesIPrefix && !typeName.hasIPrefix) {
            violations.push(this.createConventionViolation(
              typeName.file, typeName.line, typeName.column,
              'interface naming', typeName.name, `I${typeName.name}`,
              `Interface '${typeName.name}' should have 'I' prefix (project convention)`
            ));
          } else if (!learnedUsesIPrefix && typeName.hasIPrefix) {
            violations.push(this.createConventionViolation(
              typeName.file, typeName.line, typeName.column,
              'interface naming', typeName.name, typeName.name.slice(1),
              `Interface '${typeName.name}' should not have 'I' prefix (project convention)`
            ));
          }
        }
      }
    }

    if (typeNames.length > 0) {
      const first = typeNames[0]!;
      patterns.push({
        patternId: `${this.id}/type-naming`,
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

export function createTypeNamingConventionsLearningDetector(): TypeNamingConventionsLearningDetector {
  return new TypeNamingConventionsLearningDetector();
}
