/**
 * Circular Dependencies Detector - LEARNING VERSION
 *
 * Learns circular dependency handling patterns from the user's codebase:
 * - Dependency injection patterns
 * - Lazy loading approaches
 * - Module organization
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

export type CircularResolution = 'lazy-import' | 'dependency-injection' | 'interface-segregation' | 'none';

export interface CircularDepsConventions {
  [key: string]: unknown;
  resolutionMethod: CircularResolution;
  usesBarrelFiles: boolean;
  maxModuleDepth: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectResolutionMethod(content: string): CircularResolution | null {
  if (/import\s*\(\s*['"]|require\s*\(\s*['"].*\)\.then/.test(content)) {return 'lazy-import';}
  if (/@Inject|@Injectable|container\.resolve/.test(content)) {return 'dependency-injection';}
  if (/interface\s+I\w+|implements\s+I\w+/.test(content)) {return 'interface-segregation';}
  return null;
}

// ============================================================================
// Learning Circular Dependencies Detector
// ============================================================================

export class CircularDepsLearningDetector extends LearningDetector<CircularDepsConventions> {
  readonly id = 'structural/circular-deps';
  readonly category = 'structural' as const;
  readonly subcategory = 'circular-deps';
  readonly name = 'Circular Dependencies Detector (Learning)';
  readonly description = 'Learns circular dependency handling patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof CircularDepsConventions> {
    return ['resolutionMethod', 'usesBarrelFiles', 'maxModuleDepth'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof CircularDepsConventions, ValueDistribution>
  ): void {
    const method = detectResolutionMethod(context.content);
    const methodDist = distributions.get('resolutionMethod')!;
    const barrelDist = distributions.get('usesBarrelFiles')!;
    
    if (method) {methodDist.add(method, context.file);}
    
    const isBarrel = /index\.[tj]sx?$/.test(context.file) && /export\s*\*\s*from/.test(context.content);
    barrelDist.add(isBarrel, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<CircularDepsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentMethod = detectResolutionMethod(context.content);
    const learnedMethod = conventions.conventions.resolutionMethod?.value;
    
    if (currentMethod && learnedMethod && currentMethod !== learnedMethod) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'circular dependency resolution', currentMethod, learnedMethod,
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

export function createCircularDepsLearningDetector(): CircularDepsLearningDetector {
  return new CircularDepsLearningDetector();
}
