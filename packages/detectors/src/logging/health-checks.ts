/**
 * Health Checks Detector - Health check pattern detection
 *
 * Detects health check patterns including:
 * - Liveness probes
 * - Readiness probes
 * - Health endpoints
 *
 * @requirements 15.7 - Health check patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type HealthCheckPatternType =
  | 'health-endpoint'
  | 'liveness-probe'
  | 'readiness-probe'
  | 'health-check-function'
  | 'dependency-check';

export interface HealthCheckPatternInfo {
  type: HealthCheckPatternType;
  line: number;
  column: number;
  match: string;
}

export interface HealthCheckAnalysis {
  patterns: HealthCheckPatternInfo[];
  hasHealthEndpoint: boolean;
  hasLivenessProbe: boolean;
  hasReadinessProbe: boolean;
}

// ============================================================================
// Patterns (JavaScript/TypeScript + Python)
// ============================================================================

export const HEALTH_ENDPOINT_PATTERNS = [
  // Both languages - URL patterns
  /['"`]\/health['"`]/gi,
  /['"`]\/healthz['"`]/gi,
  /['"`]\/health\/live['"`]/gi,
  /['"`]\/health\/ready['"`]/gi,
  /['"`]\/_health['"`]/gi,
  // Python FastAPI
  /@(?:app|router)\.get\s*\(\s*['"`]\/health/gi,
];

export const LIVENESS_PROBE_PATTERNS = [
  // Both languages
  /liveness/gi,
  /\/live/gi,
  /isAlive/gi,
  /livenessProbe/gi,
  // Python
  /is_alive/gi,
  /liveness_probe/gi,
];

export const READINESS_PROBE_PATTERNS = [
  // Both languages
  /readiness/gi,
  /\/ready/gi,
  /isReady/gi,
  /readinessProbe/gi,
  // Python
  /is_ready/gi,
  /readiness_probe/gi,
];

export const HEALTH_CHECK_FUNCTION_PATTERNS = [
  // JavaScript/TypeScript
  /healthCheck\s*\(/gi,
  /checkHealth\s*\(/gi,
  /getHealth\s*\(/gi,
  /healthStatus\s*\(/gi,
  // Python
  /health_check\s*\(/gi,
  /check_health\s*\(/gi,
  /get_health\s*\(/gi,
  /health_status\s*\(/gi,
  /async def health/gi,
];

export const DEPENDENCY_CHECK_PATTERNS = [
  // JavaScript/TypeScript
  /checkDatabase\s*\(/gi,
  /checkRedis\s*\(/gi,
  /checkDependencies\s*\(/gi,
  /pingDatabase\s*\(/gi,
  // Python
  /check_database\s*\(/gi,
  /check_redis\s*\(/gi,
  /check_dependencies\s*\(/gi,
  /ping_database\s*\(/gi,
  /\.ping\s*\(/gi,
];

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /\.d\.ts$/,
    /node_modules\//,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

function detectPatterns(
  content: string,
  patterns: RegExp[],
  type: HealthCheckPatternType
): HealthCheckPatternInfo[] {
  const results: HealthCheckPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type,
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function analyzeHealthChecks(content: string, filePath: string): HealthCheckAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      hasHealthEndpoint: false,
      hasLivenessProbe: false,
      hasReadinessProbe: false,
    };
  }

  const patterns: HealthCheckPatternInfo[] = [
    ...detectPatterns(content, HEALTH_ENDPOINT_PATTERNS, 'health-endpoint'),
    ...detectPatterns(content, LIVENESS_PROBE_PATTERNS, 'liveness-probe'),
    ...detectPatterns(content, READINESS_PROBE_PATTERNS, 'readiness-probe'),
    ...detectPatterns(content, HEALTH_CHECK_FUNCTION_PATTERNS, 'health-check-function'),
    ...detectPatterns(content, DEPENDENCY_CHECK_PATTERNS, 'dependency-check'),
  ];

  const hasHealthEndpoint = patterns.some((p) => p.type === 'health-endpoint');
  const hasLivenessProbe = patterns.some((p) => p.type === 'liveness-probe');
  const hasReadinessProbe = patterns.some((p) => p.type === 'readiness-probe');

  return {
    patterns,
    hasHealthEndpoint,
    hasLivenessProbe,
    hasReadinessProbe,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class HealthChecksDetector extends RegexDetector {
  readonly id = 'logging/health-checks';
  readonly name = 'Health Checks Detector';
  readonly description = 'Detects health check patterns';
  readonly category: PatternCategory = 'logging';
  readonly subcategory = 'health-checks';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeHealthChecks(context.content, context.file);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = 0.9;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        hasHealthEndpoint: analysis.hasHealthEndpoint,
        hasLivenessProbe: analysis.hasLivenessProbe,
        hasReadinessProbe: analysis.hasReadinessProbe,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createHealthChecksDetector(): HealthChecksDetector {
  return new HealthChecksDetector();
}
