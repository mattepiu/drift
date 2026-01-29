/**
 * Interface vs Type Detector - LEARNING VERSION
 *
 * Learns type definition patterns from the user's codebase:
 * - Preference for interface vs type
 * - When each is used (objects, unions, etc.)
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

export type TypeDefinitionStyle = 'interface' | 'type';
export type TypeUsageContext = 'object' | 'union' | 'intersection' | 'function' | 'generic';

export interface InterfaceVsTypeConventions {
  [key: string]: unknown;
  preferredStyle: TypeDefinitionStyle;
  usesInterfaceForObjects: boolean;
  usesTypeForUnions: boolean;
}

interface TypeDefinitionInfo {
  style: TypeDefinitionStyle;
  context: TypeUsageContext;
  name: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractTypeDefinitions(content: string, file: string): TypeDefinitionInfo[] {
  const results: TypeDefinitionInfo[] = [];

  // Interface definitions
  const interfacePattern = /interface\s+(\w+)(?:<[^>]+>)?\s*(?:extends\s+[^{]+)?\s*\{/g;
  let match;
  while ((match = interfacePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'interface',
      context: 'object',
      name: match[1] || '',
      line,
      column,
      file,
    });
  }

  // Type definitions
  const typePattern = /type\s+(\w+)(?:<[^>]+>)?\s*=\s*([^;]+)/g;
  while ((match = typePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const definition = match[2] || '';

    let context: TypeUsageContext = 'object';
    if (definition.includes('|')) {context = 'union';}
    else if (definition.includes('&')) {context = 'intersection';}
    else if (definition.includes('=>')) {context = 'function';}
    else if (definition.trim().startsWith('{')) {context = 'object';}

    results.push({
      style: 'type',
      context,
      name: match[1] || '',
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Interface vs Type Detector
// ============================================================================

export class InterfaceVsTypeLearningDetector extends LearningDetector<InterfaceVsTypeConventions> {
  readonly id = 'types/interface-vs-type';
  readonly category = 'types' as const;
  readonly subcategory = 'interface-vs-type';
  readonly name = 'Interface vs Type Detector (Learning)';
  readonly description = 'Learns interface vs type preferences from your codebase';
  readonly supportedLanguages: Language[] = ['typescript'];

  protected getConventionKeys(): Array<keyof InterfaceVsTypeConventions> {
    return ['preferredStyle', 'usesInterfaceForObjects', 'usesTypeForUnions'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof InterfaceVsTypeConventions, ValueDistribution>
  ): void {
    const definitions = extractTypeDefinitions(context.content, context.file);
    if (definitions.length === 0) {return;}

    const styleDist = distributions.get('preferredStyle')!;
    const interfaceObjDist = distributions.get('usesInterfaceForObjects')!;
    const typeUnionDist = distributions.get('usesTypeForUnions')!;

    for (const def of definitions) {
      styleDist.add(def.style, context.file);

      if (def.context === 'object') {
        interfaceObjDist.add(def.style === 'interface', context.file);
      }
      if (def.context === 'union') {
        typeUnionDist.add(def.style === 'type', context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<InterfaceVsTypeConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const definitions = extractTypeDefinitions(context.content, context.file);
    if (definitions.length === 0) {
      return this.createEmptyResult();
    }

    const learnedInterfaceForObjects = conventions.conventions.usesInterfaceForObjects?.value;

    // Check object type definitions
    if (learnedInterfaceForObjects !== undefined) {
      for (const def of definitions) {
        if (def.context === 'object') {
          const shouldUseInterface = learnedInterfaceForObjects;
          if (shouldUseInterface && def.style === 'type') {
            violations.push(this.createConventionViolation(
              def.file, def.line, def.column,
              'type definition', 'type', 'interface',
              `Object type '${def.name}' should use interface (project convention)`
            ));
          } else if (!shouldUseInterface && def.style === 'interface') {
            violations.push(this.createConventionViolation(
              def.file, def.line, def.column,
              'type definition', 'interface', 'type',
              `Object type '${def.name}' should use type (project convention)`
            ));
          }
        }
      }
    }

    if (definitions.length > 0) {
      const first = definitions[0]!;
      patterns.push({
        patternId: `${this.id}/type-def`,
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

export function createInterfaceVsTypeLearningDetector(): InterfaceVsTypeLearningDetector {
  return new InterfaceVsTypeLearningDetector();
}
