/**
 * Interface vs Type Detector - Interface vs type alias pattern detection
 *
 * Detects patterns for when to use interface vs type including:
 * - Object shape definitions
 * - Union and intersection types
 * - Extending/implementing patterns
 * - Declaration merging
 * - Mapped types
 *
 * @requirements 18.3 - Interface vs type patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type InterfaceVsTypePatternType =
  | 'interface-object'
  | 'interface-extends'
  | 'interface-implements'
  | 'type-union'
  | 'type-intersection'
  | 'type-mapped'
  | 'type-conditional'
  | 'type-utility'
  | 'declaration-merging';

export type InterfaceVsTypeViolationType =
  | 'type-for-object'
  | 'interface-for-union'
  | 'inconsistent-usage'
  | 'unnecessary-type-alias';

export interface InterfaceVsTypePatternInfo {
  type: InterfaceVsTypePatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  name?: string | undefined;
  context?: string | undefined;
}

export interface InterfaceVsTypeViolationInfo {
  type: InterfaceVsTypeViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface InterfaceVsTypeAnalysis {
  patterns: InterfaceVsTypePatternInfo[];
  violations: InterfaceVsTypeViolationInfo[];
  interfaceCount: number;
  typeCount: number;
  prefersInterfaces: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const INTERFACE_OBJECT_PATTERNS = [
  /interface\s+(\w+)\s*\{/g,
  /interface\s+(\w+)\s*<[^>]+>\s*\{/g,
] as const;

export const INTERFACE_EXTENDS_PATTERNS = [
  /interface\s+(\w+)\s+extends\s+\w+/g,
  /interface\s+(\w+)\s*<[^>]+>\s+extends\s+\w+/g,
  /interface\s+(\w+)\s+extends\s+\w+(?:\s*,\s*\w+)+/g,
] as const;

export const INTERFACE_IMPLEMENTS_PATTERNS = [
  /class\s+\w+\s+implements\s+(\w+)/g,
  /class\s+\w+\s+extends\s+\w+\s+implements\s+(\w+)/g,
] as const;

export const TYPE_UNION_PATTERNS = [
  /type\s+(\w+)\s*=\s*[^|]+\s*\|/g,
  /type\s+(\w+)\s*=\s*\|/g,
] as const;

export const TYPE_INTERSECTION_PATTERNS = [
  /type\s+(\w+)\s*=\s*[^&]+\s*&/g,
  /type\s+(\w+)\s*=\s*\w+\s*&\s*\w+/g,
] as const;

export const TYPE_MAPPED_PATTERNS = [
  /type\s+(\w+)\s*=\s*\{\s*\[/g,
  /type\s+(\w+)\s*<[^>]+>\s*=\s*\{\s*\[/g,
  /\[\s*\w+\s+in\s+keyof\s+\w+\s*\]/g,
  /\[\s*\w+\s+in\s+\w+\s*\]/g,
] as const;

export const TYPE_CONDITIONAL_PATTERNS = [
  /type\s+(\w+)\s*=\s*[^?]+\s+extends\s+[^?]+\s*\?/g,
  /type\s+(\w+)\s*<[^>]+>\s*=\s*\w+\s+extends\s+\w+\s*\?/g,
  /\w+\s+extends\s+\w+\s*\?\s*\w+\s*:\s*\w+/g,
] as const;

export const TYPE_UTILITY_PATTERNS = [
  /type\s+(\w+)\s*=\s*Partial</g,
  /type\s+(\w+)\s*=\s*Required</g,
  /type\s+(\w+)\s*=\s*Readonly</g,
  /type\s+(\w+)\s*=\s*Pick</g,
  /type\s+(\w+)\s*=\s*Omit</g,
  /type\s+(\w+)\s*=\s*Record</g,
  /type\s+(\w+)\s*=\s*Exclude</g,
  /type\s+(\w+)\s*=\s*Extract</g,
  /type\s+(\w+)\s*=\s*NonNullable</g,
  /type\s+(\w+)\s*=\s*ReturnType</g,
  /type\s+(\w+)\s*=\s*Parameters</g,
  /type\s+(\w+)\s*=\s*InstanceType</g,
  /type\s+(\w+)\s*=\s*Awaited</g,
] as const;

export const DECLARATION_MERGING_PATTERNS = [
  /interface\s+(\w+)\s*\{[\s\S]*?\}\s*interface\s+\1\s*\{/g,
  /declare\s+module\s+['"`]\w+['"`]\s*\{[\s\S]*?interface\s+\w+/g,
] as const;

export const TYPE_FOR_OBJECT_PATTERNS = [
  /type\s+(\w+)\s*=\s*\{\s*\w+\s*:/g, // Simple object type
] as const;

export const INTERFACE_FOR_UNION_PATTERNS = [
  // This is actually not possible in TypeScript, but we detect attempts
] as const;

export const UNNECESSARY_TYPE_ALIAS_PATTERNS = [
  /type\s+(\w+)\s*=\s*string\s*;/g,
  /type\s+(\w+)\s*=\s*number\s*;/g,
  /type\s+(\w+)\s*=\s*boolean\s*;/g,
  /type\s+(\w+)\s*=\s*null\s*;/g,
  /type\s+(\w+)\s*=\s*undefined\s*;/g,
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

export function detectInterfaceObject(
  content: string,
  filePath: string
): InterfaceVsTypePatternInfo[] {
  const results: InterfaceVsTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of INTERFACE_OBJECT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'interface-object',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectInterfaceExtends(
  content: string,
  filePath: string
): InterfaceVsTypePatternInfo[] {
  const results: InterfaceVsTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of INTERFACE_EXTENDS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'interface-extends',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectInterfaceImplements(
  content: string,
  filePath: string
): InterfaceVsTypePatternInfo[] {
  const results: InterfaceVsTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of INTERFACE_IMPLEMENTS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'interface-implements',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypeUnion(
  content: string,
  filePath: string
): InterfaceVsTypePatternInfo[] {
  const results: InterfaceVsTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_UNION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'type-union',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypeIntersection(
  content: string,
  filePath: string
): InterfaceVsTypePatternInfo[] {
  const results: InterfaceVsTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_INTERSECTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'type-intersection',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypeMapped(
  content: string,
  filePath: string
): InterfaceVsTypePatternInfo[] {
  const results: InterfaceVsTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_MAPPED_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'type-mapped',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypeConditional(
  content: string,
  filePath: string
): InterfaceVsTypePatternInfo[] {
  const results: InterfaceVsTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_CONDITIONAL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'type-conditional',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTypeUtility(
  content: string,
  filePath: string
): InterfaceVsTypePatternInfo[] {
  const results: InterfaceVsTypePatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_UTILITY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'type-utility',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          name: match[1],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectDeclarationMerging(
  content: string,
  filePath: string
): InterfaceVsTypePatternInfo[] {
  const results: InterfaceVsTypePatternInfo[] = [];

  // Check for multiple interfaces with same name
  const interfaceNames = new Map<string, number[]>();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(/interface\s+(\w+)\s*(?:<[^>]+>)?\s*(?:extends|{)/);
    if (match) {
      const name = match[1]!;
      if (!interfaceNames.has(name)) {
        interfaceNames.set(name, []);
      }
      interfaceNames.get(name)!.push(i + 1);
    }
  }

  for (const [name, lineNumbers] of interfaceNames) {
    if (lineNumbers.length > 1) {
      results.push({
        type: 'declaration-merging',
        file: filePath,
        line: lineNumbers[0]!,
        column: 1,
        matchedText: `interface ${name}`,
        name,
        context: `Declared ${lineNumbers.length} times at lines: ${lineNumbers.join(', ')}`,
      });
    }
  }

  return results;
}

export function detectTypeForObjectViolations(
  content: string,
  filePath: string
): InterfaceVsTypeViolationInfo[] {
  const results: InterfaceVsTypeViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TYPE_FOR_OBJECT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        // Check if it's a simple object (not union, intersection, mapped, etc.)
        const fullLine = line + (lines[i + 1] || '');
        if (!/[|&\[]/.test(fullLine.slice(match.index))) {
          results.push({
            type: 'type-for-object',
            file: filePath,
            line: i + 1,
            column: match.index + 1,
            matchedText: match[0],
            issue: 'Consider using interface for object shapes',
            suggestedFix: 'Use interface instead of type for better extensibility',
            severity: 'low',
          });
        }
      }
    }
  }

  return results;
}

export function detectUnnecessaryTypeAliasViolations(
  content: string,
  filePath: string
): InterfaceVsTypeViolationInfo[] {
  const results: InterfaceVsTypeViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of UNNECESSARY_TYPE_ALIAS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'unnecessary-type-alias',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Unnecessary type alias for primitive type',
          suggestedFix: 'Use the primitive type directly or add semantic meaning',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function analyzeInterfaceVsType(
  content: string,
  filePath: string
): InterfaceVsTypeAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      interfaceCount: 0,
      typeCount: 0,
      prefersInterfaces: false,
      confidence: 1.0,
    };
  }

  const patterns: InterfaceVsTypePatternInfo[] = [
    ...detectInterfaceObject(content, filePath),
    ...detectInterfaceExtends(content, filePath),
    ...detectInterfaceImplements(content, filePath),
    ...detectTypeUnion(content, filePath),
    ...detectTypeIntersection(content, filePath),
    ...detectTypeMapped(content, filePath),
    ...detectTypeConditional(content, filePath),
    ...detectTypeUtility(content, filePath),
    ...detectDeclarationMerging(content, filePath),
  ];

  const violations: InterfaceVsTypeViolationInfo[] = [
    ...detectTypeForObjectViolations(content, filePath),
    ...detectUnnecessaryTypeAliasViolations(content, filePath),
  ];

  const interfaceCount = patterns.filter((p) =>
    p.type.startsWith('interface-')
  ).length;
  const typeCount = patterns.filter((p) => p.type.startsWith('type-')).length;
  const prefersInterfaces = interfaceCount > typeCount;

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (violations.length === 0) {confidence += 0.1;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    interfaceCount,
    typeCount,
    prefersInterfaces,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class InterfaceVsTypeDetector extends RegexDetector {
  readonly id = 'types/interface-vs-type';
  readonly name = 'Interface vs Type Detector';
  readonly description =
    'Detects interface vs type alias usage patterns';
  readonly category: PatternCategory = 'types';
  readonly subcategory = 'interface-vs-type';
  readonly supportedLanguages: Language[] = ['typescript'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeInterfaceVsType(context.content, context.file);

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
        interfaceCount: analysis.interfaceCount,
        typeCount: analysis.typeCount,
        prefersInterfaces: analysis.prefersInterfaces,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createInterfaceVsTypeDetector(): InterfaceVsTypeDetector {
  return new InterfaceVsTypeDetector();
}
