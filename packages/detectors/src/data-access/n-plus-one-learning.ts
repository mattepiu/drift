/**
 * N+1 Query Detector - LEARNING VERSION
 *
 * Learns N+1 query prevention patterns from the user's codebase:
 * - Eager loading patterns
 * - Batch query patterns
 * - DataLoader usage
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

export type NPlusOnePreventionMethod = 'eager-loading' | 'dataloader' | 'batch-queries' | 'joins';

export interface NPlusOneConventions {
  [key: string]: unknown;
  preventionMethod: NPlusOnePreventionMethod;
  usesDataLoader: boolean;
  usesInclude: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const PREVENTION_PATTERNS = {
  eagerLoading: /include:|with:|eager:|preload/gi,
  dataloader: /DataLoader|dataloader/g,
  batchQueries: /findMany|whereIn|IN\s*\(/gi,
  joins: /join\s*\(|leftJoin|innerJoin|\.join/gi,
};

function detectPreventionMethod(content: string): NPlusOnePreventionMethod | null {
  if (PREVENTION_PATTERNS.dataloader.test(content)) {return 'dataloader';}
  if (PREVENTION_PATTERNS.eagerLoading.test(content)) {return 'eager-loading';}
  if (PREVENTION_PATTERNS.joins.test(content)) {return 'joins';}
  if (PREVENTION_PATTERNS.batchQueries.test(content)) {return 'batch-queries';}
  return null;
}

// ============================================================================
// Learning N+1 Query Detector
// ============================================================================

export class NPlusOneLearningDetector extends LearningDetector<NPlusOneConventions> {
  readonly id = 'data-access/n-plus-one';
  readonly category = 'data-access' as const;
  readonly subcategory = 'n-plus-one';
  readonly name = 'N+1 Query Detector (Learning)';
  readonly description = 'Learns N+1 prevention patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof NPlusOneConventions> {
    return ['preventionMethod', 'usesDataLoader', 'usesInclude'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof NPlusOneConventions, ValueDistribution>
  ): void {
    const method = detectPreventionMethod(context.content);
    const methodDist = distributions.get('preventionMethod')!;
    const dataloaderDist = distributions.get('usesDataLoader')!;
    const includeDist = distributions.get('usesInclude')!;
    
    if (method) {methodDist.add(method, context.file);}
    dataloaderDist.add(/DataLoader/.test(context.content), context.file);
    includeDist.add(/include:/.test(context.content), context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<NPlusOneConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentMethod = detectPreventionMethod(context.content);
    const learnedMethod = conventions.conventions.preventionMethod?.value;
    
    if (currentMethod && learnedMethod && currentMethod !== learnedMethod) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'N+1 prevention method', currentMethod, learnedMethod,
        `Using '${currentMethod}' but your project uses '${learnedMethod}'`
      ));
    }
    
    if (currentMethod) {
      patterns.push({
        patternId: `${this.id}/${currentMethod}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createNPlusOneLearningDetector(): NPlusOneLearningDetector {
  return new NPlusOneLearningDetector();
}
