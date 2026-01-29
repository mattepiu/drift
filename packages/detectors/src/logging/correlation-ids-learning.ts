/**
 * Correlation IDs Detector - LEARNING VERSION
 *
 * Learns correlation ID patterns from the user's codebase:
 * - Correlation ID naming conventions
 * - Header names used
 * - Propagation patterns
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

export type CorrelationIdName = 'correlationId' | 'requestId' | 'traceId' | 'x-request-id';

export interface CorrelationIdsConventions {
  [key: string]: unknown;
  idName: CorrelationIdName;
  headerName: string;
  usesUUID: boolean;
}

interface CorrelationIdInfo {
  name: CorrelationIdName;
  headerName: string | null;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractCorrelationIds(content: string, file: string): CorrelationIdInfo[] {
  const results: CorrelationIdInfo[] = [];

  // Variable/property patterns
  const idPatterns = [
    { pattern: /correlationId/gi, name: 'correlationId' as CorrelationIdName },
    { pattern: /requestId/gi, name: 'requestId' as CorrelationIdName },
    { pattern: /traceId/gi, name: 'traceId' as CorrelationIdName },
  ];

  for (const { pattern, name } of idPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        name,
        headerName: null,
        line,
        column,
        file,
      });
    }
  }

  // Header patterns
  const headerPattern = /['"]x-(?:request|correlation|trace)-id['"]/gi;
  let match;
  while ((match = headerPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      name: 'x-request-id',
      headerName: match[0].replace(/['"]/g, ''),
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Correlation IDs Detector
// ============================================================================

export class CorrelationIdsLearningDetector extends LearningDetector<CorrelationIdsConventions> {
  readonly id = 'logging/correlation-ids';
  readonly category = 'logging' as const;
  readonly subcategory = 'correlation-ids';
  readonly name = 'Correlation IDs Detector (Learning)';
  readonly description = 'Learns correlation ID patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof CorrelationIdsConventions> {
    return ['idName', 'headerName', 'usesUUID'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof CorrelationIdsConventions, ValueDistribution>
  ): void {
    const ids = extractCorrelationIds(context.content, context.file);
    if (ids.length === 0) {return;}

    const nameDist = distributions.get('idName')!;
    const headerDist = distributions.get('headerName')!;

    for (const id of ids) {
      nameDist.add(id.name, context.file);
      if (id.headerName) {
        headerDist.add(id.headerName, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<CorrelationIdsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const ids = extractCorrelationIds(context.content, context.file);
    if (ids.length === 0) {
      return this.createEmptyResult();
    }

    const learnedName = conventions.conventions.idName?.value;

    // Check naming consistency
    if (learnedName) {
      for (const id of ids) {
        if (id.name !== learnedName && id.name !== 'x-request-id') {
          violations.push(this.createConventionViolation(
            id.file, id.line, id.column,
            'correlation ID name', id.name, learnedName,
            `Using '${id.name}' but project uses '${learnedName}'`
          ));
        }
      }
    }

    if (ids.length > 0) {
      const first = ids[0]!;
      patterns.push({
        patternId: `${this.id}/correlation-id`,
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

export function createCorrelationIdsLearningDetector(): CorrelationIdsLearningDetector {
  return new CorrelationIdsLearningDetector();
}
