/**
 * Code Splitting Detector - Code splitting pattern detection
 *
 * Detects code splitting patterns including:
 * - Dynamic imports
 * - React.lazy
 * - Next.js dynamic imports
 * - Route-based splitting
 * - Component-based splitting
 * - Vendor chunk patterns
 * - Webpack magic comments
 *
 * @requirements 19.1 - Code splitting patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type CodeSplittingPatternType =
  | 'dynamic-import'
  | 'react-lazy'
  | 'next-dynamic'
  | 'route-splitting'
  | 'component-splitting'
  | 'vendor-chunk'
  | 'webpack-magic-comment'
  | 'suspense-boundary'
  | 'loadable-component'
  | 'prefetch-hint';

export type CodeSplittingViolationType =
  | 'missing-suspense'
  | 'eager-import'
  | 'large-bundle'
  | 'missing-chunk-name';

export interface CodeSplittingPatternInfo {
  type: CodeSplittingPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  chunkName?: string | undefined;
  importPath?: string | undefined;
  context?: string | undefined;
}

export interface CodeSplittingViolationInfo {
  type: CodeSplittingViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface CodeSplittingAnalysis {
  patterns: CodeSplittingPatternInfo[];
  violations: CodeSplittingViolationInfo[];
  dynamicImportCount: number;
  lazyComponentCount: number;
  hasSuspenseBoundaries: boolean;
  usesWebpackComments: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const DYNAMIC_IMPORT_PATTERNS = [
  /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /import\s*\(\s*\/\*[^*]*\*\/\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /await\s+import\s*\(/g,
] as const;

export const REACT_LAZY_PATTERNS = [
  /React\.lazy\s*\(\s*\(\)\s*=>\s*import\s*\(/g,
  /lazy\s*\(\s*\(\)\s*=>\s*import\s*\(/g,
  /const\s+\w+\s*=\s*lazy\s*\(/g,
  /const\s+\w+\s*=\s*React\.lazy\s*\(/g,
] as const;

export const NEXT_DYNAMIC_PATTERNS = [
  /dynamic\s*\(\s*\(\)\s*=>\s*import\s*\(/g,
  /next\/dynamic/g,
  /import\s+dynamic\s+from\s+['"`]next\/dynamic['"`]/g,
  /const\s+\w+\s*=\s*dynamic\s*\(/g,
] as const;

export const ROUTE_SPLITTING_PATTERNS = [
  /Route\s+.*component\s*=\s*\{.*lazy/gi,
  /element\s*=\s*\{.*lazy/gi,
  /loadComponent\s*:\s*\(\)\s*=>\s*import/g,
  /component\s*:\s*\(\)\s*=>\s*import/g,
] as const;

export const COMPONENT_SPLITTING_PATTERNS = [
  /const\s+(\w+)\s*=\s*(?:React\.)?lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /const\s+(\w+)\s*=\s*dynamic\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"`]([^'"`]+)['"`]/g,
] as const;

export const VENDOR_CHUNK_PATTERNS = [
  /webpackChunkName:\s*['"`]vendor['"`]/g,
  /webpackChunkName:\s*['"`]vendors['"`]/g,
  /splitChunks/g,
  /cacheGroups/g,
] as const;

export const WEBPACK_MAGIC_COMMENT_PATTERNS = [
  /\/\*\s*webpackChunkName:\s*['"`]([^'"`]+)['"`]\s*\*\//g,
  /\/\*\s*webpackPrefetch:\s*true\s*\*\//g,
  /\/\*\s*webpackPreload:\s*true\s*\*\//g,
  /\/\*\s*webpackMode:\s*['"`](\w+)['"`]\s*\*\//g,
] as const;

export const SUSPENSE_BOUNDARY_PATTERNS = [
  /<Suspense\s+/g,
  /<React\.Suspense\s+/g,
  /fallback\s*=\s*\{/g,
] as const;

export const LOADABLE_COMPONENT_PATTERNS = [
  /loadable\s*\(\s*\(\)\s*=>\s*import/g,
  /@loadable\/component/g,
  /import\s+loadable\s+from/g,
] as const;

export const PREFETCH_HINT_PATTERNS = [
  /webpackPrefetch:\s*true/g,
  /webpackPreload:\s*true/g,
  /rel\s*=\s*['"`]prefetch['"`]/g,
  /rel\s*=\s*['"`]preload['"`]/g,
] as const;

export const MISSING_SUSPENSE_PATTERNS = [
  /(?:React\.)?lazy\s*\(/g,
] as const;

export const EAGER_IMPORT_PATTERNS = [
  /import\s+\w+\s+from\s+['"`](?:lodash|moment|@mui|antd)['"`]/g,
  /import\s+\{[^}]+\}\s+from\s+['"`](?:lodash|moment)['"`]/g,
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
    /\.config\.[jt]s$/,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectDynamicImports(
  content: string,
  filePath: string
): CodeSplittingPatternInfo[] {
  const results: CodeSplittingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DYNAMIC_IMPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'dynamic-import',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          importPath: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectReactLazy(
  content: string,
  filePath: string
): CodeSplittingPatternInfo[] {
  const results: CodeSplittingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REACT_LAZY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'react-lazy',
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

export function detectNextDynamic(
  content: string,
  filePath: string
): CodeSplittingPatternInfo[] {
  const results: CodeSplittingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of NEXT_DYNAMIC_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'next-dynamic',
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

export function detectRouteSplitting(
  content: string,
  filePath: string
): CodeSplittingPatternInfo[] {
  const results: CodeSplittingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ROUTE_SPLITTING_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'route-splitting',
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

export function detectComponentSplitting(
  content: string,
  filePath: string
): CodeSplittingPatternInfo[] {
  const results: CodeSplittingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of COMPONENT_SPLITTING_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'component-splitting',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          chunkName: match[1],
          importPath: match[2],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectVendorChunk(
  content: string,
  filePath: string
): CodeSplittingPatternInfo[] {
  const results: CodeSplittingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of VENDOR_CHUNK_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'vendor-chunk',
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

export function detectWebpackMagicComment(
  content: string,
  filePath: string
): CodeSplittingPatternInfo[] {
  const results: CodeSplittingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of WEBPACK_MAGIC_COMMENT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'webpack-magic-comment',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          chunkName: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectSuspenseBoundary(
  content: string,
  filePath: string
): CodeSplittingPatternInfo[] {
  const results: CodeSplittingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SUSPENSE_BOUNDARY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'suspense-boundary',
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

export function detectLoadableComponent(
  content: string,
  filePath: string
): CodeSplittingPatternInfo[] {
  const results: CodeSplittingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of LOADABLE_COMPONENT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'loadable-component',
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

export function detectPrefetchHint(
  content: string,
  filePath: string
): CodeSplittingPatternInfo[] {
  const results: CodeSplittingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of PREFETCH_HINT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'prefetch-hint',
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

export function detectMissingSuspenseViolations(
  content: string,
  filePath: string
): CodeSplittingViolationInfo[] {
  const results: CodeSplittingViolationInfo[] = [];
  
  const hasLazy = MISSING_SUSPENSE_PATTERNS.some((p) =>
    new RegExp(p.source, p.flags).test(content)
  );
  const hasSuspense = SUSPENSE_BOUNDARY_PATTERNS.some((p) =>
    new RegExp(p.source, p.flags).test(content)
  );

  if (hasLazy && !hasSuspense) {
    results.push({
      type: 'missing-suspense',
      file: filePath,
      line: 1,
      column: 1,
      matchedText: 'lazy component',
      issue: 'Lazy component without Suspense boundary',
      suggestedFix: 'Wrap lazy components with <Suspense fallback={...}>',
      severity: 'high',
    });
  }

  return results;
}

export function detectEagerImportViolations(
  content: string,
  filePath: string
): CodeSplittingViolationInfo[] {
  const results: CodeSplittingViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of EAGER_IMPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'eager-import',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Large library imported eagerly',
          suggestedFix: 'Consider dynamic import or tree-shaking',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeCodeSplitting(
  content: string,
  filePath: string
): CodeSplittingAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      dynamicImportCount: 0,
      lazyComponentCount: 0,
      hasSuspenseBoundaries: false,
      usesWebpackComments: false,
      confidence: 1.0,
    };
  }

  const patterns: CodeSplittingPatternInfo[] = [
    ...detectDynamicImports(content, filePath),
    ...detectReactLazy(content, filePath),
    ...detectNextDynamic(content, filePath),
    ...detectRouteSplitting(content, filePath),
    ...detectComponentSplitting(content, filePath),
    ...detectVendorChunk(content, filePath),
    ...detectWebpackMagicComment(content, filePath),
    ...detectSuspenseBoundary(content, filePath),
    ...detectLoadableComponent(content, filePath),
    ...detectPrefetchHint(content, filePath),
  ];

  const violations: CodeSplittingViolationInfo[] = [
    ...detectMissingSuspenseViolations(content, filePath),
    ...detectEagerImportViolations(content, filePath),
  ];

  const dynamicImportCount = patterns.filter((p) => p.type === 'dynamic-import').length;
  const lazyComponentCount = patterns.filter(
    (p) => p.type === 'react-lazy' || p.type === 'next-dynamic' || p.type === 'loadable-component'
  ).length;
  const hasSuspenseBoundaries = patterns.some((p) => p.type === 'suspense-boundary');
  const usesWebpackComments = patterns.some((p) => p.type === 'webpack-magic-comment');

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (hasSuspenseBoundaries) {confidence += 0.05;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    dynamicImportCount,
    lazyComponentCount,
    hasSuspenseBoundaries,
    usesWebpackComments,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class CodeSplittingDetector extends RegexDetector {
  readonly id = 'performance/code-splitting';
  readonly name = 'Code Splitting Detector';
  readonly description =
    'Detects code splitting patterns including dynamic imports and lazy loading';
  readonly category: PatternCategory = 'performance';
  readonly subcategory = 'code-splitting';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeCodeSplitting(context.content, context.file);

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
        dynamicImportCount: analysis.dynamicImportCount,
        lazyComponentCount: analysis.lazyComponentCount,
        hasSuspenseBoundaries: analysis.hasSuspenseBoundaries,
        usesWebpackComments: analysis.usesWebpackComments,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createCodeSplittingDetector(): CodeSplittingDetector {
  return new CodeSplittingDetector();
}
