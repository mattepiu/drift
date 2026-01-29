/**
 * Class Naming Detector - LEARNING VERSION
 *
 * Learns CSS class naming conventions from the user's codebase:
 * - Naming convention (BEM, utility-first, CSS Modules, semantic, SMACSS)
 * - Whether mixed conventions are acceptable
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

export type ClassNamingConvention = 'bem' | 'utility-first' | 'css-modules' | 'semantic' | 'smacss' | 'mixed';

export interface ClassNamingConventions {
  [key: string]: unknown;
  /** Primary naming convention */
  namingConvention: ClassNamingConvention;
  /** Whether project uses BEM */
  usesBEM: boolean;
  /** Whether project uses utility-first (Tailwind) */
  usesUtilityFirst: boolean;
  /** Whether project uses CSS Modules */
  usesCSSModules: boolean;
}

interface ClassPatternInfo {
  convention: ClassNamingConvention;
  line: number;
  column: number;
  matchedText: string;
}

// ============================================================================
// Detection Patterns
// ============================================================================

// BEM pattern (block__element--modifier)
const BEM_PATTERN = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?(?:--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)\b/gi;

// Tailwind utility patterns
const UTILITY_PATTERNS = [
  /\b(?:flex|grid|block|inline|hidden|container)\b/g,
  /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml)-(?:\d+|auto|px)\b/g,
  /\b(?:w|h|min-w|min-h|max-w|max-h)-(?:\d+|full|screen|auto)\b/g,
  /\b(?:text-(?:xs|sm|base|lg|xl|2xl|3xl))\b/g,
  /\b(?:bg|text|border)-(?:slate|gray|red|blue|green)-\d{2,3}\b/g,
  /\b(?:items|justify|content)-(?:start|end|center|between)\b/g,
  /\b(?:rounded|shadow)(?:-(?:sm|md|lg|xl|none))?\b/g,
];

// CSS Modules pattern
const CSS_MODULES_PATTERNS = [
  /\bstyles\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
  /\bstyles\[['"]([a-zA-Z_][a-zA-Z0-9_-]*)['"]\]/g,
  /\bclasses\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
];

// Semantic naming patterns
const SEMANTIC_PATTERNS = [
  /\b(?:btn|button)-(?:primary|secondary|success|danger|warning)\b/gi,
  /\b(?:card|panel)-(?:header|body|footer|title)\b/gi,
  /\b(?:nav|navbar|menu)-(?:item|link|brand)\b/gi,
  /\b(?:form|input|field)-(?:group|control|label|error)\b/gi,
];

// SMACSS patterns
const SMACSS_PATTERNS = [
  /\bl-[a-z][a-z0-9-]*\b/gi,
  /\bis-[a-z][a-z0-9-]*\b/gi,
  /\bhas-[a-z][a-z0-9-]*\b/gi,
  /\bjs-[a-z][a-z0-9-]*\b/gi,
];

// ============================================================================
// Helper Functions
// ============================================================================

function getPosition(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

function detectPatternType(content: string, patterns: RegExp[], convention: ClassNamingConvention): ClassPatternInfo[] {
  const results: ClassPatternInfo[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      results.push({ convention, line, column, matchedText: match[0] });
    }
  }
  return results;
}

function extractAllPatterns(content: string): ClassPatternInfo[] {
  const results: ClassPatternInfo[] = [];

  // BEM
  const bemRegex = new RegExp(BEM_PATTERN.source, BEM_PATTERN.flags);
  let match;
  while ((match = bemRegex.exec(content)) !== null) {
    const { line, column } = getPosition(content, match.index);
    results.push({ convention: 'bem', line, column, matchedText: match[0] });
  }

  // Utility-first
  results.push(...detectPatternType(content, UTILITY_PATTERNS, 'utility-first'));

  // CSS Modules
  results.push(...detectPatternType(content, CSS_MODULES_PATTERNS, 'css-modules'));

  // Semantic
  results.push(...detectPatternType(content, SEMANTIC_PATTERNS, 'semantic'));

  // SMACSS
  results.push(...detectPatternType(content, SMACSS_PATTERNS, 'smacss'));

  return results;
}

// ============================================================================
// Learning Class Naming Detector
// ============================================================================

export class ClassNamingLearningDetector extends LearningDetector<ClassNamingConventions> {
  readonly id = 'styling/class-naming';
  readonly category = 'styling' as const;
  readonly subcategory = 'class-naming';
  readonly name = 'Class Naming Detector (Learning)';
  readonly description = 'Learns CSS class naming conventions from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'css'];

  protected getConventionKeys(): Array<keyof ClassNamingConventions> {
    return ['namingConvention', 'usesBEM', 'usesUtilityFirst', 'usesCSSModules'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ClassNamingConventions, ValueDistribution>
  ): void {
    const patterns = extractAllPatterns(context.content);
    if (patterns.length === 0) {return;}

    const conventionDist = distributions.get('namingConvention')!;
    const bemDist = distributions.get('usesBEM')!;
    const utilityDist = distributions.get('usesUtilityFirst')!;
    const modulesDist = distributions.get('usesCSSModules')!;

    let hasBEM = false;
    let hasUtility = false;
    let hasModules = false;

    for (const pattern of patterns) {
      conventionDist.add(pattern.convention, context.file);

      if (pattern.convention === 'bem') {hasBEM = true;}
      if (pattern.convention === 'utility-first') {hasUtility = true;}
      if (pattern.convention === 'css-modules') {hasModules = true;}
    }

    bemDist.add(hasBEM, context.file);
    utilityDist.add(hasUtility, context.file);
    modulesDist.add(hasModules, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ClassNamingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const classPatterns = extractAllPatterns(context.content);
    if (classPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedConvention = conventions.conventions.namingConvention?.value;

    // Only flag if there's a clear dominant convention and this file deviates
    if (learnedConvention && learnedConvention !== 'mixed') {
      // Count conventions in this file
      const conventionCounts = new Map<ClassNamingConvention, number>();
      for (const pattern of classPatterns) {
        conventionCounts.set(pattern.convention, (conventionCounts.get(pattern.convention) || 0) + 1);
      }

      // Find dominant convention in this file
      let fileDominant: ClassNamingConvention | null = null;
      let maxCount = 0;
      for (const [conv, count] of conventionCounts) {
        if (count > maxCount) {
          maxCount = count;
          fileDominant = conv;
        }
      }

      // Flag if file's dominant convention differs from project's
      if (fileDominant && fileDominant !== learnedConvention && maxCount >= 3) {
        const first = classPatterns.find(p => p.convention === fileDominant);
        if (first) {
          violations.push(this.createConventionViolation(
            context.file,
            first.line,
            first.column,
            'class naming convention',
            fileDominant,
            learnedConvention,
            `File uses ${fileDominant} naming but your project uses ${learnedConvention}.`
          ));
        }
      }
    }

    // Create pattern match
    if (classPatterns.length > 0) {
      const first = classPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/class-naming`,
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

export function createClassNamingLearningDetector(): ClassNamingLearningDetector {
  return new ClassNamingLearningDetector();
}
