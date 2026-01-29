/**
 * Environment Detection Detector - LEARNING VERSION
 *
 * Learns environment detection patterns from the user's codebase:
 * - Environment variable access patterns
 * - Environment checking approach
 * - Runtime detection methods
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

export type EnvAccessMethod = 'process-env' | 'import-meta' | 'dotenv' | 'config-object';
export type EnvCheckStyle = 'direct-comparison' | 'helper-function' | 'config-module';

export interface EnvironmentDetectionConventions {
  [key: string]: unknown;
  envAccessMethod: EnvAccessMethod;
  envCheckStyle: EnvCheckStyle;
  usesEnvValidation: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const ENV_ACCESS_PATTERNS = {
  processEnv: /process\.env\./g,
  importMeta: /import\.meta\.env\./g,
  dotenv: /dotenv|\.env/gi,
  configObject: /config\.\w+|getConfig\(/gi,
};

function detectEnvAccessMethod(content: string): EnvAccessMethod | null {
  if (ENV_ACCESS_PATTERNS.importMeta.test(content)) {return 'import-meta';}
  if (ENV_ACCESS_PATTERNS.processEnv.test(content)) {return 'process-env';}
  if (ENV_ACCESS_PATTERNS.dotenv.test(content)) {return 'dotenv';}
  if (ENV_ACCESS_PATTERNS.configObject.test(content)) {return 'config-object';}
  return null;
}

// ============================================================================
// Learning Environment Detection Detector
// ============================================================================

export class EnvironmentDetectionLearningDetector extends LearningDetector<EnvironmentDetectionConventions> {
  readonly id = 'config/environment-detection';
  readonly category = 'config' as const;
  readonly subcategory = 'environment-detection';
  readonly name = 'Environment Detection Detector (Learning)';
  readonly description = 'Learns environment detection patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof EnvironmentDetectionConventions> {
    return ['envAccessMethod', 'envCheckStyle', 'usesEnvValidation'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof EnvironmentDetectionConventions, ValueDistribution>
  ): void {
    const method = detectEnvAccessMethod(context.content);
    const methodDist = distributions.get('envAccessMethod')!;
    const validationDist = distributions.get('usesEnvValidation')!;
    
    if (method) {methodDist.add(method, context.file);}
    
    const usesValidation = /z\.string\(\)|yup\.string\(\)|joi\.string\(\)|validateEnv/i.test(context.content);
    validationDist.add(usesValidation, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<EnvironmentDetectionConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentMethod = detectEnvAccessMethod(context.content);
    const learnedMethod = conventions.conventions.envAccessMethod?.value;
    
    if (currentMethod && learnedMethod && currentMethod !== learnedMethod) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'env access method', currentMethod, learnedMethod,
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

export function createEnvironmentDetectionLearningDetector(): EnvironmentDetectionLearningDetector {
  return new EnvironmentDetectionLearningDetector();
}
