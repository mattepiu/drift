/**
 * Barrel Exports Detector - LEARNING VERSION
 *
 * Learns barrel export patterns from the user's codebase:
 * - Index file conventions
 * - Re-export patterns
 * - Module organization
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

export type BarrelExportStyle = 'named' | 'star' | 'mixed';

export interface BarrelExportsConventions {
  [key: string]: unknown;
  exportStyle: BarrelExportStyle;
  usesIndexFiles: boolean;
  reExportsFromIndex: boolean;
}

interface BarrelExportInfo {
  style: BarrelExportStyle;
  isIndexFile: boolean;
  exportCount: number;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractBarrelExports(content: string, file: string): BarrelExportInfo[] {
  const results: BarrelExportInfo[] = [];
  const isIndexFile = /index\.[jt]sx?$/.test(file);

  // Star exports
  const starExportPattern = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  let hasStarExport = false;
  let hasNamedExport = false;

  while ((match = starExportPattern.exec(content)) !== null) {
    hasStarExport = true;
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'star',
      isIndexFile,
      exportCount: 1,
      line,
      column,
      file,
    });
  }

  // Named re-exports
  const namedExportPattern = /export\s+\{[^}]+\}\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = namedExportPattern.exec(content)) !== null) {
    hasNamedExport = true;
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'named',
      isIndexFile,
      exportCount: 1,
      line,
      column,
      file,
    });
  }

  // If both styles found, mark as mixed
  if (hasStarExport && hasNamedExport && results.length > 0) {
    results[0]!.style = 'mixed';
  }

  return results;
}

// ============================================================================
// Learning Barrel Exports Detector
// ============================================================================

export class BarrelExportsLearningDetector extends LearningDetector<BarrelExportsConventions> {
  readonly id = 'structural/barrel-exports';
  readonly category = 'structural' as const;
  readonly subcategory = 'barrel-exports';
  readonly name = 'Barrel Exports Detector (Learning)';
  readonly description = 'Learns barrel export patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof BarrelExportsConventions> {
    return ['exportStyle', 'usesIndexFiles', 'reExportsFromIndex'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof BarrelExportsConventions, ValueDistribution>
  ): void {
    const exports = extractBarrelExports(context.content, context.file);
    if (exports.length === 0) {return;}

    const styleDist = distributions.get('exportStyle')!;
    const indexDist = distributions.get('usesIndexFiles')!;
    const reExportDist = distributions.get('reExportsFromIndex')!;

    for (const exp of exports) {
      styleDist.add(exp.style, context.file);
      indexDist.add(exp.isIndexFile, context.file);
      if (exp.isIndexFile) {
        reExportDist.add(true, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<BarrelExportsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const exports = extractBarrelExports(context.content, context.file);
    if (exports.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.exportStyle?.value;

    // Check export style consistency
    if (learnedStyle && learnedStyle !== 'mixed') {
      for (const exp of exports) {
        if (exp.style !== learnedStyle && exp.style !== 'mixed') {
          violations.push(this.createConventionViolation(
            exp.file, exp.line, exp.column,
            'barrel export style', exp.style, learnedStyle,
            `Using ${exp.style} exports but project uses ${learnedStyle}`
          ));
        }
      }
    }

    if (exports.length > 0) {
      const first = exports[0]!;
      patterns.push({
        patternId: `${this.id}/barrel`,
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

export function createBarrelExportsLearningDetector(): BarrelExportsLearningDetector {
  return new BarrelExportsLearningDetector();
}
