/**
 * Env Naming Detector - Environment variable naming pattern detection
 *
 * Detects environment variable naming patterns including:
 * - SCREAMING_SNAKE_CASE convention
 * - Prefix patterns (APP_, DB_, API_)
 * - Naming consistency
 * - Reserved name violations
 *
 * @requirements 17.1 - Environment variable naming patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type EnvNamingPatternType =
  | 'screaming-snake-case'
  | 'prefixed-env'
  | 'app-prefix'
  | 'db-prefix'
  | 'api-prefix'
  | 'feature-prefix'
  | 'secret-prefix';

export type EnvNamingViolationType =
  | 'invalid-case'
  | 'missing-prefix'
  | 'reserved-name'
  | 'inconsistent-naming';

export interface EnvNamingPatternInfo {
  type: EnvNamingPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  envName: string;
  prefix?: string | undefined;
  context?: string | undefined;
}

export interface EnvNamingViolationInfo {
  type: EnvNamingViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface EnvNamingAnalysis {
  patterns: EnvNamingPatternInfo[];
  violations: EnvNamingViolationInfo[];
  usesScreamingSnakeCase: boolean;
  prefixes: string[];
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const SCREAMING_SNAKE_CASE_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[['"`]([A-Z][A-Z0-9_]*)['"`]\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
  /Deno\.env\.get\s*\(\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\)/g,
  // Python
  /os\.environ\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
  /os\.environ\.get\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
  /os\.getenv\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
] as const;

export const APP_PREFIX_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.(APP_[A-Z0-9_]*)/g,
  /process\.env\[['"`](APP_[A-Z0-9_]*)['"`]\]/g,
  /import\.meta\.env\.(VITE_[A-Z0-9_]*)/g,
  /import\.meta\.env\.(NEXT_PUBLIC_[A-Z0-9_]*)/g,
  // Python
  /os\.environ\[['"](APP_[A-Z0-9_]*)['"]\]/g,
  /os\.environ\.get\s*\(\s*['"](APP_[A-Z0-9_]*)['"]/g,
  /os\.getenv\s*\(\s*['"](APP_[A-Z0-9_]*)['"]/g,
] as const;

export const DB_PREFIX_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.(DB_[A-Z0-9_]*)/g,
  /process\.env\.(DATABASE_[A-Z0-9_]*)/g,
  /process\.env\.(POSTGRES_[A-Z0-9_]*)/g,
  /process\.env\.(MYSQL_[A-Z0-9_]*)/g,
  /process\.env\.(MONGO_[A-Z0-9_]*)/g,
  /process\.env\.(REDIS_[A-Z0-9_]*)/g,
  // Python
  /os\.environ\[['"](DB_[A-Z0-9_]*)['"]\]/g,
  /os\.environ\[['"](DATABASE_[A-Z0-9_]*)['"]\]/g,
  /os\.environ\[['"](SUPABASE_[A-Z0-9_]*)['"]\]/g,
  /os\.getenv\s*\(\s*['"](DB_[A-Z0-9_]*)['"]/g,
  /os\.getenv\s*\(\s*['"](DATABASE_[A-Z0-9_]*)['"]/g,
] as const;

export const API_PREFIX_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.(API_[A-Z0-9_]*)/g,
  /process\.env\.(API_KEY[A-Z0-9_]*)/g,
  /process\.env\.(API_URL[A-Z0-9_]*)/g,
  /process\.env\.(API_SECRET[A-Z0-9_]*)/g,
  // Python
  /os\.environ\[['"](API_[A-Z0-9_]*)['"]\]/g,
  /os\.getenv\s*\(\s*['"](API_[A-Z0-9_]*)['"]/g,
  /os\.getenv\s*\(\s*['"](OPENAI_[A-Z0-9_]*)['"]/g,
  /os\.getenv\s*\(\s*['"](ANTHROPIC_[A-Z0-9_]*)['"]/g,
] as const;

export const FEATURE_PREFIX_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.(FEATURE_[A-Z0-9_]*)/g,
  /process\.env\.(FF_[A-Z0-9_]*)/g,
  /process\.env\.(ENABLE_[A-Z0-9_]*)/g,
  /process\.env\.(DISABLE_[A-Z0-9_]*)/g,
  // Python
  /os\.environ\[['"](FEATURE_[A-Z0-9_]*)['"]\]/g,
  /os\.getenv\s*\(\s*['"](FEATURE_[A-Z0-9_]*)['"]/g,
  /os\.getenv\s*\(\s*['"](ENABLE_[A-Z0-9_]*)['"]/g,
] as const;

export const SECRET_PREFIX_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.(SECRET_[A-Z0-9_]*)/g,
  /process\.env\.([A-Z0-9_]*_SECRET)/g,
  /process\.env\.([A-Z0-9_]*_KEY)/g,
  /process\.env\.([A-Z0-9_]*_TOKEN)/g,
  /process\.env\.([A-Z0-9_]*_PASSWORD)/g,
  // Python
  /os\.environ\[['"](SECRET_[A-Z0-9_]*)['"]\]/g,
  /os\.getenv\s*\(\s*['"]([A-Z0-9_]*_SECRET)['"]/g,
  /os\.getenv\s*\(\s*['"]([A-Z0-9_]*_KEY)['"]/g,
  /os\.getenv\s*\(\s*['"]([A-Z0-9_]*_TOKEN)['"]/g,
] as const;

export const INVALID_CASE_PATTERNS = [
  // JavaScript/TypeScript
  /process\.env\.([a-z][a-zA-Z0-9_]*)/g, // camelCase
  /process\.env\.([a-z][a-z0-9-]*)/g, // kebab-case
  /process\.env\[['"`]([a-z][a-zA-Z0-9_]*)['"`]\]/g,
  // Python
  /os\.environ\[['"]([a-z][a-zA-Z0-9_]*)['"]\]/g,
  /os\.getenv\s*\(\s*['"]([a-z][a-zA-Z0-9_]*)['"]/g,
] as const;

export const RESERVED_ENV_NAMES = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'PWD',
  'TERM',
  'LANG',
  'LC_ALL',
  'TZ',
  'HOSTNAME',
  'LOGNAME',
  'MAIL',
  'EDITOR',
  'VISUAL',
  'PAGER',
  'TMPDIR',
  'TEMP',
  'TMP',
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

export function detectScreamingSnakeCase(
  content: string,
  filePath: string
): EnvNamingPatternInfo[] {
  const results: EnvNamingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SCREAMING_SNAKE_CASE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envName = match[1] || match[0];
        results.push({
          type: 'screaming-snake-case',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectAppPrefix(
  content: string,
  filePath: string
): EnvNamingPatternInfo[] {
  const results: EnvNamingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of APP_PREFIX_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envName = match[1] || match[0];
        let prefix = 'APP_';
        if (/VITE_/.test(envName)) {prefix = 'VITE_';}
        else if (/NEXT_PUBLIC_/.test(envName)) {prefix = 'NEXT_PUBLIC_';}

        results.push({
          type: 'app-prefix',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName,
          prefix,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectDbPrefix(
  content: string,
  filePath: string
): EnvNamingPatternInfo[] {
  const results: EnvNamingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DB_PREFIX_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envName = match[1] || match[0];
        let prefix = 'DB_';
        if (/DATABASE_/.test(envName)) {prefix = 'DATABASE_';}
        else if (/POSTGRES_/.test(envName)) {prefix = 'POSTGRES_';}
        else if (/MYSQL_/.test(envName)) {prefix = 'MYSQL_';}
        else if (/MONGO_/.test(envName)) {prefix = 'MONGO_';}
        else if (/REDIS_/.test(envName)) {prefix = 'REDIS_';}

        results.push({
          type: 'db-prefix',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName,
          prefix,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectApiPrefix(
  content: string,
  filePath: string
): EnvNamingPatternInfo[] {
  const results: EnvNamingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of API_PREFIX_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envName = match[1] || match[0];
        results.push({
          type: 'api-prefix',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName,
          prefix: 'API_',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectFeaturePrefix(
  content: string,
  filePath: string
): EnvNamingPatternInfo[] {
  const results: EnvNamingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of FEATURE_PREFIX_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envName = match[1] || match[0];
        let prefix = 'FEATURE_';
        if (/FF_/.test(envName)) {prefix = 'FF_';}
        else if (/ENABLE_/.test(envName)) {prefix = 'ENABLE_';}
        else if (/DISABLE_/.test(envName)) {prefix = 'DISABLE_';}

        results.push({
          type: 'feature-prefix',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName,
          prefix,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectSecretPrefix(
  content: string,
  filePath: string
): EnvNamingPatternInfo[] {
  const results: EnvNamingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SECRET_PREFIX_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envName = match[1] || match[0];
        results.push({
          type: 'secret-prefix',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          envName,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectInvalidCaseViolations(
  content: string,
  filePath: string
): EnvNamingViolationInfo[] {
  const results: EnvNamingViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of INVALID_CASE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const envName = match[1] || match[0];
        const suggestedName = envName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
        results.push({
          type: 'invalid-case',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: `Environment variable "${envName}" should use SCREAMING_SNAKE_CASE`,
          suggestedFix: `Rename to ${suggestedName}`,
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectReservedNameViolations(
  content: string,
  filePath: string
): EnvNamingViolationInfo[] {
  const results: EnvNamingViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const reserved of RESERVED_ENV_NAMES) {
      const pattern = new RegExp(`process\\.env\\.${reserved}\\b`, 'g');
      let match;
      while ((match = pattern.exec(line)) !== null) {
        results.push({
          type: 'reserved-name',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: `"${reserved}" is a reserved system environment variable`,
          suggestedFix: `Use a prefixed name like APP_${reserved}`,
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function analyzeEnvNaming(
  content: string,
  filePath: string
): EnvNamingAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      usesScreamingSnakeCase: false,
      prefixes: [],
      confidence: 1.0,
    };
  }

  const patterns: EnvNamingPatternInfo[] = [
    ...detectScreamingSnakeCase(content, filePath),
    ...detectAppPrefix(content, filePath),
    ...detectDbPrefix(content, filePath),
    ...detectApiPrefix(content, filePath),
    ...detectFeaturePrefix(content, filePath),
    ...detectSecretPrefix(content, filePath),
  ];

  const violations: EnvNamingViolationInfo[] = [
    ...detectInvalidCaseViolations(content, filePath),
    ...detectReservedNameViolations(content, filePath),
  ];

  const usesScreamingSnakeCase = patterns.some((p) => p.type === 'screaming-snake-case');
  const prefixes = [...new Set(patterns.filter((p) => p.prefix).map((p) => p.prefix!))];

  let confidence = 0.7;
  if (usesScreamingSnakeCase) {confidence += 0.15;}
  if (prefixes.length > 0) {confidence += 0.1;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    usesScreamingSnakeCase,
    prefixes,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class EnvNamingDetector extends RegexDetector {
  readonly id = 'config/env-naming';
  readonly name = 'Env Naming Detector';
  readonly description =
    'Detects environment variable naming patterns and identifies violations';
  readonly category: PatternCategory = 'config';
  readonly subcategory = 'env-naming';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeEnvNaming(context.content, context.file);

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
        usesScreamingSnakeCase: analysis.usesScreamingSnakeCase,
        prefixes: analysis.prefixes,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createEnvNamingDetector(): EnvNamingDetector {
  return new EnvNamingDetector();
}
