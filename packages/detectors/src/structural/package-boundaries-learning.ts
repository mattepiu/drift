/**
 * Package Boundaries Detector - LEARNING VERSION
 *
 * Learns package boundary patterns from the user's codebase:
 * - Import restrictions
 * - Public API patterns
 * - Internal module patterns
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

export type BoundaryStyle = 'barrel-exports' | 'package-json' | 'internal-folder' | 'none';

export interface PackageBoundariesConventions {
  [key: string]: unknown;
  boundaryStyle: BoundaryStyle;
  usesInternalFolder: boolean;
  enforcesBoundaries: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectBoundaryStyle(content: string): BoundaryStyle | null {
  if (/export\s*\*\s*from|export\s*\{[^}]+\}\s*from/.test(content)) {return 'barrel-exports';}
  if (/"exports":\s*\{/.test(content)) {return 'package-json';}
  if (/\/internal\/|_internal|\.internal\./.test(content)) {return 'internal-folder';}
  return null;
}

// ============================================================================
// Learning Package Boundaries Detector
// ============================================================================

export class PackageBoundariesLearningDetector extends LearningDetector<PackageBoundariesConventions> {
  readonly id = 'structural/package-boundaries';
  readonly category = 'structural' as const;
  readonly subcategory = 'package-boundaries';
  readonly name = 'Package Boundaries Detector (Learning)';
  readonly description = 'Learns package boundary patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof PackageBoundariesConventions> {
    return ['boundaryStyle', 'usesInternalFolder', 'enforcesBoundaries'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof PackageBoundariesConventions, ValueDistribution>
  ): void {
    const style = detectBoundaryStyle(context.content);
    const styleDist = distributions.get('boundaryStyle')!;
    const internalDist = distributions.get('usesInternalFolder')!;
    
    if (style) {styleDist.add(style, context.file);}
    
    const usesInternal = /\/internal\/|_internal/.test(context.file);
    internalDist.add(usesInternal, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<PackageBoundariesConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentStyle = detectBoundaryStyle(context.content);
    const learnedStyle = conventions.conventions.boundaryStyle?.value;
    
    if (currentStyle && learnedStyle && currentStyle !== learnedStyle) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'package boundary style', currentStyle, learnedStyle,
        `Using '${currentStyle}' but your project uses '${learnedStyle}'`
      ));
    }
    
    if (currentStyle) {
      patterns.push({
        patternId: `${this.id}/${currentStyle}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createPackageBoundariesLearningDetector(): PackageBoundariesLearningDetector {
  return new PackageBoundariesLearningDetector();
}
