/**
 * Laravel Auth Detector
 *
 * Main detector for Laravel authentication and authorization patterns.
 * Orchestrates Gate, Policy, and Middleware extraction.
 *
 * @module auth/laravel/auth-detector
 */

import { GateExtractor } from './extractors/gate-extractor.js';
import { MiddlewareExtractor } from './extractors/middleware-extractor.js';
import { PolicyExtractor } from './extractors/policy-extractor.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { LaravelAuthAnalysis, GuardInfo } from './types.js';
import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { Language, PatternMatch } from 'driftdetect-core';

// ============================================================================
// Guard Extraction Patterns
// ============================================================================

/**
 * Auth guard configuration
 */
const GUARD_CONFIG_PATTERN = /['"]guards['"]\s*=>\s*\[([\s\S]*?)\]/g;

/**
 * Individual guard definition
 */
const GUARD_DEFINITION_PATTERN = /['"](\w+)['"]\s*=>\s*\[([\s\S]*?)\]/g;

/**
 * Guard driver
 */
const GUARD_DRIVER_PATTERN = /['"]driver['"]\s*=>\s*['"](\w+)['"]/;

/**
 * Guard provider
 */
const GUARD_PROVIDER_PATTERN = /['"]provider['"]\s*=>\s*['"](\w+)['"]/;

// ============================================================================
// Laravel Auth Detector
// ============================================================================

/**
 * Detects Laravel authentication and authorization patterns.
 *
 * Supports:
 * - Gate definitions and checks
 * - Policy classes and authorize calls
 * - Middleware definitions and usages
 * - Auth guards configuration
 */
export class LaravelAuthDetector extends BaseDetector {
  readonly id = 'auth/laravel-auth';
  readonly category = 'auth' as const;
  readonly subcategory = 'laravel';
  readonly name = 'Laravel Auth Detector';
  readonly description = 'Extracts authentication and authorization patterns from Laravel code';
  readonly supportedLanguages: Language[] = ['php'];
  readonly detectionMethod = 'regex' as const;

  private readonly gateExtractor: GateExtractor;
  private readonly policyExtractor: PolicyExtractor;
  private readonly middlewareExtractor: MiddlewareExtractor;

  constructor() {
    super();
    this.gateExtractor = new GateExtractor();
    this.policyExtractor = new PolicyExtractor();
    this.middlewareExtractor = new MiddlewareExtractor();
  }

  /**
   * Detect Laravel auth patterns.
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    // Check if this is Laravel code
    if (!this.isLaravelCode(content)) {
      return this.createEmptyResult();
    }

    // Extract all auth components
    const analysis = this.analyzeAuth(content, file);

    // Generate patterns from analysis
    const patterns = this.generatePatterns(analysis, file);

    return this.createResult(patterns, [], analysis.confidence, {
      custom: {
        laravelAuth: analysis,
        framework: 'laravel',
      },
    });
  }

  /**
   * Analyze Laravel auth patterns for external use.
   */
  analyzeAuth(content: string, file: string): LaravelAuthAnalysis {
    const gates = this.gateExtractor.extract(content, file);
    const policies = this.policyExtractor.extract(content, file);
    const middleware = this.middlewareExtractor.extract(content, file);
    const guards = this.extractGuards(content, file);

    // Calculate overall confidence
    const confidences = [gates.confidence, policies.confidence, middleware.confidence];
    const nonZeroConfidences = confidences.filter(c => c > 0);
    const confidence = nonZeroConfidences.length > 0
      ? nonZeroConfidences.reduce((a, b) => a + b, 0) / nonZeroConfidences.length
      : 0;

    return {
      gates,
      policies,
      middleware,
      guards,
      confidence,
    };
  }

  generateQuickFix(): null {
    return null;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Check if content contains Laravel code.
   */
  private isLaravelCode(content: string): boolean {
    return (
      content.includes('use Illuminate\\') ||
      content.includes('Gate::') ||
      content.includes('Policy') ||
      content.includes('$routeMiddleware') ||
      content.includes('->authorize(') ||
      content.includes('Middleware') ||
      // Check for middleware handle method pattern
      (content.includes('function handle') && content.includes('$request'))
    );
  }

  /**
   * Extract auth guards from config.
   */
  private extractGuards(content: string, file: string): GuardInfo[] {
    const guards: GuardInfo[] = [];

    GUARD_CONFIG_PATTERN.lastIndex = 0;
    let configMatch;
    while ((configMatch = GUARD_CONFIG_PATTERN.exec(content)) !== null) {
      const guardsContent = configMatch[1] || '';
      const configLine = this.getLineNumber(content, configMatch.index);

      GUARD_DEFINITION_PATTERN.lastIndex = 0;
      let guardMatch;
      while ((guardMatch = GUARD_DEFINITION_PATTERN.exec(guardsContent)) !== null) {
        const name = guardMatch[1] || '';
        const guardConfig = guardMatch[2] || '';

        const driverMatch = guardConfig.match(GUARD_DRIVER_PATTERN);
        const providerMatch = guardConfig.match(GUARD_PROVIDER_PATTERN);

        guards.push({
          name,
          driver: driverMatch ? driverMatch[1] || '' : '',
          provider: providerMatch ? providerMatch[1] || null : null,
          file,
          line: configLine + this.getLineNumber(guardsContent.substring(0, guardMatch.index), 0),
        });
      }
    }

    return guards;
  }

  /**
   * Generate patterns from analysis.
   */
  private generatePatterns(analysis: LaravelAuthAnalysis, _file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    // Gate patterns
    for (const gate of analysis.gates.definitions) {
      patterns.push({
        patternId: `${this.id}/gate-definition`,
        location: { file: gate.file, line: gate.line, column: 1 },
        confidence: analysis.gates.confidence,
        isOutlier: false,
      });
    }

    // Policy patterns
    for (const policy of analysis.policies.policies) {
      patterns.push({
        patternId: `${this.id}/policy-class`,
        location: { file: policy.file, line: policy.line, column: 1 },
        confidence: analysis.policies.confidence,
        isOutlier: false,
      });
    }

    // Middleware patterns
    for (const middleware of analysis.middleware.middlewares) {
      patterns.push({
        patternId: `${this.id}/middleware-class`,
        location: { file: middleware.file, line: middleware.line, column: 1 },
        confidence: analysis.middleware.confidence,
        isOutlier: false,
      });
    }

    // Guard patterns
    for (const guard of analysis.guards) {
      patterns.push({
        patternId: `${this.id}/auth-guard`,
        location: { file: guard.file, line: guard.line, column: 1 },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    return patterns;
  }

  /**
   * Get line number from offset.
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new Laravel auth detector.
 */
export function createLaravelAuthDetector(): LaravelAuthDetector {
  return new LaravelAuthDetector();
}
