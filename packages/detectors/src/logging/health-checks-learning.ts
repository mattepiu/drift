/**
 * Health Checks Detector - LEARNING VERSION
 *
 * Learns health check patterns from the user's codebase:
 * - Health check endpoint naming
 * - Response format conventions
 * - Check types (liveness, readiness, startup)
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

export type HealthCheckType = 'liveness' | 'readiness' | 'startup' | 'combined';
export type ResponseFormat = 'simple' | 'detailed' | 'json' | 'text';

export interface HealthChecksConventions {
  [key: string]: unknown;
  checkType: HealthCheckType;
  responseFormat: ResponseFormat;
  endpointPath: string;
  includesVersion: boolean;
  includesDependencies: boolean;
}

interface HealthCheckInfo {
  type: HealthCheckType;
  path: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const HEALTH_PATTERNS = {
  liveness: /(?:\/health\/live|\/livez|\/alive|isAlive)/gi,
  readiness: /(?:\/health\/ready|\/readyz|\/ready|isReady)/gi,
  startup: /(?:\/health\/startup|\/startupz|\/startup)/gi,
  combined: /(?:\/health(?:check)?|\/status|\/ping)(?!\/)['"`]/gi,
};

function extractHealthChecks(content: string, file: string): HealthCheckInfo[] {
  const checks: HealthCheckInfo[] = [];
  
  for (const [type, regex] of Object.entries(HEALTH_PATTERNS)) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      checks.push({
        type: type as HealthCheckType,
        path: match[0],
        line: lineNumber,
        column,
        file,
      });
    }
  }
  
  return checks;
}

function detectResponseFormat(content: string): ResponseFormat | null {
  if (/status:\s*['"]ok['"].*dependencies:/s.test(content)) {return 'detailed';}
  if (/\{\s*['"]status['"]:\s*['"](?:ok|healthy)['"]/.test(content)) {return 'json';}
  if (/res\.send\(['"](?:OK|healthy|pong)['"]\)/.test(content)) {return 'text';}
  if (/status:\s*['"](?:ok|healthy)['"]/.test(content)) {return 'simple';}
  return null;
}

// ============================================================================
// Learning Health Checks Detector
// ============================================================================

export class HealthChecksLearningDetector extends LearningDetector<HealthChecksConventions> {
  readonly id = 'logging/health-checks';
  readonly category = 'logging' as const;
  readonly subcategory = 'health-checks';
  readonly name = 'Health Checks Detector (Learning)';
  readonly description = 'Learns health check patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof HealthChecksConventions> {
    return ['checkType', 'responseFormat', 'endpointPath', 'includesVersion', 'includesDependencies'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof HealthChecksConventions, ValueDistribution>
  ): void {
    const checks = extractHealthChecks(context.content, context.file);
    const responseFormat = detectResponseFormat(context.content);
    
    const typeDist = distributions.get('checkType')!;
    const formatDist = distributions.get('responseFormat')!;
    const depsDist = distributions.get('includesDependencies')!;
    
    for (const check of checks) {
      typeDist.add(check.type, context.file);
    }
    
    if (responseFormat) {
      formatDist.add(responseFormat, context.file);
    }
    
    const hasDeps = /dependencies|checks|services/i.test(context.content);
    if (checks.length > 0) {
      depsDist.add(hasDeps, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<HealthChecksConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const checks = extractHealthChecks(context.content, context.file);
    const learnedFormat = conventions.conventions.responseFormat?.value;
    const currentFormat = detectResponseFormat(context.content);
    
    if (learnedFormat && currentFormat && currentFormat !== learnedFormat) {
      const firstCheck = checks[0];
      if (firstCheck) {
        violations.push(this.createConventionViolation(
          firstCheck.file,
          firstCheck.line,
          firstCheck.column,
          'health check response format',
          currentFormat,
          learnedFormat,
          `Using '${currentFormat}' format but your project uses '${learnedFormat}'`
        ));
      }
    }
    
    for (const check of checks) {
      patterns.push({
        patternId: `${this.id}/${check.type}`,
        location: { file: context.file, line: check.line, column: check.column },
        confidence: 1.0,
        isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createHealthChecksLearningDetector(): HealthChecksLearningDetector {
  return new HealthChecksLearningDetector();
}
