/**
 * DTO Patterns Detector - LEARNING VERSION
 *
 * Learns DTO (Data Transfer Object) patterns from the user's codebase:
 * - DTO naming conventions
 * - Transformation patterns
 * - Validation integration
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

export type DTONamingSuffix = 'DTO' | 'Dto' | 'Request' | 'Response' | 'Input' | 'Output';

export interface DTOPatternsConventions {
  [key: string]: unknown;
  namingSuffix: DTONamingSuffix;
  usesClassTransformer: boolean;
  usesValidation: boolean;
}

interface DTOPatternInfo {
  name: string;
  suffix: DTONamingSuffix | null;
  hasValidation: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectSuffix(name: string): DTONamingSuffix | null {
  if (name.endsWith('DTO')) {return 'DTO';}
  if (name.endsWith('Dto')) {return 'Dto';}
  if (name.endsWith('Request')) {return 'Request';}
  if (name.endsWith('Response')) {return 'Response';}
  if (name.endsWith('Input')) {return 'Input';}
  if (name.endsWith('Output')) {return 'Output';}
  return null;
}

function extractDTOPatterns(content: string, file: string): DTOPatternInfo[] {
  const results: DTOPatternInfo[] = [];

  // Class-based DTOs
  const classPattern = /class\s+(\w+(?:DTO|Dto|Request|Response|Input|Output))\s*(?:extends|implements|{)/g;
  let match;
  while ((match = classPattern.exec(content)) !== null) {
    const name = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    // Check for validation decorators
    const classEnd = content.indexOf('}', match.index + match[0].length);
    const classBody = content.slice(match.index, classEnd);
    const hasValidation = /@Is\w+|@Validate/.test(classBody);

    results.push({
      name,
      suffix: detectSuffix(name),
      hasValidation,
      line,
      column,
      file,
    });
  }

  // Interface/Type DTOs
  const typePattern = /(?:interface|type)\s+(\w+(?:DTO|Dto|Request|Response|Input|Output))\s*[={<]/g;
  while ((match = typePattern.exec(content)) !== null) {
    const name = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      name,
      suffix: detectSuffix(name),
      hasValidation: false,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning DTO Patterns Detector
// ============================================================================

export class DTOPatternsLearningDetector extends LearningDetector<DTOPatternsConventions> {
  readonly id = 'data-access/dto-patterns';
  readonly category = 'data-access' as const;
  readonly subcategory = 'dto-patterns';
  readonly name = 'DTO Patterns Detector (Learning)';
  readonly description = 'Learns DTO patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof DTOPatternsConventions> {
    return ['namingSuffix', 'usesClassTransformer', 'usesValidation'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof DTOPatternsConventions, ValueDistribution>
  ): void {
    const patterns = extractDTOPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const suffixDist = distributions.get('namingSuffix')!;
    const validationDist = distributions.get('usesValidation')!;

    for (const pattern of patterns) {
      if (pattern.suffix) {
        suffixDist.add(pattern.suffix, context.file);
      }
      validationDist.add(pattern.hasValidation, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<DTOPatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const dtoPatterns = extractDTOPatterns(context.content, context.file);
    if (dtoPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedSuffix = conventions.conventions.namingSuffix?.value;

    // Check naming suffix consistency
    if (learnedSuffix) {
      for (const pattern of dtoPatterns) {
        if (pattern.suffix && pattern.suffix !== learnedSuffix) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'DTO naming', pattern.suffix, learnedSuffix,
            `DTO '${pattern.name}' uses '${pattern.suffix}' suffix but project uses '${learnedSuffix}'`
          ));
        }
      }
    }

    if (dtoPatterns.length > 0) {
      const first = dtoPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/dto`,
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

export function createDTOPatternsLearningDetector(): DTOPatternsLearningDetector {
  return new DTOPatternsLearningDetector();
}
