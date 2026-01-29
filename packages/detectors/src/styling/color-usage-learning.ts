/**
 * Color Usage Detector - LEARNING VERSION
 *
 * Learns color usage patterns from the user's codebase:
 * - Color system (CSS variables, theme object, Tailwind, hardcoded)
 * - Whether hardcoded colors are acceptable
 * - Color token naming patterns
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

export type ColorSystem = 'css-variables' | 'theme-object' | 'tailwind' | 'hardcoded' | 'mixed';

export interface ColorConventions {
  [key: string]: unknown;
  /** Primary color system */
  colorSystem: ColorSystem;
  /** Whether CSS variables are used */
  usesCSSVariables: boolean;
  /** Whether theme object is used */
  usesThemeObject: boolean;
  /** Whether Tailwind colors are used */
  usesTailwind: boolean;
  /** Whether hardcoded colors are acceptable */
  allowsHardcoded: boolean;
}

interface ColorPatternInfo {
  system: ColorSystem;
  line: number;
  column: number;
  matchedText: string;
}

// ============================================================================
// Detection Patterns
// ============================================================================

// CSS variable colors
const CSS_VAR_PATTERN = /var\(\s*--(?:color|clr|c)[-_]?[a-zA-Z0-9_-]*\s*(?:,\s*[^)]+)?\)/g;

// Theme object colors
const THEME_COLOR_PATTERNS = [
  /theme\.colors?\.([a-zA-Z0-9_.[\]]+)/g,
  /\$\{theme\.colors?\.([a-zA-Z0-9_.[\]]+)\}/g,
  /\bcolors\.([a-zA-Z0-9_.[\]]+)/g,
];

// Tailwind color classes
const TAILWIND_COLOR_PATTERNS = [
  /\b(?:text|bg|border|ring|divide|outline|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-(?:\d{2,3}|50)\b/g,
];

// Hardcoded colors
const HARDCODED_PATTERNS = [
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
  /rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)/gi,
  /rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)/gi,
  /hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)/gi,
  /hsla\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*,\s*[\d.]+\s*\)/gi,
];

// Allowed hardcoded values
const ALLOWED_HARDCODED = new Set([
  'transparent', 'currentcolor', 'inherit', 'initial', 'unset',
  '#000', '#000000', '#fff', '#ffffff', 'black', 'white',
]);

// ============================================================================
// Helper Functions
// ============================================================================

function getPosition(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

function extractColorPatterns(content: string): ColorPatternInfo[] {
  const results: ColorPatternInfo[] = [];

  // CSS variables
  const cssVarRegex = new RegExp(CSS_VAR_PATTERN.source, CSS_VAR_PATTERN.flags);
  let match;
  while ((match = cssVarRegex.exec(content)) !== null) {
    const { line, column } = getPosition(content, match.index);
    results.push({ system: 'css-variables', line, column, matchedText: match[0] });
  }

  // Theme object
  for (const pattern of THEME_COLOR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      results.push({ system: 'theme-object', line, column, matchedText: match[0] });
    }
  }

  // Tailwind
  for (const pattern of TAILWIND_COLOR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      results.push({ system: 'tailwind', line, column, matchedText: match[0] });
    }
  }

  // Hardcoded
  for (const pattern of HARDCODED_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      if (!ALLOWED_HARDCODED.has(match[0].toLowerCase())) {
        const { line, column } = getPosition(content, match.index);
        results.push({ system: 'hardcoded', line, column, matchedText: match[0] });
      }
    }
  }

  return results;
}

// ============================================================================
// Learning Color Usage Detector
// ============================================================================

export class ColorUsageLearningDetector extends LearningDetector<ColorConventions> {
  readonly id = 'styling/color-usage';
  readonly category = 'styling' as const;
  readonly subcategory = 'color-usage';
  readonly name = 'Color Usage Detector (Learning)';
  readonly description = 'Learns color usage patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  protected getConventionKeys(): Array<keyof ColorConventions> {
    return ['colorSystem', 'usesCSSVariables', 'usesThemeObject', 'usesTailwind', 'allowsHardcoded'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ColorConventions, ValueDistribution>
  ): void {
    const patterns = extractColorPatterns(context.content);
    if (patterns.length === 0) {return;}

    const systemDist = distributions.get('colorSystem')!;
    const cssVarDist = distributions.get('usesCSSVariables')!;
    const themeDist = distributions.get('usesThemeObject')!;
    const tailwindDist = distributions.get('usesTailwind')!;
    const hardcodedDist = distributions.get('allowsHardcoded')!;

    let hasCSSVars = false;
    let hasTheme = false;
    let hasTailwind = false;
    let hasHardcoded = false;

    for (const pattern of patterns) {
      systemDist.add(pattern.system, context.file);

      if (pattern.system === 'css-variables') {hasCSSVars = true;}
      if (pattern.system === 'theme-object') {hasTheme = true;}
      if (pattern.system === 'tailwind') {hasTailwind = true;}
      if (pattern.system === 'hardcoded') {hasHardcoded = true;}
    }

    cssVarDist.add(hasCSSVars, context.file);
    themeDist.add(hasTheme, context.file);
    tailwindDist.add(hasTailwind, context.file);
    hardcodedDist.add(hasHardcoded, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ColorConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const colorPatterns = extractColorPatterns(context.content);
    if (colorPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedSystem = conventions.conventions.colorSystem?.value;
    const learnedAllowsHardcoded = conventions.conventions.allowsHardcoded?.value;

    // Flag hardcoded colors if project doesn't allow them
    if (learnedAllowsHardcoded === false) {
      const hardcodedPatterns = colorPatterns.filter(p => p.system === 'hardcoded');
      for (const pattern of hardcodedPatterns) {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'color value',
          pattern.matchedText,
          'design token',
          `Hardcoded color '${pattern.matchedText}' detected. Your project uses design tokens.`
        ));
      }
    }

    // Flag if using different color system than project
    if (learnedSystem && learnedSystem !== 'mixed' && learnedSystem !== 'hardcoded') {
      for (const pattern of colorPatterns) {
        if (pattern.system !== learnedSystem && pattern.system !== 'hardcoded') {
          violations.push(this.createConventionViolation(
            context.file,
            pattern.line,
            pattern.column,
            'color system',
            pattern.system,
            learnedSystem,
            `Using ${pattern.system} but your project uses ${learnedSystem}.`
          ));
        }
      }
    }

    // Create pattern match
    if (colorPatterns.length > 0) {
      const first = colorPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/color-usage`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createColorUsageLearningDetector(): ColorUsageLearningDetector {
  return new ColorUsageLearningDetector();
}
