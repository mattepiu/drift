/**
 * Default Values Detector - Configuration default value pattern detection
 *
 * Detects default value patterns including:
 * - Hardcoded defaults
 * - Environment-based defaults
 * - Computed defaults
 * - Fallback chains
 *
 * @requirements 17.3 - Default value patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type DefaultValuePatternType =
  | 'hardcoded-default'
  | 'env-default'
  | 'computed-default'
  | 'fallback-chain'
  | 'conditional-default'
  | 'factory-default';

export type DefaultValueViolationType =
  | 'magic-number'
  | 'magic-string'
  | 'inconsistent-defaults';

export interface DefaultValuePatternInfo {
  type: DefaultValuePatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  defaultValue?: string | undefined;
  context?: string | undefined;
}

export interface DefaultValueViolationInfo {
  type: DefaultValueViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface DefaultValueAnalysis {
  patterns: DefaultValuePatternInfo[];
  violations: DefaultValueViolationInfo[];
  hasHardcodedDefaults: boolean;
  hasEnvDefaults: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const HARDCODED_DEFAULT_PATTERNS = [
  // JavaScript/TypeScript
  /\?\?\s*['"`][^'"`]+['"`]/gi,
  /\|\|\s*['"`][^'"`]+['"`]/gi,
  /\?\?\s*\d+/gi,
  /\|\|\s*\d+/gi,
  /\?\?\s*(?:true|false)/gi,
  /\|\|\s*(?:true|false)/gi,
  /default\s*[=:]\s*['"`][^'"`]+['"`]/gi,
  /default\s*[=:]\s*\d+/gi,
  /defaultValue\s*[=:]\s*['"`][^'"`]+['"`]/gi,
  // Python
  /\.get\s*\(\s*['"][^'"]+['"]\s*,\s*['"][^'"]+['"]\s*\)/gi,
  /\.get\s*\(\s*['"][^'"]+['"]\s*,\s*\d+\s*\)/gi,
  /or\s+['"][^'"]+['"]/gi,
  /or\s+\d+/gi,
  /default\s*=\s*['"][^'"]+['"]/gi,
  /default\s*=\s*\d+/gi,
] as const;

export const ENV_DEFAULT_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.[A-Z_]+\s*\?\?\s*process\.env\.[A-Z_]+/gi,
  /process\.env\.[A-Z_]+\s*\|\|\s*process\.env\.[A-Z_]+/gi,
  /\.default\s*\(\s*process\.env\.[A-Z_]+\s*\)/gi,
  // Python
  /os\.environ\.get\s*\(\s*['"][A-Z_]+['"]\s*,\s*os\.environ\.get/gi,
  /os\.getenv\s*\(\s*['"][A-Z_]+['"]\s*,\s*os\.getenv/gi,
  /os\.getenv\s*\(\s*['"][A-Z_]+['"]\s*\)\s*or\s*os\.getenv/gi,
] as const;

export const COMPUTED_DEFAULT_PATTERNS = [
  // JavaScript/TypeScript
  /\?\?\s*\w+\s*\(/gi, // Function call as default
  /\|\|\s*\w+\s*\(/gi,
  /\?\?\s*new\s+\w+/gi, // Constructor as default
  /\|\|\s*new\s+\w+/gi,
  /default\s*[=:]\s*\(\s*\)\s*=>/gi, // Arrow function default
  /default\s*[=:]\s*function\s*\(/gi, // Function default
  /getDefault\w*\s*\(/gi,
  /createDefault\w*\s*\(/gi,
  // Python
  /or\s+\w+\s*\(/gi, // Function call as default
  /default\s*=\s*\w+\s*\(/gi,
  /default_factory\s*=\s*\w+/gi, // dataclass default_factory
  /get_default\w*\s*\(/gi,
  /create_default\w*\s*\(/gi,
] as const;

export const FALLBACK_CHAIN_PATTERNS = [
  /\?\?\s*[^?]+\?\?\s*[^?]+/gi, // Multiple nullish coalescing
  /\|\|\s*[^|]+\|\|\s*[^|]+/gi, // Multiple OR
  /process\.env\.[A-Z_]+\s*\?\?\s*process\.env\.[A-Z_]+\s*\?\?/gi,
] as const;

export const CONDITIONAL_DEFAULT_PATTERNS = [
  /\?\s*[^:]+\s*:\s*['"`][^'"`]+['"`]/gi, // Ternary with string default
  /\?\s*[^:]+\s*:\s*\d+/gi, // Ternary with number default
  /if\s*\([^)]+\)\s*\{[^}]*default/gi,
  /switch\s*\([^)]+\)\s*\{[^}]*default\s*:/gi,
] as const;

export const FACTORY_DEFAULT_PATTERNS = [
  // JavaScript/TypeScript
  /createConfig\s*\(/gi,
  /getConfig\s*\(/gi,
  /loadConfig\s*\(/gi,
  /configFactory\s*\(/gi,
  /defaultConfig\s*[=:]/gi,
  /DEFAULT_CONFIG\s*[=:]/gi,
  /baseConfig\s*[=:]/gi,
  // Python
  /create_config\s*\(/gi,
  /get_config\s*\(/gi,
  /load_config\s*\(/gi,
  /config_factory\s*\(/gi,
  /default_config\s*=/gi,
  /DEFAULT_CONFIG\s*=/gi,
  /base_config\s*=/gi,
  /class\s+\w*Settings\s*\(\s*BaseSettings\s*\)/gi, // Pydantic Settings
] as const;

export const MAGIC_NUMBER_PATTERNS = [
  /timeout\s*[=:]\s*\d{4,}/gi, // Large timeout numbers
  /port\s*[=:]\s*\d{4,5}/gi, // Port numbers
  /maxRetries\s*[=:]\s*\d+/gi,
  /limit\s*[=:]\s*\d+/gi,
  /size\s*[=:]\s*\d+/gi,
] as const;

export const MAGIC_STRING_PATTERNS = [
  /url\s*[=:]\s*['"`]https?:\/\/[^'"`]+['"`]/gi,
  /host\s*[=:]\s*['"`](?:localhost|127\.0\.0\.1)[^'"`]*['"`]/gi,
  /endpoint\s*[=:]\s*['"`]\/[^'"`]+['"`]/gi,
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

export function detectHardcodedDefaults(
  content: string,
  filePath: string
): DefaultValuePatternInfo[] {
  const results: DefaultValuePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of HARDCODED_DEFAULT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const valueMatch = match[0].match(/['"`]([^'"`]+)['"`]|\d+|true|false/);
        results.push({
          type: 'hardcoded-default',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          defaultValue: valueMatch ? valueMatch[1] || valueMatch[0] : undefined,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectEnvDefaults(
  content: string,
  filePath: string
): DefaultValuePatternInfo[] {
  const results: DefaultValuePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ENV_DEFAULT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'env-default',
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

export function detectComputedDefaults(
  content: string,
  filePath: string
): DefaultValuePatternInfo[] {
  const results: DefaultValuePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of COMPUTED_DEFAULT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'computed-default',
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

export function detectFallbackChains(
  content: string,
  filePath: string
): DefaultValuePatternInfo[] {
  const results: DefaultValuePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of FALLBACK_CHAIN_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'fallback-chain',
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

export function detectConditionalDefaults(
  content: string,
  filePath: string
): DefaultValuePatternInfo[] {
  const results: DefaultValuePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CONDITIONAL_DEFAULT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'conditional-default',
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

export function detectFactoryDefaults(
  content: string,
  filePath: string
): DefaultValuePatternInfo[] {
  const results: DefaultValuePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of FACTORY_DEFAULT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'factory-default',
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

export function detectMagicNumberViolations(
  content: string,
  filePath: string
): DefaultValueViolationInfo[] {
  const results: DefaultValueViolationInfo[] = [];
  const lines = content.split('\n');

  // Skip config files where magic numbers are expected
  if (/config\.[jt]s$/.test(filePath)) {return results;}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments and const declarations with descriptive names
    if (/^\s*\/\/|^\s*\/\*|const\s+[A-Z_]+\s*=/.test(line)) {continue;}

    for (const pattern of MAGIC_NUMBER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'magic-number',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Magic number in configuration - consider using named constant',
          suggestedFix: 'Extract to a named constant or config value',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function detectMagicStringViolations(
  content: string,
  filePath: string
): DefaultValueViolationInfo[] {
  const results: DefaultValueViolationInfo[] = [];
  const lines = content.split('\n');

  // Skip config files where magic strings are expected
  if (/config\.[jt]s$/.test(filePath)) {return results;}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments and const declarations
    if (/^\s*\/\/|^\s*\/\*|const\s+[A-Z_]+\s*=/.test(line)) {continue;}

    for (const pattern of MAGIC_STRING_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'magic-string',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Magic string in configuration - consider using environment variable',
          suggestedFix: 'Use environment variable or config constant',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function analyzeDefaultValues(
  content: string,
  filePath: string
): DefaultValueAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasHardcodedDefaults: false,
      hasEnvDefaults: false,
      confidence: 1.0,
    };
  }

  const patterns: DefaultValuePatternInfo[] = [
    ...detectHardcodedDefaults(content, filePath),
    ...detectEnvDefaults(content, filePath),
    ...detectComputedDefaults(content, filePath),
    ...detectFallbackChains(content, filePath),
    ...detectConditionalDefaults(content, filePath),
    ...detectFactoryDefaults(content, filePath),
  ];

  const violations: DefaultValueViolationInfo[] = [
    ...detectMagicNumberViolations(content, filePath),
    ...detectMagicStringViolations(content, filePath),
  ];

  const hasHardcodedDefaults = patterns.some((p) => p.type === 'hardcoded-default');
  const hasEnvDefaults = patterns.some((p) => p.type === 'env-default');

  let confidence = 0.7;
  if (hasHardcodedDefaults || hasEnvDefaults) {confidence += 0.15;}
  if (patterns.some((p) => p.type === 'factory-default')) {confidence += 0.1;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    hasHardcodedDefaults,
    hasEnvDefaults,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class DefaultValuesDetector extends RegexDetector {
  readonly id = 'config/default-values';
  readonly name = 'Default Values Detector';
  readonly description =
    'Detects configuration default value patterns';
  readonly category: PatternCategory = 'config';
  readonly subcategory = 'default-values';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeDefaultValues(context.content, context.file);

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
        hasHardcodedDefaults: analysis.hasHardcodedDefaults,
        hasEnvDefaults: analysis.hasEnvDefaults,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createDefaultValuesDetector(): DefaultValuesDetector {
  return new DefaultValuesDetector();
}
