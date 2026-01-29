/**
 * Spring Transaction Patterns Detector - LEARNING VERSION
 *
 * Learns transaction patterns from the user's codebase:
 * - @Transactional placement (class vs method level)
 * - Propagation settings preferences
 * - Isolation level patterns
 * - Rollback configuration patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import { SPRING_KEYWORD_GROUPS } from './keywords.js';
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

export type TransactionalPlacement = 'class' | 'method' | 'mixed';
export type PropagationType = 'REQUIRED' | 'REQUIRES_NEW' | 'NESTED' | 'SUPPORTS' | 'other';
export type IsolationType = 'default' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';

export interface SpringTransactionConventions {
  [key: string]: unknown;
  /** Where @Transactional is typically placed */
  transactionalPlacement: TransactionalPlacement;
  /** Most common propagation setting */
  propagationType: PropagationType;
  /** Whether explicit isolation is used */
  usesExplicitIsolation: boolean;
  /** Whether rollbackFor is explicitly configured */
  usesExplicitRollback: boolean;
}

interface TransactionPatternInfo {
  /** The transaction keyword found */
  keyword: string;
  /** Type of transaction pattern */
  patternType: 'annotation' | 'propagation' | 'isolation' | 'rollback' | 'manager';
  /** Specific value for categorization */
  value: string;
  /** Whether it's at class level */
  isClassLevel: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractTransactionPatterns(content: string, file: string): TransactionPatternInfo[] {
  const results: TransactionPatternInfo[] = [];
  const keywords = SPRING_KEYWORD_GROUPS.transaction.keywords;

  for (const keyword of keywords) {
    const pattern = new RegExp(`@${keyword}\\b|\\b${keyword}\\b`, 'g');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip imports
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.slice(lineStart, content.indexOf('\n', match.index));
      if (lineContent.trim().startsWith('import ')) {continue;}

      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      // Categorize the pattern
      let patternType: TransactionPatternInfo['patternType'] = 'annotation';
      const value = keyword;
      let isClassLevel = false;

      if (keyword === 'Transactional' || keyword === 'EnableTransactionManagement') {
        patternType = 'annotation';
        // Check if it's at class level (followed by class declaration)
        const afterMatch = content.slice(match.index, match.index + 200);
        isClassLevel = /\n\s*(?:public\s+)?(?:abstract\s+)?class\s+/.test(afterMatch);
      } else if (['REQUIRED', 'REQUIRES_NEW', 'NESTED', 'SUPPORTS', 
                  'NOT_SUPPORTED', 'MANDATORY', 'NEVER'].includes(keyword)) {
        patternType = 'propagation';
      } else if (['READ_UNCOMMITTED', 'READ_COMMITTED', 
                  'REPEATABLE_READ', 'SERIALIZABLE'].includes(keyword)) {
        patternType = 'isolation';
      } else if (['rollbackFor', 'noRollbackFor', 'rollbackOn'].includes(keyword)) {
        patternType = 'rollback';
      } else if (['TransactionManager', 'PlatformTransactionManager', 
                  'TransactionTemplate', 'TransactionStatus'].includes(keyword)) {
        patternType = 'manager';
      }

      results.push({
        keyword,
        patternType,
        value,
        isClassLevel,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Detector
// ============================================================================

export class SpringTransactionLearningDetector extends LearningDetector<SpringTransactionConventions> {
  readonly id = 'spring/transaction-patterns-learning';
  readonly category = 'data-access' as const;
  readonly subcategory = 'spring-transaction';
  readonly name = 'Spring Transaction Patterns Detector (Learning)';
  readonly description = 'Learns transaction patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringTransactionConventions> {
    return ['transactionalPlacement', 'propagationType', 'usesExplicitIsolation', 'usesExplicitRollback'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringTransactionConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractTransactionPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const placementDist = distributions.get('transactionalPlacement')!;
    const propagationDist = distributions.get('propagationType')!;
    const isolationDist = distributions.get('usesExplicitIsolation')!;
    const rollbackDist = distributions.get('usesExplicitRollback')!;

    for (const pattern of patterns) {
      if (pattern.patternType === 'annotation' && pattern.keyword === 'Transactional') {
        placementDist.add(
          pattern.isClassLevel ? 'class' : 'method' as TransactionalPlacement, 
          context.file
        );
      } else if (pattern.patternType === 'propagation') {
        const propType = ['REQUIRED', 'REQUIRES_NEW', 'NESTED', 'SUPPORTS'].includes(pattern.keyword)
          ? pattern.keyword as PropagationType
          : 'other' as PropagationType;
        propagationDist.add(propType, context.file);
      } else if (pattern.patternType === 'isolation') {
        isolationDist.add(true, context.file);
      } else if (pattern.patternType === 'rollback') {
        rollbackDist.add(true, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringTransactionConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractTransactionPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedPlacement = conventions.conventions.transactionalPlacement?.value;
    const learnedPropagation = conventions.conventions.propagationType?.value;

    // Check for @Transactional placement consistency
    if (learnedPlacement && learnedPlacement !== 'mixed') {
      for (const pattern of foundPatterns) {
        if (pattern.keyword === 'Transactional') {
          const currentPlacement = pattern.isClassLevel ? 'class' : 'method';
          if (currentPlacement !== learnedPlacement) {
            violations.push(this.createConventionViolation(
              context.file, pattern.line, pattern.column,
              '@Transactional placement', currentPlacement, learnedPlacement,
              `@Transactional at ${currentPlacement} level but project uses ${learnedPlacement} level`
            ));
          }
        }
      }
    }

    // Check for propagation consistency
    if (learnedPropagation && learnedPropagation !== 'other') {
      for (const pattern of foundPatterns) {
        if (pattern.patternType === 'propagation') {
          if (pattern.keyword !== learnedPropagation && 
              ['REQUIRED', 'REQUIRES_NEW', 'NESTED', 'SUPPORTS'].includes(pattern.keyword)) {
            violations.push(this.createConventionViolation(
              context.file, pattern.line, pattern.column,
              'propagation type', pattern.keyword, learnedPropagation,
              `Using Propagation.${pattern.keyword} but project typically uses ${learnedPropagation}`
            ));
          }
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/transaction`,
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

export function createSpringTransactionLearningDetector(): SpringTransactionLearningDetector {
  return new SpringTransactionLearningDetector();
}
