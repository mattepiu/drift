/**
 * Deprecation Detector - Deprecation pattern detection
 * @requirements 21.4 - Deprecation patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

export type DeprecationPatternType = 'jsdoc-deprecated' | 'decorator-deprecated' | 'console-warn' | 'deprecation-notice' | 'legacy-marker';
export type DeprecationViolationType = 'missing-alternative' | 'missing-removal-date';

export interface DeprecationPatternInfo { type: DeprecationPatternType; file: string; line: number; column: number; matchedText: string; alternative?: string | undefined; context?: string | undefined; }
export interface DeprecationViolationInfo { type: DeprecationViolationType; file: string; line: number; column: number; matchedText: string; issue: string; suggestedFix?: string | undefined; severity: 'high' | 'medium' | 'low'; }
export interface DeprecationAnalysis { patterns: DeprecationPatternInfo[]; violations: DeprecationViolationInfo[]; deprecatedCount: number; hasAlternatives: boolean; confidence: number; }

// JavaScript/TypeScript deprecation patterns
export const JSDOC_DEPRECATED_PATTERNS = [/@deprecated/gi, /\*\s*@deprecated\s+(.+)/g] as const;
export const DECORATOR_DEPRECATED_PATTERNS = [/@Deprecated\s*\(/g, /@deprecated\s*\(/g] as const;
export const CONSOLE_WARN_PATTERNS = [/console\.warn\s*\([^)]*deprecat/gi, /console\.warn\s*\([^)]*will be removed/gi] as const;
export const DEPRECATION_NOTICE_PATTERNS = [/DEPRECATED/g, /deprecated/g, /will be removed/gi, /no longer supported/gi] as const;
export const LEGACY_MARKER_PATTERNS = [/legacy/gi, /old\s+api/gi, /v1\s+api/gi] as const;

// Python deprecation patterns
export const PYTHON_DEPRECATED_DECORATOR_PATTERNS = [/@deprecated/g, /@deprecation\.deprecated/g, /@typing\.deprecated/g] as const;
export const PYTHON_WARNINGS_PATTERNS = [/warnings\.warn\s*\([^)]*deprecat/gi, /warnings\.warn\s*\([^)]*will be removed/gi, /DeprecationWarning/g, /PendingDeprecationWarning/g] as const;
export const PYTHON_DOCSTRING_DEPRECATED_PATTERNS = [/"""[^"]*deprecated[^"]*"""/gi, /'''[^']*deprecated[^']*'''/gi, /:deprecated:/gi, /\.\.\s*deprecated::/gi] as const;

export function shouldExcludeFile(filePath: string): boolean {
  return [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//, /node_modules\//, /\.min\.[jt]s$/, /test_.*\.py$/, /_test\.py$/, /__pycache__\//, /\.pyc$/].some((p) => p.test(filePath));
}

function detectPythonDeprecatedDecorator(content: string, filePath: string): DeprecationPatternInfo[] {
  return detectPatterns(content, filePath, PYTHON_DEPRECATED_DECORATOR_PATTERNS, 'decorator-deprecated');
}

function detectPythonWarnings(content: string, filePath: string): DeprecationPatternInfo[] {
  return detectPatterns(content, filePath, PYTHON_WARNINGS_PATTERNS, 'console-warn');
}

function detectPythonDocstringDeprecated(content: string, filePath: string): DeprecationPatternInfo[] {
  return detectPatterns(content, filePath, PYTHON_DOCSTRING_DEPRECATED_PATTERNS, 'jsdoc-deprecated');
}

function detectPatterns(content: string, filePath: string, patterns: readonly RegExp[], type: DeprecationPatternType): DeprecationPatternInfo[] {
  const results: DeprecationPatternInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const altMatch = line.match(/use\s+(\w+)\s+instead/i) || line.match(/replaced\s+by\s+(\w+)/i);
        results.push({ type, file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], alternative: altMatch ? altMatch[1] : undefined, context: line.trim() });
      }
    }
  }
  return results;
}

export function detectJsdocDeprecated(content: string, filePath: string): DeprecationPatternInfo[] { return detectPatterns(content, filePath, JSDOC_DEPRECATED_PATTERNS, 'jsdoc-deprecated'); }
export function detectDecoratorDeprecated(content: string, filePath: string): DeprecationPatternInfo[] { return detectPatterns(content, filePath, DECORATOR_DEPRECATED_PATTERNS, 'decorator-deprecated'); }
export function detectConsoleWarn(content: string, filePath: string): DeprecationPatternInfo[] { return detectPatterns(content, filePath, CONSOLE_WARN_PATTERNS, 'console-warn'); }
export function detectDeprecationNotice(content: string, filePath: string): DeprecationPatternInfo[] { return detectPatterns(content, filePath, DEPRECATION_NOTICE_PATTERNS, 'deprecation-notice'); }
export function detectLegacyMarker(content: string, filePath: string): DeprecationPatternInfo[] { return detectPatterns(content, filePath, LEGACY_MARKER_PATTERNS, 'legacy-marker'); }

export function analyzeDeprecation(content: string, filePath: string): DeprecationAnalysis {
  if (shouldExcludeFile(filePath)) {return { patterns: [], violations: [], deprecatedCount: 0, hasAlternatives: false, confidence: 1.0 };}
  const isPython = filePath.endsWith('.py');
  const patterns: DeprecationPatternInfo[] = isPython
    ? [...detectPythonDeprecatedDecorator(content, filePath), ...detectPythonWarnings(content, filePath), ...detectPythonDocstringDeprecated(content, filePath), ...detectDeprecationNotice(content, filePath), ...detectLegacyMarker(content, filePath)]
    : [...detectJsdocDeprecated(content, filePath), ...detectDecoratorDeprecated(content, filePath), ...detectConsoleWarn(content, filePath), ...detectDeprecationNotice(content, filePath), ...detectLegacyMarker(content, filePath)];
  const violations: DeprecationViolationInfo[] = [];
  const deprecatedCount = patterns.length;
  const hasAlternatives = patterns.some((p) => p.alternative);
  let confidence = 0.7; if (patterns.length > 0) {confidence += 0.2;} confidence = Math.min(confidence, 0.95);
  return { patterns, violations, deprecatedCount, hasAlternatives, confidence };
}

export class DeprecationDetector extends RegexDetector {
  readonly id = 'documentation/deprecation';
  readonly name = 'Deprecation Detector';
  readonly description = 'Detects deprecation patterns and notices';
  readonly category: PatternCategory = 'documentation';
  readonly subcategory = 'deprecation';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {return this.createEmptyResult();}
    const analysis = analyzeDeprecation(context.content, context.file);
    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {return this.createEmptyResult();}
    
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
    
    return this.createResult([], violations, analysis.confidence, { custom: { patterns: analysis.patterns, deprecatedCount: analysis.deprecatedCount, hasAlternatives: analysis.hasAlternatives } });
  }

  generateQuickFix(_violation: Violation): QuickFix | null { return null; }
}

export function createDeprecationDetector(): DeprecationDetector { return new DeprecationDetector(); }
