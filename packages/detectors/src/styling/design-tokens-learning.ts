/**
 * Design Tokens Detector - LEARNING VERSION
 *
 * Learns design token usage patterns from the user's codebase:
 * - Token import patterns (design-tokens/, tokens/, theme/)
 * - CSS custom property naming conventions
 * - Theme object access patterns
 * - Token vs hardcoded value ratio
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
 * Token source types
 */
export type TokenSourceType =
  | 'design-tokens-import'
  | 'css-custom-property'
  | 'theme-object'
  | 'tailwind-class';

/**
 * Conventions this detector learns
 */
export interface DesignTokenConventions {
  [key: string]: unknown;
  /** Primary token source (import, css vars, theme object) */
  tokenSource: TokenSourceType;
  /** Token import path pattern */
  tokenImportPath: string | null;
  /** CSS custom property prefix (e.g., '--color-', '--spacing-') */
  cssPropertyPrefix: string | null;
  /** Theme object path pattern (e.g., 'theme.colors', 'theme.spacing') */
  themeObjectPattern: string | null;
  /** Whether project uses design tokens at all */
  usesDesignTokens: boolean;
}

/**
 * Token usage info extracted from code
 */
interface TokenUsageInfo {
  type: TokenSourceType;
  value: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract token imports from content
 */
function extractTokenImports(content: string, file: string): TokenUsageInfo[] {
  const results: TokenUsageInfo[] = [];
  const patterns = [
    /import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]*(?:design-tokens|tokens|theme)[^'"]*)['"]/g,
  ];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'design-tokens-import',
        value: match[1] || '',
        line,
        column,
        file,
      });
    }
  }

  return results;
}

/**
 * Extract CSS custom property usage from content
 */
function extractCSSCustomProperties(content: string, file: string): TokenUsageInfo[] {
  const results: TokenUsageInfo[] = [];
  const pattern = /var\(\s*--([a-zA-Z0-9_-]+)\s*(?:,\s*[^)]+)?\)/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: 'css-custom-property',
      value: match[1] || '',
      line,
      column,
      file,
    });
  }

  return results;
}

/**
 * Extract theme object usage from content
 */
function extractThemeObjectUsage(content: string, file: string): TokenUsageInfo[] {
  const results: TokenUsageInfo[] = [];
  const patterns = [
    /theme\.([a-zA-Z0-9_.[\]]+)/g,
    /\$\{theme\.([a-zA-Z0-9_.[\]]+)\}/g,
    /props\.theme\.([a-zA-Z0-9_.[\]]+)/g,
  ];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        type: 'theme-object',
        value: match[1] || '',
        line,
        column,
        file,
      });
    }
  }

  return results;
}

/**
 * Extract CSS property prefix from a property name
 */
function extractPrefix(propertyName: string): string | null {
  const match = propertyName.match(/^([a-zA-Z]+-)/);
  return match?.[1] ?? null;
}

/**
 * Extract theme object category from path
 */
function extractThemeCategory(path: string): string | null {
  const match = path.match(/^([a-zA-Z]+)/);
  return match?.[1] ?? null;
}

// ============================================================================
// Learning Design Tokens Detector
// ============================================================================

export class DesignTokensLearningDetector extends LearningDetector<DesignTokenConventions> {
  readonly id = 'styling/design-tokens';
  readonly category = 'styling' as const;
  readonly subcategory = 'design-tokens';
  readonly name = 'Design Tokens Detector (Learning)';
  readonly description = 'Learns design token patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof DesignTokenConventions> {
    return ['tokenSource', 'tokenImportPath', 'cssPropertyPrefix', 'themeObjectPattern', 'usesDesignTokens'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof DesignTokenConventions, ValueDistribution>
  ): void {
    const tokenImports = extractTokenImports(context.content, context.file);
    const cssProperties = extractCSSCustomProperties(context.content, context.file);
    const themeUsages = extractThemeObjectUsage(context.content, context.file);

    const sourceDist = distributions.get('tokenSource')!;
    const importPathDist = distributions.get('tokenImportPath')!;
    const cssPrefixDist = distributions.get('cssPropertyPrefix')!;
    const themePatternDist = distributions.get('themeObjectPattern')!;
    const usesTokensDist = distributions.get('usesDesignTokens')!;

    // Track token sources
    for (const usage of tokenImports) {
      sourceDist.add('design-tokens-import', context.file);
      importPathDist.add(usage.value, context.file);
      usesTokensDist.add(true, context.file);
    }

    for (const usage of cssProperties) {
      sourceDist.add('css-custom-property', context.file);
      const prefix = extractPrefix(usage.value);
      if (prefix) {
        cssPrefixDist.add(prefix, context.file);
      }
      usesTokensDist.add(true, context.file);
    }

    for (const usage of themeUsages) {
      sourceDist.add('theme-object', context.file);
      const category = extractThemeCategory(usage.value);
      if (category) {
        themePatternDist.add(category, context.file);
      }
      usesTokensDist.add(true, context.file);
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<DesignTokenConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const tokenImports = extractTokenImports(context.content, context.file);
    const cssProperties = extractCSSCustomProperties(context.content, context.file);
    const themeUsages = extractThemeObjectUsage(context.content, context.file);

    const allUsages = [...tokenImports, ...cssProperties, ...themeUsages];

    if (allUsages.length === 0) {
      return this.createEmptyResult();
    }

    // Get learned conventions
    const learnedSource = conventions.conventions.tokenSource?.value;
    const learnedImportPath = conventions.conventions.tokenImportPath?.value;
    const learnedCssPrefix = conventions.conventions.cssPropertyPrefix?.value;
    // Note: themeObjectPattern is learned but not currently used for violation detection

    // Check for inconsistent token sources
    if (learnedSource) {
      for (const usage of allUsages) {
        if (usage.type !== learnedSource) {
          violations.push(this.createConventionViolation(
            usage.file,
            usage.line,
            usage.column,
            'token source',
            usage.type,
            learnedSource,
            `Using ${usage.type} but project primarily uses ${learnedSource} for design tokens`
          ));
        }
      }
    }

    // Check import path consistency
    if (learnedImportPath) {
      for (const usage of tokenImports) {
        if (usage.value !== learnedImportPath && !usage.value.includes(learnedImportPath)) {
          violations.push(this.createConventionViolation(
            usage.file,
            usage.line,
            usage.column,
            'token import path',
            usage.value,
            learnedImportPath,
            `Import path '${usage.value}' differs from project convention '${learnedImportPath}'`
          ));
        }
      }
    }

    // Check CSS property prefix consistency
    if (learnedCssPrefix) {
      for (const usage of cssProperties) {
        const prefix = extractPrefix(usage.value);
        if (prefix && prefix !== learnedCssPrefix) {
          violations.push(this.createConventionViolation(
            usage.file,
            usage.line,
            usage.column,
            'CSS property prefix',
            prefix,
            learnedCssPrefix,
            `CSS property prefix '${prefix}' differs from project convention '${learnedCssPrefix}'`
          ));
        }
      }
    }

    // Create pattern matches
    if (allUsages.length > 0) {
      const firstUsage = allUsages[0];
      if (firstUsage) {
        patterns.push({
          patternId: `${this.id}/tokens`,
          location: {
            file: context.file,
            line: firstUsage.line,
            column: firstUsage.column,
          },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  // ============================================================================
  // Quick Fix
  // ============================================================================

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createDesignTokensLearningDetector(): DesignTokensLearningDetector {
  return new DesignTokensLearningDetector();
}
