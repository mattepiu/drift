/**
 * File Location Detector - Type file location pattern detection
 *
 * Detects type file organization patterns including:
 * - Centralized types directories
 * - Co-located type files
 * - Barrel exports for types
 * - Type-only modules
 * - Declaration file patterns
 *
 * @requirements 18.1 - Type file location patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type FileLocationPatternType =
  | 'centralized-types'
  | 'co-located-types'
  | 'barrel-export'
  | 'type-only-module'
  | 'declaration-file'
  | 'shared-types'
  | 'domain-types';

export type FileLocationViolationType =
  | 'scattered-types'
  | 'missing-barrel'
  | 'inconsistent-location'
  | 'orphaned-types';

export interface FileLocationPatternInfo {
  type: FileLocationPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  directory?: string | undefined;
  context?: string | undefined;
}

export interface FileLocationViolationInfo {
  type: FileLocationViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface FileLocationAnalysis {
  patterns: FileLocationPatternInfo[];
  violations: FileLocationViolationInfo[];
  hasCentralizedTypes: boolean;
  hasCoLocatedTypes: boolean;
  typeDirectories: string[];
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const CENTRALIZED_TYPES_PATTERNS = [
  /from\s+['"`][@./]*types['"`]/gi,
  /from\s+['"`][@./]*types\/index['"`]/gi,
  /from\s+['"`][@./]*types\/\w+['"`]/gi,
  /from\s+['"`]@types\/\w+['"`]/gi,
  /from\s+['"`]\.\.\/types['"`]/gi,
  /from\s+['"`]\.\.\/\.\.\/types['"`]/gi,
  /import\s+type.*from\s+['"`][@./]*types/gi,
] as const;

export const CO_LOCATED_TYPES_PATTERNS = [
  /from\s+['"`]\.\/\w+\.types['"`]/gi,
  /from\s+['"`]\.\/types['"`]/gi,
  /from\s+['"`]\.\/\w+\.d['"`]/gi,
  /import\s+type.*from\s+['"`]\.\//gi,
] as const;

export const BARREL_EXPORT_PATTERNS = [
  /export\s+\*\s+from\s+['"`]\.\/\w+['"`]/gi,
  /export\s+\{\s*type\s+\w+/gi,
  /export\s+type\s+\{/gi,
  /export\s+\*\s+as\s+\w+\s+from/gi,
  /export\s+\{[^}]*\}\s+from\s+['"`]\.\/types/gi,
] as const;

export const TYPE_ONLY_MODULE_PATTERNS = [
  /^export\s+(?:type|interface)\s+/gm,
  /^export\s+\{\s*type\s+/gm,
  /^import\s+type\s+/gm,
  /^declare\s+/gm,
  /^type\s+\w+\s*=/gm,
  /^interface\s+\w+/gm,
] as const;

export const DECLARATION_FILE_PATTERNS = [
  /\.d\.ts$/gi,
  /declare\s+module\s+['"`]/gi,
  /declare\s+namespace\s+/gi,
  /declare\s+global\s+\{/gi,
  /declare\s+const\s+/gi,
  /declare\s+function\s+/gi,
  /declare\s+class\s+/gi,
] as const;

export const SHARED_TYPES_PATTERNS = [
  /from\s+['"`][@./]*shared\/types['"`]/gi,
  /from\s+['"`][@./]*common\/types['"`]/gi,
  /from\s+['"`]@shared\/types['"`]/gi,
  /from\s+['"`]@common\/types['"`]/gi,
  /from\s+['"`][@./]*lib\/types['"`]/gi,
] as const;

export const DOMAIN_TYPES_PATTERNS = [
  /from\s+['"`][@./]*domain\/\w+\/types['"`]/gi,
  /from\s+['"`][@./]*features\/\w+\/types['"`]/gi,
  /from\s+['"`][@./]*modules\/\w+\/types['"`]/gi,
  /from\s+['"`][@./]*entities\/\w+['"`]/gi,
] as const;

export const SCATTERED_TYPES_PATTERNS = [
  /type\s+\w+\s*=.*(?:Request|Response|Props|State|Config)/gi,
  /interface\s+\w+(?:Request|Response|Props|State|Config)/gi,
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

export function isTypeFile(filePath: string): boolean {
  return /\.d\.ts$|\/types\/|\.types\.[jt]sx?$|\/types\.[jt]sx?$/.test(filePath);
}

export function detectCentralizedTypes(
  content: string,
  filePath: string
): FileLocationPatternInfo[] {
  const results: FileLocationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CENTRALIZED_TYPES_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const dirMatch = match[0].match(/['"`]([^'"`]+)['"`]/);
        results.push({
          type: 'centralized-types',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          directory: dirMatch ? dirMatch[1] : undefined,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectCoLocatedTypes(
  content: string,
  filePath: string
): FileLocationPatternInfo[] {
  const results: FileLocationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CO_LOCATED_TYPES_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'co-located-types',
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

export function detectBarrelExports(
  content: string,
  filePath: string
): FileLocationPatternInfo[] {
  const results: FileLocationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of BARREL_EXPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'barrel-export',
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

export function detectTypeOnlyModule(
  content: string,
  filePath: string
): FileLocationPatternInfo[] {
  const results: FileLocationPatternInfo[] = [];

  // Check if file is primarily type definitions
  let typeExports = 0;
  let valueExports = 0;
  const lines = content.split('\n');

  for (const line of lines) {
    if (/^export\s+(?:type|interface)\s+/.test(line)) {typeExports++;}
    if (/^export\s+(?:const|let|var|function|class)\s+/.test(line)) {valueExports++;}
  }

  if (typeExports > 0 && typeExports > valueExports * 2) {
    results.push({
      type: 'type-only-module',
      file: filePath,
      line: 1,
      column: 1,
      matchedText: 'type-only module',
      context: `${typeExports} type exports, ${valueExports} value exports`,
    });
  }

  return results;
}

export function detectDeclarationFile(
  content: string,
  filePath: string
): FileLocationPatternInfo[] {
  const results: FileLocationPatternInfo[] = [];

  if (/\.d\.ts$/.test(filePath)) {
    results.push({
      type: 'declaration-file',
      file: filePath,
      line: 1,
      column: 1,
      matchedText: filePath,
      context: 'TypeScript declaration file',
    });
    return results;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DECLARATION_FILE_PATTERNS) {
      if (pattern.source === '\\.d\\.ts$') {continue;}
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'declaration-file',
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

export function detectSharedTypes(
  content: string,
  filePath: string
): FileLocationPatternInfo[] {
  const results: FileLocationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SHARED_TYPES_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const dirMatch = match[0].match(/['"`]([^'"`]+)['"`]/);
        results.push({
          type: 'shared-types',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          directory: dirMatch ? dirMatch[1] : undefined,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectDomainTypes(
  content: string,
  filePath: string
): FileLocationPatternInfo[] {
  const results: FileLocationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DOMAIN_TYPES_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const dirMatch = match[0].match(/['"`]([^'"`]+)['"`]/);
        results.push({
          type: 'domain-types',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          directory: dirMatch ? dirMatch[1] : undefined,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectScatteredTypesViolations(
  content: string,
  filePath: string
): FileLocationViolationInfo[] {
  const results: FileLocationViolationInfo[] = [];

  // Skip if this is already a types file
  if (isTypeFile(filePath)) {return results;}

  // Skip if file has few type definitions
  const typeDefCount = (content.match(/(?:type|interface)\s+\w+/g) || []).length;
  if (typeDefCount < 3) {return results;}

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SCATTERED_TYPES_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'scattered-types',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Type definition in non-type file - consider moving to dedicated types file',
          suggestedFix: 'Move to ./types.ts or ../types/index.ts',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function detectInconsistentLocationViolations(
  content: string,
  filePath: string
): FileLocationViolationInfo[] {
  const results: FileLocationViolationInfo[] = [];

  // Check for mixed import patterns
  const hasCentralized = CENTRALIZED_TYPES_PATTERNS.some((p) =>
    new RegExp(p.source, p.flags).test(content)
  );
  const hasCoLocated = CO_LOCATED_TYPES_PATTERNS.some((p) =>
    new RegExp(p.source, p.flags).test(content)
  );

  if (hasCentralized && hasCoLocated) {
    results.push({
      type: 'inconsistent-location',
      file: filePath,
      line: 1,
      column: 1,
      matchedText: 'mixed type imports',
      issue: 'File imports types from both centralized and co-located sources',
      suggestedFix: 'Standardize on one type organization pattern',
      severity: 'low',
    });
  }

  return results;
}

export function analyzeFileLocation(
  content: string,
  filePath: string
): FileLocationAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasCentralizedTypes: false,
      hasCoLocatedTypes: false,
      typeDirectories: [],
      confidence: 1.0,
    };
  }

  const patterns: FileLocationPatternInfo[] = [
    ...detectCentralizedTypes(content, filePath),
    ...detectCoLocatedTypes(content, filePath),
    ...detectBarrelExports(content, filePath),
    ...detectTypeOnlyModule(content, filePath),
    ...detectDeclarationFile(content, filePath),
    ...detectSharedTypes(content, filePath),
    ...detectDomainTypes(content, filePath),
  ];

  const violations: FileLocationViolationInfo[] = [
    ...detectScatteredTypesViolations(content, filePath),
    ...detectInconsistentLocationViolations(content, filePath),
  ];

  const hasCentralizedTypes = patterns.some(
    (p) => p.type === 'centralized-types' || p.type === 'shared-types'
  );
  const hasCoLocatedTypes = patterns.some((p) => p.type === 'co-located-types');

  const typeDirectories = [
    ...new Set(patterns.filter((p) => p.directory).map((p) => p.directory!)),
  ];

  let confidence = 0.7;
  if (hasCentralizedTypes || hasCoLocatedTypes) {confidence += 0.15;}
  if (patterns.some((p) => p.type === 'barrel-export')) {confidence += 0.1;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    hasCentralizedTypes,
    hasCoLocatedTypes,
    typeDirectories,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class FileLocationDetector extends RegexDetector {
  readonly id = 'types/file-location';
  readonly name = 'File Location Detector';
  readonly description =
    'Detects type file organization patterns and identifies scattered types';
  readonly category: PatternCategory = 'types';
  readonly subcategory = 'file-location';
  readonly supportedLanguages: Language[] = ['typescript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeFileLocation(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(
      analysis.violations.map((v) => ({
        type: v.type,
        file: v.file,
        line: v.line,
        column: v.column,
        value: v.matchedText,
        issue: v.issue,
        suggestedFix: v.suggestedFix,
        severity: v.severity === 'high' ? 'error' as const : v.severity === 'medium' ? 'warning' as const : 'info' as const,
      }))
    );

    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasCentralizedTypes: analysis.hasCentralizedTypes,
        hasCoLocatedTypes: analysis.hasCoLocatedTypes,
        typeDirectories: analysis.typeDirectories,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createFileLocationDetector(): FileLocationDetector {
  return new FileLocationDetector();
}
