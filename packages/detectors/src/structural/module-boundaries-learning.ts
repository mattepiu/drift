/**
 * Module Boundaries Detector - LEARNING VERSION
 *
 * Learns module boundary patterns from the user's codebase:
 * - Import restrictions between modules
 * - Public API patterns
 * - Internal vs external imports
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

export type ImportStyle = 'index-only' | 'deep-imports' | 'mixed';

export interface ModuleBoundariesConventions {
  [key: string]: unknown;
  importStyle: ImportStyle;
  usesPublicApi: boolean;
  allowsDeepImports: boolean;
}

interface ImportInfo {
  source: string;
  isDeepImport: boolean;
  isIndexImport: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractImports(content: string, file: string): ImportInfo[] {
  const results: ImportInfo[] = [];

  const importPattern = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importPattern.exec(content)) !== null) {
    const source = match[1] || '';
    
    // Skip external packages
    if (!source.startsWith('.') && !source.startsWith('@/')) {continue;}

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    const isDeepImport = source.split('/').length > 2;
    const isIndexImport = source.endsWith('/index') || !source.includes('/') || source.match(/\/[^/]+$/)?.[0]?.includes('.') === false;

    results.push({
      source,
      isDeepImport,
      isIndexImport,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Module Boundaries Detector
// ============================================================================

export class ModuleBoundariesLearningDetector extends LearningDetector<ModuleBoundariesConventions> {
  readonly id = 'structural/module-boundaries';
  readonly category = 'structural' as const;
  readonly subcategory = 'module-boundaries';
  readonly name = 'Module Boundaries Detector (Learning)';
  readonly description = 'Learns module boundary patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ModuleBoundariesConventions> {
    return ['importStyle', 'usesPublicApi', 'allowsDeepImports'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ModuleBoundariesConventions, ValueDistribution>
  ): void {
    const imports = extractImports(context.content, context.file);
    if (imports.length === 0) {return;}

    const styleDist = distributions.get('importStyle')!;
    const deepImportDist = distributions.get('allowsDeepImports')!;

    let hasDeep = false;
    let hasIndex = false;

    for (const imp of imports) {
      if (imp.isDeepImport) {hasDeep = true;}
      if (imp.isIndexImport) {hasIndex = true;}
      deepImportDist.add(imp.isDeepImport, context.file);
    }

    if (hasDeep && hasIndex) {
      styleDist.add('mixed', context.file);
    } else if (hasDeep) {
      styleDist.add('deep-imports', context.file);
    } else {
      styleDist.add('index-only', context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ModuleBoundariesConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const imports = extractImports(context.content, context.file);
    if (imports.length === 0) {
      return this.createEmptyResult();
    }

    const learnedAllowsDeep = conventions.conventions.allowsDeepImports?.value;

    // Check deep import consistency
    if (learnedAllowsDeep === false) {
      for (const imp of imports) {
        if (imp.isDeepImport) {
          violations.push(this.createConventionViolation(
            imp.file, imp.line, imp.column,
            'import style', 'deep import', 'index import',
            `Deep import '${imp.source}' - project prefers importing from index files`
          ));
        }
      }
    }

    if (imports.length > 0) {
      const first = imports[0]!;
      patterns.push({
        patternId: `${this.id}/import`,
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

export function createModuleBoundariesLearningDetector(): ModuleBoundariesLearningDetector {
  return new ModuleBoundariesLearningDetector();
}
