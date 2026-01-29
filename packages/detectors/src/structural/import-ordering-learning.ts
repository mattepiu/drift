/**
 * Import Ordering Detector - LEARNING VERSION
 *
 * Learns import ordering patterns from the user's codebase:
 * - Import grouping conventions
 * - Import ordering within groups
 * - Blank line patterns between groups
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
 * Import type categories
 */
export type ImportType = 'builtin' | 'external' | 'internal' | 'relative' | 'type';

/**
 * Conventions this detector learns
 */
export interface ImportOrderingConventions {
  [key: string]: unknown;
  /** Import group order */
  groupOrder: ImportType[];
  /** Whether blank lines separate groups */
  usesBlankLines: boolean;
  /** Whether type imports are separate */
  separatesTypeImports: boolean;
}

/**
 * Import pattern info
 */
interface ImportPatternInfo {
  type: ImportType;
  source: string;
  isTypeOnly: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Categorize import source
 */
function categorizeImport(source: string, isTypeOnly: boolean): ImportType {
  if (isTypeOnly) {return 'type';}
  if (source.startsWith('.')) {return 'relative';}
  if (source.startsWith('@/') || source.startsWith('~/')) {return 'internal';}
  if (/^(node:|fs|path|http|https|crypto|util|os|stream|events|buffer|child_process)/.test(source)) {return 'builtin';}
  return 'external';
}

/**
 * Extract import patterns from content
 */
function extractImportPatterns(content: string, file: string): ImportPatternInfo[] {
  const results: ImportPatternInfo[] = [];

  // ES6 imports
  const importPattern = /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))?\s*from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importPattern.exec(content)) !== null) {
    const source = match[1] || '';
    const isTypeOnly = /import\s+type\s+/.test(match[0]);

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: categorizeImport(source, isTypeOnly),
      source,
      isTypeOnly,
      line,
      column,
      file,
    });
  }

  // CommonJS requires
  const requirePattern = /(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requirePattern.exec(content)) !== null) {
    const source = match[1] || '';

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      type: categorizeImport(source, false),
      source,
      isTypeOnly: false,
      line,
      column,
      file,
    });
  }

  return results;
}

/**
 * Detect group order from imports
 */
function detectGroupOrder(imports: ImportPatternInfo[]): ImportType[] {
  const seen = new Set<ImportType>();
  const order: ImportType[] = [];

  for (const imp of imports) {
    if (!seen.has(imp.type)) {
      seen.add(imp.type);
      order.push(imp.type);
    }
  }

  return order;
}

// ============================================================================
// Learning Import Ordering Detector
// ============================================================================

export class ImportOrderingLearningDetector extends LearningDetector<ImportOrderingConventions> {
  readonly id = 'structural/import-ordering';
  readonly category = 'structural' as const;
  readonly subcategory = 'import-ordering';
  readonly name = 'Import Ordering Detector (Learning)';
  readonly description = 'Learns import ordering patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ImportOrderingConventions> {
    return ['groupOrder', 'usesBlankLines', 'separatesTypeImports'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ImportOrderingConventions, ValueDistribution>
  ): void {
    const imports = extractImportPatterns(context.content, context.file);
    if (imports.length < 2) {return;}

    const groupOrderDist = distributions.get('groupOrder')!;
    const blankLinesDist = distributions.get('usesBlankLines')!;
    const typeImportsDist = distributions.get('separatesTypeImports')!;

    // Track group order
    const order = detectGroupOrder(imports);
    if (order.length > 1) {
      groupOrderDist.add(order.join(','), context.file);
    }

    // Check for blank lines between imports
    const lines = context.content.split('\n');
    let hasBlankBetweenImports = false;
    for (let i = 0; i < imports.length - 1; i++) {
      const current = imports[i]!;
      const next = imports[i + 1]!;
      if (next.line - current.line > 1) {
        const betweenLines = lines.slice(current.line, next.line - 1);
        if (betweenLines.some(l => l.trim() === '')) {
          hasBlankBetweenImports = true;
          break;
        }
      }
    }
    blankLinesDist.add(hasBlankBetweenImports, context.file);

    // Check for separate type imports
    const hasTypeImports = imports.some(i => i.isTypeOnly);
    typeImportsDist.add(hasTypeImports, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ImportOrderingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const imports = extractImportPatterns(context.content, context.file);
    if (imports.length < 2) {
      return this.createEmptyResult();
    }

    const learnedSeparatesTypes = conventions.conventions.separatesTypeImports?.value;

    // Check type import separation
    if (learnedSeparatesTypes === true) {
      const typeImports = imports.filter(i => i.isTypeOnly);
      const regularImports = imports.filter(i => !i.isTypeOnly);

      if (typeImports.length > 0 && regularImports.length > 0) {
        // Check if type imports are grouped together
        const typeLines = typeImports.map(i => i.line);
        const regularLines = regularImports.map(i => i.line);
        const maxTypeLine = Math.max(...typeLines);
        const minRegularLine = Math.min(...regularLines);

        // If type imports are mixed with regular imports
        if (maxTypeLine > minRegularLine && Math.min(...typeLines) < Math.max(...regularLines)) {
          const firstMixed = typeImports.find(t => regularLines.some(r => Math.abs(t.line - r) === 1));
          if (firstMixed) {
            violations.push(this.createConventionViolation(
              firstMixed.file,
              firstMixed.line,
              firstMixed.column,
              'type import grouping',
              'mixed with regular imports',
              'grouped separately',
              `Type imports should be grouped separately from regular imports`
            ));
          }
        }
      }
    }

    if (imports.length > 0) {
      const firstImport = imports[0];
      if (firstImport) {
        patterns.push({
          patternId: `${this.id}/import-ordering`,
          location: { file: context.file, line: firstImport.line, column: firstImport.column },
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

export function createImportOrderingLearningDetector(): ImportOrderingLearningDetector {
  return new ImportOrderingLearningDetector();
}
