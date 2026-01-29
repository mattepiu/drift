/**
 * Environment Detection Detector - Environment detection pattern detection
 *
 * Detects environment detection patterns including:
 * - NODE_ENV checks
 * - Environment-specific code
 * - Development vs production patterns
 * - Environment branching
 *
 * @requirements 17.6 - Environment detection patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type EnvironmentDetectionPatternType =
  | 'node-env-check'
  | 'is-development'
  | 'is-production'
  | 'is-test'
  | 'env-branching'
  | 'env-specific-import'
  | 'debug-mode';

export type EnvironmentDetectionViolationType =
  | 'hardcoded-env'
  | 'missing-env-check'
  | 'inconsistent-env-check';

export interface EnvironmentDetectionPatternInfo {
  type: EnvironmentDetectionPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  environment?: string | undefined;
  context?: string | undefined;
}

export interface EnvironmentDetectionViolationInfo {
  type: EnvironmentDetectionViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface EnvironmentDetectionAnalysis {
  patterns: EnvironmentDetectionPatternInfo[];
  violations: EnvironmentDetectionViolationInfo[];
  hasEnvChecks: boolean;
  environments: string[];
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const NODE_ENV_CHECK_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.NODE_ENV/gi,
  /import\.meta\.env\.MODE/gi,
  /import\.meta\.env\.DEV/gi,
  /import\.meta\.env\.PROD/gi,
  /process\.env\.APP_ENV/gi,
  /process\.env\.ENVIRONMENT/gi,
  /process\.env\.ENV/gi,
  // Python
  /os\.environ\[['"](?:ENV|ENVIRONMENT|APP_ENV)['"]\]/gi,
  /os\.getenv\s*\(\s*['"](?:ENV|ENVIRONMENT|APP_ENV)['"]/gi,
  /os\.environ\.get\s*\(\s*['"](?:ENV|ENVIRONMENT|APP_ENV)['"]/gi,
] as const;

export const IS_DEVELOPMENT_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.NODE_ENV\s*[!=]==?\s*['"`]development['"`]/gi,
  /process\.env\.NODE_ENV\s*[!=]==?\s*['"`]dev['"`]/gi,
  /import\.meta\.env\.DEV/gi,
  /isDevelopment/gi,
  /isDev\b/gi,
  /isDevMode/gi,
  /__DEV__/gi,
  // Python
  /os\.environ\.get\s*\(\s*['"]ENV['"]\s*\)\s*==\s*['"]development['"]/gi,
  /os\.getenv\s*\(\s*['"]ENV['"]\s*\)\s*==\s*['"]development['"]/gi,
  /is_development/gi,
  /is_dev\b/gi,
  /DEBUG\s*=\s*True/gi,
  /settings\.DEBUG/gi,
] as const;

export const IS_PRODUCTION_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.NODE_ENV\s*[!=]==?\s*['"`]production['"`]/gi,
  /process\.env\.NODE_ENV\s*[!=]==?\s*['"`]prod['"`]/gi,
  /import\.meta\.env\.PROD/gi,
  /isProduction/gi,
  /isProd\b/gi,
  /isProdMode/gi,
  /__PROD__/gi,
  // Python
  /os\.environ\.get\s*\(\s*['"]ENV['"]\s*\)\s*==\s*['"]production['"]/gi,
  /os\.getenv\s*\(\s*['"]ENV['"]\s*\)\s*==\s*['"]production['"]/gi,
  /is_production/gi,
  /is_prod\b/gi,
  /DEBUG\s*=\s*False/gi,
] as const;

export const IS_TEST_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.NODE_ENV\s*[!=]==?\s*['"`]test['"`]/gi,
  /process\.env\.NODE_ENV\s*[!=]==?\s*['"`]testing['"`]/gi,
  /isTest\b/gi,
  /isTestMode/gi,
  /isTesting/gi,
  /__TEST__/gi,
  /process\.env\.JEST_WORKER_ID/gi,
  /process\.env\.VITEST/gi,
  // Python
  /os\.environ\.get\s*\(\s*['"]ENV['"]\s*\)\s*==\s*['"]test['"]/gi,
  /os\.getenv\s*\(\s*['"]TESTING['"]\s*\)/gi,
  /is_test\b/gi,
  /is_testing/gi,
  /TESTING\s*=\s*True/gi,
  /pytest/gi,
] as const;

export const ENV_BRANCHING_PATTERNS = [
  /if\s*\(\s*process\.env\.NODE_ENV/gi,
  /switch\s*\(\s*process\.env\.NODE_ENV/gi,
  /process\.env\.NODE_ENV\s*\?\s*/gi,
  /process\.env\.NODE_ENV\s*===?\s*['"`]\w+['"`]\s*\?/gi,
  /\{\s*development\s*:/gi,
  /\{\s*production\s*:/gi,
  /\{\s*test\s*:/gi,
] as const;

export const ENV_SPECIFIC_IMPORT_PATTERNS = [
  /import.*\.dev\./gi,
  /import.*\.prod\./gi,
  /import.*\.development\./gi,
  /import.*\.production\./gi,
  /require\s*\(\s*['"`].*\.dev\./gi,
  /require\s*\(\s*['"`].*\.prod\./gi,
] as const;

export const DEBUG_MODE_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.DEBUG/gi,
  /DEBUG\s*[=:]/gi,
  /isDebug/gi,
  /debugMode/gi,
  /enableDebug/gi,
  /debug\s*:\s*(?:true|false)/gi,
  /verbose\s*:\s*(?:true|false)/gi,
  // Python
  /os\.environ\.get\s*\(\s*['"]DEBUG['"]/gi,
  /os\.getenv\s*\(\s*['"]DEBUG['"]/gi,
  /is_debug/gi,
  /debug_mode/gi,
  /enable_debug/gi,
  /DEBUG\s*=\s*(?:True|False)/gi,
  /VERBOSE\s*=\s*(?:True|False)/gi,
  /logging\.DEBUG/gi,
] as const;

export const HARDCODED_ENV_PATTERNS = [
  /const\s+\w*[Ee]nv\w*\s*=\s*['"`](?:development|production|test)['"`]/gi,
  /let\s+\w*[Ee]nv\w*\s*=\s*['"`](?:development|production|test)['"`]/gi,
  /NODE_ENV\s*=\s*['"`](?:development|production|test)['"`]/gi,
] as const;

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
    /\.min\.[jt]s$/,
    /\.env$/,
    /\.env\.\w+$/,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectNodeEnvCheck(
  content: string,
  filePath: string
): EnvironmentDetectionPatternInfo[] {
  const results: EnvironmentDetectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of NODE_ENV_CHECK_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'node-env-check',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectIsDevelopment(
  content: string,
  filePath: string
): EnvironmentDetectionPatternInfo[] {
  const results: EnvironmentDetectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of IS_DEVELOPMENT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'is-development',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          environment: 'development',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectIsProduction(
  content: string,
  filePath: string
): EnvironmentDetectionPatternInfo[] {
  const results: EnvironmentDetectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of IS_PRODUCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'is-production',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          environment: 'production',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectIsTest(
  content: string,
  filePath: string
): EnvironmentDetectionPatternInfo[] {
  const results: EnvironmentDetectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of IS_TEST_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'is-test',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          environment: 'test',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectEnvBranching(
  content: string,
  filePath: string
): EnvironmentDetectionPatternInfo[] {
  const results: EnvironmentDetectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ENV_BRANCHING_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'env-branching',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectEnvSpecificImport(
  content: string,
  filePath: string
): EnvironmentDetectionPatternInfo[] {
  const results: EnvironmentDetectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ENV_SPECIFIC_IMPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        let environment = 'unknown';
        if (/\.dev\.|\.development\./i.test(match[0])) {environment = 'development';}
        else if (/\.prod\.|\.production\./i.test(match[0])) {environment = 'production';}

        results.push({
          type: 'env-specific-import',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          environment,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectDebugMode(
  content: string,
  filePath: string
): EnvironmentDetectionPatternInfo[] {
  const results: EnvironmentDetectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DEBUG_MODE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'debug-mode',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectHardcodedEnvViolations(
  content: string,
  filePath: string
): EnvironmentDetectionViolationInfo[] {
  const results: EnvironmentDetectionViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments
    if (/^\s*\/\/|^\s*\/\*/.test(line)) {continue;}

    for (const pattern of HARDCODED_ENV_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'hardcoded-env',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Hardcoded environment value - should use process.env.NODE_ENV',
          suggestedFix: 'Use process.env.NODE_ENV instead of hardcoded value',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeEnvironmentDetection(
  content: string,
  filePath: string
): EnvironmentDetectionAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasEnvChecks: false,
      environments: [],
      confidence: 1.0,
    };
  }

  const patterns: EnvironmentDetectionPatternInfo[] = [
    ...detectNodeEnvCheck(content, filePath),
    ...detectIsDevelopment(content, filePath),
    ...detectIsProduction(content, filePath),
    ...detectIsTest(content, filePath),
    ...detectEnvBranching(content, filePath),
    ...detectEnvSpecificImport(content, filePath),
    ...detectDebugMode(content, filePath),
  ];

  const violations = detectHardcodedEnvViolations(content, filePath);

  const hasEnvChecks = patterns.length > 0;
  const environments = [...new Set(patterns.filter((p) => p.environment).map((p) => p.environment!))];

  let confidence = 0.7;
  if (hasEnvChecks) {confidence += 0.15;}
  if (environments.length > 1) {confidence += 0.1;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    hasEnvChecks,
    environments,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class EnvironmentDetectionDetector extends RegexDetector {
  readonly id = 'config/environment-detection';
  readonly name = 'Environment Detection Detector';
  readonly description =
    'Detects environment detection patterns';
  readonly category: PatternCategory = 'config';
  readonly subcategory = 'environment-detection';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeEnvironmentDetection(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations.map(v => ({
      file: v.file,
      line: v.line,
      column: v.column,
      value: v.matchedText,
      issue: v.issue,
      suggestedFix: v.suggestedFix,
      severity: v.severity === 'high' ? 'error' as const : v.severity === 'medium' ? 'warning' as const : 'info' as const,
    })));

    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasEnvChecks: analysis.hasEnvChecks,
        environments: analysis.environments,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createEnvironmentDetectionDetector(): EnvironmentDetectionDetector {
  return new EnvironmentDetectionDetector();
}
