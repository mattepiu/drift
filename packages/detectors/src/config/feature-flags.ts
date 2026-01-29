/**
 * Feature Flags Detector - Feature flag pattern detection
 *
 * Detects feature flag patterns including:
 * - Boolean feature flags
 * - Feature flag services
 * - Conditional rendering
 * - A/B testing patterns
 *
 * @requirements 17.4 - Feature flag patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type FeatureFlagPatternType =
  | 'boolean-flag'
  | 'env-flag'
  | 'flag-service'
  | 'conditional-render'
  | 'ab-test'
  | 'rollout-percentage';

export type FeatureFlagViolationType =
  | 'hardcoded-flag'
  | 'stale-flag'
  | 'missing-default';

export interface FeatureFlagPatternInfo {
  type: FeatureFlagPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  flagName?: string | undefined;
  service?: string | undefined;
  context?: string | undefined;
}

export interface FeatureFlagViolationInfo {
  type: FeatureFlagViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface FeatureFlagAnalysis {
  patterns: FeatureFlagPatternInfo[];
  violations: FeatureFlagViolationInfo[];
  hasFeatureFlags: boolean;
  usesService: boolean;
  flagNames: string[];
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const BOOLEAN_FLAG_PATTERNS = [
  // JavaScript/TypeScript
  /isFeatureEnabled\s*\(/gi,
  /featureEnabled\s*\(/gi,
  /isEnabled\s*\(/gi,
  /hasFeature\s*\(/gi,
  /checkFeature\s*\(/gi,
  /getFeatureFlag\s*\(/gi,
  /useFeatureFlag\s*\(/gi,
  /useFeature\s*\(/gi,
  // Python
  /is_feature_enabled\s*\(/gi,
  /feature_enabled\s*\(/gi,
  /is_enabled\s*\(/gi,
  /has_feature\s*\(/gi,
  /check_feature\s*\(/gi,
  /get_feature_flag\s*\(/gi,
] as const;

export const ENV_FLAG_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.FEATURE_[A-Z0-9_]+/gi,
  /process\.env\.FF_[A-Z0-9_]+/gi,
  /process\.env\.ENABLE_[A-Z0-9_]+/gi,
  /process\.env\.DISABLE_[A-Z0-9_]+/gi,
  /import\.meta\.env\.VITE_FEATURE_[A-Z0-9_]+/gi,
  /import\.meta\.env\.VITE_FF_[A-Z0-9_]+/gi,
  // Python
  /os\.environ\[['"]FEATURE_[A-Z0-9_]+['"]\]/gi,
  /os\.environ\[['"]ENABLE_[A-Z0-9_]+['"]\]/gi,
  /os\.getenv\s*\(\s*['"]FEATURE_[A-Z0-9_]+['"]/gi,
  /os\.getenv\s*\(\s*['"]ENABLE_[A-Z0-9_]+['"]/gi,
] as const;

export const FLAG_SERVICE_PATTERNS = [
  // JavaScript/TypeScript
  /LaunchDarkly/gi,
  /launchDarkly/gi,
  /ldClient/gi,
  /LD_SDK_KEY/gi,
  /Unleash/gi,
  /unleash/gi,
  /ConfigCat/gi,
  /configCat/gi,
  /Split/gi,
  /splitio/gi,
  /Flagsmith/gi,
  /flagsmith/gi,
  /GrowthBook/gi,
  /growthbook/gi,
  /PostHog/gi,
  /posthog/gi,
  /Statsig/gi,
  /statsig/gi,
  // Python
  /ldclient/gi,
  /launch_darkly/gi,
  /feature_flags/gi,
  /FeatureFlags/gi,
] as const;

export const CONDITIONAL_RENDER_PATTERNS = [
  /\{[^}]*isFeature[^}]*&&[^}]*\}/gi,
  /\{[^}]*featureEnabled[^}]*\?[^}]*\}/gi,
  /if\s*\(\s*isFeature/gi,
  /if\s*\(\s*featureEnabled/gi,
  /if\s*\(\s*hasFeature/gi,
  /\?\s*<[A-Z]\w+/gi, // Conditional JSX
] as const;

export const AB_TEST_PATTERNS = [
  /abTest/gi,
  /ABTest/gi,
  /experiment/gi,
  /Experiment/gi,
  /variant/gi,
  /Variant/gi,
  /useExperiment\s*\(/gi,
  /getVariant\s*\(/gi,
  /trackExperiment\s*\(/gi,
] as const;

export const ROLLOUT_PERCENTAGE_PATTERNS = [
  /rollout/gi,
  /percentage/gi,
  /canary/gi,
  /gradualRollout/gi,
  /featureRollout/gi,
  /rolloutPercentage/gi,
] as const;

export const HARDCODED_FLAG_PATTERNS = [
  // JavaScript/TypeScript
  /const\s+\w*[Ff]eature\w*\s*=\s*(?:true|false)/gi,
  /let\s+\w*[Ff]eature\w*\s*=\s*(?:true|false)/gi,
  /const\s+\w*[Ff]lag\w*\s*=\s*(?:true|false)/gi,
  /const\s+ENABLE_\w+\s*=\s*(?:true|false)/gi,
  // Python
  /\w*[Ff]eature\w*\s*=\s*(?:True|False)/gi,
  /\w*[Ff]lag\w*\s*=\s*(?:True|False)/gi,
  /ENABLE_\w+\s*=\s*(?:True|False)/gi,
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
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectBooleanFlags(
  content: string,
  filePath: string
): FeatureFlagPatternInfo[] {
  const results: FeatureFlagPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of BOOLEAN_FLAG_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        // Try to extract flag name from arguments
        const argMatch = line.slice(match.index).match(/\(\s*['"`]([^'"`]+)['"`]/);
        results.push({
          type: 'boolean-flag',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          flagName: argMatch ? argMatch[1] : undefined,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectEnvFlags(
  content: string,
  filePath: string
): FeatureFlagPatternInfo[] {
  const results: FeatureFlagPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ENV_FLAG_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const flagMatch = match[0].match(/(?:FEATURE_|FF_|ENABLE_|DISABLE_|VITE_FEATURE_|VITE_FF_)([A-Z0-9_]+)/i);
        results.push({
          type: 'env-flag',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          flagName: flagMatch ? flagMatch[0] : undefined,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectFlagService(
  content: string,
  filePath: string
): FeatureFlagPatternInfo[] {
  const results: FeatureFlagPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of FLAG_SERVICE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        let service = 'unknown';
        const matchLower = match[0].toLowerCase();
        if (/launchdarkly|ldclient|ld_sdk/i.test(matchLower)) {service = 'launchdarkly';}
        else if (/unleash/i.test(matchLower)) {service = 'unleash';}
        else if (/configcat/i.test(matchLower)) {service = 'configcat';}
        else if (/split/i.test(matchLower)) {service = 'split';}
        else if (/flagsmith/i.test(matchLower)) {service = 'flagsmith';}
        else if (/growthbook/i.test(matchLower)) {service = 'growthbook';}
        else if (/posthog/i.test(matchLower)) {service = 'posthog';}
        else if (/statsig/i.test(matchLower)) {service = 'statsig';}

        results.push({
          type: 'flag-service',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          service,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectConditionalRender(
  content: string,
  filePath: string
): FeatureFlagPatternInfo[] {
  const results: FeatureFlagPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CONDITIONAL_RENDER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'conditional-render',
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

export function detectABTest(
  content: string,
  filePath: string
): FeatureFlagPatternInfo[] {
  const results: FeatureFlagPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of AB_TEST_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'ab-test',
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

export function detectRolloutPercentage(
  content: string,
  filePath: string
): FeatureFlagPatternInfo[] {
  const results: FeatureFlagPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ROLLOUT_PERCENTAGE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'rollout-percentage',
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

export function detectHardcodedFlagViolations(
  content: string,
  filePath: string
): FeatureFlagViolationInfo[] {
  const results: FeatureFlagViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments
    if (/^\s*\/\/|^\s*\/\*/.test(line)) {continue;}

    for (const pattern of HARDCODED_FLAG_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'hardcoded-flag',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Hardcoded feature flag - should use environment variable or flag service',
          suggestedFix: 'Use process.env.FEATURE_* or a feature flag service',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeFeatureFlags(
  content: string,
  filePath: string
): FeatureFlagAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasFeatureFlags: false,
      usesService: false,
      flagNames: [],
      confidence: 1.0,
    };
  }

  const patterns: FeatureFlagPatternInfo[] = [
    ...detectBooleanFlags(content, filePath),
    ...detectEnvFlags(content, filePath),
    ...detectFlagService(content, filePath),
    ...detectConditionalRender(content, filePath),
    ...detectABTest(content, filePath),
    ...detectRolloutPercentage(content, filePath),
  ];

  const violations = detectHardcodedFlagViolations(content, filePath);

  const hasFeatureFlags = patterns.length > 0;
  const usesService = patterns.some((p) => p.type === 'flag-service');
  const flagNames = [...new Set(patterns.filter((p) => p.flagName).map((p) => p.flagName!))];

  let confidence = 0.7;
  if (hasFeatureFlags) {confidence += 0.15;}
  if (usesService) {confidence += 0.1;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    hasFeatureFlags,
    usesService,
    flagNames,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class FeatureFlagsDetector extends RegexDetector {
  readonly id = 'config/feature-flags';
  readonly name = 'Feature Flags Detector';
  readonly description =
    'Detects feature flag patterns and identifies hardcoded flags';
  readonly category: PatternCategory = 'config';
  readonly subcategory = 'feature-flags';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeFeatureFlags(context.content, context.file);

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
        hasFeatureFlags: analysis.hasFeatureFlags,
        usesService: analysis.usesService,
        flagNames: analysis.flagNames,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createFeatureFlagsDetector(): FeatureFlagsDetector {
  return new FeatureFlagsDetector();
}
