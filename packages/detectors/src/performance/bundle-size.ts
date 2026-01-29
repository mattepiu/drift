/**
 * Bundle Size Detector - Bundle size optimization pattern detection
 *
 * Detects bundle size patterns including:
 * - Tree shaking imports
 * - Large library imports
 * - Side effect imports
 * - Bundle analyzer usage
 * - Code splitting hints
 *
 * @requirements 19.6 - Bundle size patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type BundleSizePatternType =
  | 'tree-shakeable-import'
  | 'namespace-import'
  | 'side-effect-import'
  | 'dynamic-import'
  | 'external-config'
  | 'bundle-analyzer'
  | 'source-map-config';

export type BundleSizeViolationType =
  | 'large-library-import'
  | 'full-lodash-import'
  | 'moment-import'
  | 'barrel-import'
  | 'unused-import';

export interface BundleSizePatternInfo {
  type: BundleSizePatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  library?: string | undefined;
  context?: string | undefined;
}

export interface BundleSizeViolationInfo {
  type: BundleSizeViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface BundleSizeAnalysis {
  patterns: BundleSizePatternInfo[];
  violations: BundleSizeViolationInfo[];
  treeShakeableCount: number;
  namespaceImportCount: number;
  dynamicImportCount: number;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const TREE_SHAKEABLE_IMPORT_PATTERNS = [
  /import\s+\{\s*\w+(?:\s*,\s*\w+)*\s*\}\s+from/g,
  /import\s+\{\s*\w+\s+as\s+\w+\s*\}\s+from/g,
] as const;

export const NAMESPACE_IMPORT_PATTERNS = [
  /import\s+\*\s+as\s+\w+\s+from/g,
] as const;

export const SIDE_EFFECT_IMPORT_PATTERNS = [
  /import\s+['"`][^'"`]+\.css['"`]/g,
  /import\s+['"`][^'"`]+\.scss['"`]/g,
  /import\s+['"`][^'"`]+\.less['"`]/g,
  /import\s+['"`]@?[^'"`]+\/styles['"`]/g,
] as const;

export const DYNAMIC_IMPORT_PATTERNS = [
  /import\s*\(\s*['"`][^'"`]+['"`]\s*\)/g,
  /await\s+import\s*\(/g,
] as const;

export const EXTERNAL_CONFIG_PATTERNS = [
  /externals\s*:/g,
  /external\s*:/g,
  /rollupOptions.*external/g,
] as const;

export const BUNDLE_ANALYZER_PATTERNS = [
  /webpack-bundle-analyzer/g,
  /rollup-plugin-visualizer/g,
  /source-map-explorer/g,
  /bundle-stats/g,
  /BundleAnalyzerPlugin/g,
] as const;

export const SOURCE_MAP_CONFIG_PATTERNS = [
  /devtool\s*:\s*['"`][^'"`]+['"`]/g,
  /sourcemap\s*:\s*(?:true|false|['"`]\w+['"`])/g,
  /sourceMap\s*:\s*(?:true|false)/g,
] as const;

export const LARGE_LIBRARY_IMPORT_PATTERNS = [
  /import\s+\w+\s+from\s+['"`]lodash['"`]/g,
  /import\s+\*\s+as\s+_\s+from\s+['"`]lodash['"`]/g,
  /import\s+_\s+from\s+['"`]lodash['"`]/g,
] as const;

export const FULL_LODASH_IMPORT_PATTERNS = [
  /import\s+_\s+from\s+['"`]lodash['"`]/g,
  /import\s+\*\s+as\s+_\s+from\s+['"`]lodash['"`]/g,
  /require\s*\(\s*['"`]lodash['"`]\s*\)/g,
] as const;

export const MOMENT_IMPORT_PATTERNS = [
  /import\s+moment\s+from\s+['"`]moment['"`]/g,
  /import\s+\*\s+as\s+moment\s+from\s+['"`]moment['"`]/g,
  /require\s*\(\s*['"`]moment['"`]\s*\)/g,
] as const;

export const BARREL_IMPORT_PATTERNS = [
  /from\s+['"`]\.\.?\/index['"`]/g,
  /from\s+['"`]\.\.?\/['"`]/g,
] as const;

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /node_modules\//,
    /\.min\.[jt]s$/,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

function detectPatterns(
  content: string,
  filePath: string,
  patterns: readonly RegExp[],
  type: BundleSizePatternType
): BundleSizePatternInfo[] {
  const results: BundleSizePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type,
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

export function detectTreeShakeableImport(content: string, filePath: string): BundleSizePatternInfo[] {
  return detectPatterns(content, filePath, TREE_SHAKEABLE_IMPORT_PATTERNS, 'tree-shakeable-import');
}

export function detectNamespaceImport(content: string, filePath: string): BundleSizePatternInfo[] {
  return detectPatterns(content, filePath, NAMESPACE_IMPORT_PATTERNS, 'namespace-import');
}

export function detectSideEffectImport(content: string, filePath: string): BundleSizePatternInfo[] {
  return detectPatterns(content, filePath, SIDE_EFFECT_IMPORT_PATTERNS, 'side-effect-import');
}

export function detectDynamicImport(content: string, filePath: string): BundleSizePatternInfo[] {
  return detectPatterns(content, filePath, DYNAMIC_IMPORT_PATTERNS, 'dynamic-import');
}

export function detectExternalConfig(content: string, filePath: string): BundleSizePatternInfo[] {
  return detectPatterns(content, filePath, EXTERNAL_CONFIG_PATTERNS, 'external-config');
}

export function detectBundleAnalyzer(content: string, filePath: string): BundleSizePatternInfo[] {
  return detectPatterns(content, filePath, BUNDLE_ANALYZER_PATTERNS, 'bundle-analyzer');
}

export function detectSourceMapConfig(content: string, filePath: string): BundleSizePatternInfo[] {
  return detectPatterns(content, filePath, SOURCE_MAP_CONFIG_PATTERNS, 'source-map-config');
}

export function detectFullLodashImportViolations(
  content: string,
  filePath: string
): BundleSizeViolationInfo[] {
  const results: BundleSizeViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of FULL_LODASH_IMPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'full-lodash-import',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Full lodash import increases bundle size significantly',
          suggestedFix: 'Use lodash-es or import specific functions: import { debounce } from "lodash"',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectMomentImportViolations(
  content: string,
  filePath: string
): BundleSizeViolationInfo[] {
  const results: BundleSizeViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of MOMENT_IMPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'moment-import',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Moment.js is large (~300KB). Consider alternatives',
          suggestedFix: 'Use date-fns, dayjs, or native Intl API',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectBarrelImportViolations(
  content: string,
  filePath: string
): BundleSizeViolationInfo[] {
  const results: BundleSizeViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of BARREL_IMPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'barrel-import',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Barrel imports may prevent tree shaking',
          suggestedFix: 'Import directly from the source file',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function analyzeBundleSize(
  content: string,
  filePath: string
): BundleSizeAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      treeShakeableCount: 0,
      namespaceImportCount: 0,
      dynamicImportCount: 0,
      confidence: 1.0,
    };
  }

  const patterns: BundleSizePatternInfo[] = [
    ...detectTreeShakeableImport(content, filePath),
    ...detectNamespaceImport(content, filePath),
    ...detectSideEffectImport(content, filePath),
    ...detectDynamicImport(content, filePath),
    ...detectExternalConfig(content, filePath),
    ...detectBundleAnalyzer(content, filePath),
    ...detectSourceMapConfig(content, filePath),
  ];

  const violations: BundleSizeViolationInfo[] = [
    ...detectFullLodashImportViolations(content, filePath),
    ...detectMomentImportViolations(content, filePath),
    ...detectBarrelImportViolations(content, filePath),
  ];

  const treeShakeableCount = patterns.filter((p) => p.type === 'tree-shakeable-import').length;
  const namespaceImportCount = patterns.filter((p) => p.type === 'namespace-import').length;
  const dynamicImportCount = patterns.filter((p) => p.type === 'dynamic-import').length;

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (violations.length === 0) {confidence += 0.1;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    treeShakeableCount,
    namespaceImportCount,
    dynamicImportCount,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class BundleSizeDetector extends RegexDetector {
  readonly id = 'performance/bundle-size';
  readonly name = 'Bundle Size Detector';
  readonly description = 'Detects bundle size optimization patterns and violations';
  readonly category: PatternCategory = 'performance';
  readonly subcategory = 'bundle-size';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeBundleSize(context.content, context.file);

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
        treeShakeableCount: analysis.treeShakeableCount,
        namespaceImportCount: analysis.namespaceImportCount,
        dynamicImportCount: analysis.dynamicImportCount,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createBundleSizeDetector(): BundleSizeDetector {
  return new BundleSizeDetector();
}
