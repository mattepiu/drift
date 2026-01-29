/**
 * Environment Naming Detector - LEARNING VERSION
 *
 * Learns environment variable naming patterns from the user's codebase:
 * - Naming conventions (SCREAMING_SNAKE, prefixed, etc.)
 * - Prefix patterns (APP_, NEXT_, VITE_, etc.)
 * - Required vs optional patterns
 *
 * Flags violations only when code deviates from the PROJECT'S established patterns.
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

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Conventions this detector learns
 */
export interface EnvNamingConventions {
  [key: string]: unknown;
  /** Environment variable prefix */
  prefix: string | null;
  /** Naming convention */
  naming: 'SCREAMING_SNAKE' | 'lowercase' | 'mixed';
  /** Whether env vars are accessed via process.env or import.meta.env */
  accessMethod: 'process.env' | 'import.meta.env' | 'Deno.env' | 'mixed';
}

/**
 * Env var pattern info extracted from code
 */
interface EnvVarPatternInfo {
  name: string;
  prefix: string | null;
  accessMethod: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract prefix from env var name
 */
function extractPrefix(name: string): string | null {
  const match = name.match(/^([A-Z]+_)/);
  return match?.[1] ?? null;
}

/**
 * Extract env var patterns from content
 */
function extractEnvVarPatterns(content: string, file: string): EnvVarPatternInfo[] {
  const results: EnvVarPatternInfo[] = [];

  // process.env.VAR_NAME
  const processEnvPattern = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
  let match;
  while ((match = processEnvPattern.exec(content)) !== null) {
    const name = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      name,
      prefix: extractPrefix(name),
      accessMethod: 'process.env',
      line,
      column,
      file,
    });
  }

  // import.meta.env.VAR_NAME
  const importMetaPattern = /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g;
  while ((match = importMetaPattern.exec(content)) !== null) {
    const name = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      name,
      prefix: extractPrefix(name),
      accessMethod: 'import.meta.env',
      line,
      column,
      file,
    });
  }

  // Deno.env.get("VAR_NAME")
  const denoEnvPattern = /Deno\.env\.get\s*\(\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\)/g;
  while ((match = denoEnvPattern.exec(content)) !== null) {
    const name = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      name,
      prefix: extractPrefix(name),
      accessMethod: 'Deno.env',
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Env Naming Detector
// ============================================================================

export class EnvNamingLearningDetector extends LearningDetector<EnvNamingConventions> {
  readonly id = 'config/env-naming';
  readonly category = 'config' as const;
  readonly subcategory = 'env-naming';
  readonly name = 'Environment Naming Detector (Learning)';
  readonly description = 'Learns environment variable naming patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof EnvNamingConventions> {
    return ['prefix', 'naming', 'accessMethod'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof EnvNamingConventions, ValueDistribution>
  ): void {
    const patterns = extractEnvVarPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const prefixDist = distributions.get('prefix')!;
    const accessMethodDist = distributions.get('accessMethod')!;

    for (const pattern of patterns) {
      if (pattern.prefix) {
        prefixDist.add(pattern.prefix, context.file);
      }
      accessMethodDist.add(pattern.accessMethod, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<EnvNamingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const envPatterns = extractEnvVarPatterns(context.content, context.file);
    if (envPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedPrefix = conventions.conventions.prefix?.value;
    const learnedAccessMethod = conventions.conventions.accessMethod?.value;

    // Check prefix consistency
    if (learnedPrefix) {
      for (const pattern of envPatterns) {
        if (pattern.prefix && pattern.prefix !== learnedPrefix) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'env var prefix',
            pattern.prefix,
            learnedPrefix,
            `Env var '${pattern.name}' uses prefix '${pattern.prefix}' but project uses '${learnedPrefix}'`
          ));
        }
      }
    }

    // Check access method consistency
    if (learnedAccessMethod && learnedAccessMethod !== 'mixed') {
      for (const pattern of envPatterns) {
        if (pattern.accessMethod !== learnedAccessMethod) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'env access method',
            pattern.accessMethod,
            learnedAccessMethod,
            `Using ${pattern.accessMethod} but project uses ${learnedAccessMethod}`
          ));
        }
      }
    }

    if (envPatterns.length > 0) {
      const firstPattern = envPatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/env-naming`,
          location: { file: context.file, line: firstPattern.line, column: firstPattern.column },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createEnvNamingLearningDetector(): EnvNamingLearningDetector {
  return new EnvNamingLearningDetector();
}
