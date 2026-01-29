/**
 * Bundle Size Detector - LEARNING VERSION
 *
 * Learns bundle optimization patterns from the user's codebase:
 * - Import patterns (tree-shakeable vs namespace)
 * - External library handling
 * - Bundle analyzer usage
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

export type ImportStyle = 'named' | 'namespace' | 'default' | 'mixed';

export interface BundleSizeConventions {
  [key: string]: unknown;
  importStyle: ImportStyle;
  usesTreeShaking: boolean;
  usesDynamicImports: boolean;
}

interface BundlePatternInfo {
  style: ImportStyle;
  library: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractBundlePatterns(content: string, file: string): BundlePatternInfo[] {
  const results: BundlePatternInfo[] = [];

  // Named imports (tree-shakeable)
  const namedPattern = /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = namedPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'named',
      library: match[2] || '',
      line,
      column,
      file,
    });
  }

  // Namespace imports (not tree-shakeable)
  const namespacePattern = /import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = namespacePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'namespace',
      library: match[1] || '',
      line,
      column,
      file,
    });
  }

  // Default imports
  const defaultPattern = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = defaultPattern.exec(content)) !== null) {
    // Skip if it's a named import
    if (content.slice(match.index).startsWith('import {')) {continue;}
    if (content.slice(match.index).startsWith('import *')) {continue;}

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'default',
      library: match[2] || '',
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Bundle Size Detector
// ============================================================================

export class BundleSizeLearningDetector extends LearningDetector<BundleSizeConventions> {
  readonly id = 'performance/bundle-size';
  readonly category = 'performance' as const;
  readonly subcategory = 'bundle-size';
  readonly name = 'Bundle Size Detector (Learning)';
  readonly description = 'Learns bundle optimization patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof BundleSizeConventions> {
    return ['importStyle', 'usesTreeShaking', 'usesDynamicImports'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof BundleSizeConventions, ValueDistribution>
  ): void {
    const patterns = extractBundlePatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('importStyle')!;
    const dynamicDist = distributions.get('usesDynamicImports')!;

    const hasDynamic = /import\s*\(/.test(context.content);
    dynamicDist.add(hasDynamic, context.file);

    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<BundleSizeConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const bundlePatterns = extractBundlePatterns(context.content, context.file);
    if (bundlePatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.importStyle?.value;

    // Check for namespace imports when project prefers named
    if (learnedStyle === 'named') {
      for (const pattern of bundlePatterns) {
        if (pattern.style === 'namespace') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'import style', 'namespace', 'named',
            `Namespace import from '${pattern.library}' - project prefers named imports for tree-shaking`
          ));
        }
      }
    }

    if (bundlePatterns.length > 0) {
      const first = bundlePatterns[0]!;
      patterns.push({
        patternId: `${this.id}/bundle`,
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

export function createBundleSizeLearningDetector(): BundleSizeLearningDetector {
  return new BundleSizeLearningDetector();
}
