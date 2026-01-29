/**
 * Example Code Detector - Example code pattern detection
 * @requirements 21.5 - Example code patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

export type ExampleCodePatternType = 'code-block' | 'inline-code' | 'example-tag' | 'usage-example' | 'snippet' | 'demo-code';
export type ExampleCodeViolationType = 'missing-example' | 'outdated-example';

export interface ExampleCodePatternInfo { type: ExampleCodePatternType; file: string; line: number; column: number; matchedText: string; language?: string | undefined; context?: string | undefined; }
export interface ExampleCodeViolationInfo { type: ExampleCodeViolationType; file: string; line: number; column: number; matchedText: string; issue: string; suggestedFix?: string | undefined; severity: 'high' | 'medium' | 'low'; }
export interface ExampleCodeAnalysis { patterns: ExampleCodePatternInfo[]; violations: ExampleCodeViolationInfo[]; codeBlockCount: number; hasExamples: boolean; confidence: number; }

// JavaScript/TypeScript example patterns
export const CODE_BLOCK_PATTERNS = [/```(\w+)?[\s\S]*?```/g, /~~~(\w+)?[\s\S]*?~~~/g] as const;
export const INLINE_CODE_PATTERNS = [/`[^`]+`/g] as const;
export const EXAMPLE_TAG_PATTERNS = [/@example/g, /\*\s*@example/g] as const;
export const USAGE_EXAMPLE_PATTERNS = [/\/\/\s*Example:/gi, /\/\/\s*Usage:/gi, /\/\*\s*Example:/gi] as const;
export const SNIPPET_PATTERNS = [/snippet/gi, /sample/gi] as const;
export const DEMO_CODE_PATTERNS = [/demo/gi, /playground/gi] as const;

// Python example patterns
export const PYTHON_DOCTEST_PATTERNS = [/>>>\s+.+/g] as const;
export const PYTHON_EXAMPLE_SECTION_PATTERNS = [/Examples?:\s*\n/g, /Example usage:/gi] as const;
export const PYTHON_USAGE_COMMENT_PATTERNS = [/#\s*Example:/gi, /#\s*Usage:/gi] as const;

export function shouldExcludeFile(filePath: string): boolean {
  return [/node_modules\//, /\.min\.[jt]s$/, /__pycache__\//, /\.pyc$/].some((p) => p.test(filePath));
}

// Python example detection functions
function detectPythonDoctest(content: string, filePath: string): ExampleCodePatternInfo[] { return detectPatterns(content, filePath, PYTHON_DOCTEST_PATTERNS, 'usage-example'); }
function detectPythonExampleSection(content: string, filePath: string): ExampleCodePatternInfo[] { return detectPatterns(content, filePath, PYTHON_EXAMPLE_SECTION_PATTERNS, 'example-tag'); }
function detectPythonUsageComment(content: string, filePath: string): ExampleCodePatternInfo[] { return detectPatterns(content, filePath, PYTHON_USAGE_COMMENT_PATTERNS, 'usage-example'); }

function detectPatterns(content: string, filePath: string, patterns: readonly RegExp[], type: ExampleCodePatternType): ExampleCodePatternInfo[] {
  const results: ExampleCodePatternInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type, file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0].slice(0, 50), language: match[1], context: line.trim() });
      }
    }
  }
  return results;
}

export function detectCodeBlock(content: string, filePath: string): ExampleCodePatternInfo[] { return detectPatterns(content, filePath, CODE_BLOCK_PATTERNS, 'code-block'); }
export function detectInlineCode(content: string, filePath: string): ExampleCodePatternInfo[] { return detectPatterns(content, filePath, INLINE_CODE_PATTERNS, 'inline-code'); }
export function detectExampleTag(content: string, filePath: string): ExampleCodePatternInfo[] { return detectPatterns(content, filePath, EXAMPLE_TAG_PATTERNS, 'example-tag'); }
export function detectUsageExample(content: string, filePath: string): ExampleCodePatternInfo[] { return detectPatterns(content, filePath, USAGE_EXAMPLE_PATTERNS, 'usage-example'); }
export function detectSnippet(content: string, filePath: string): ExampleCodePatternInfo[] { return detectPatterns(content, filePath, SNIPPET_PATTERNS, 'snippet'); }
export function detectDemoCode(content: string, filePath: string): ExampleCodePatternInfo[] { return detectPatterns(content, filePath, DEMO_CODE_PATTERNS, 'demo-code'); }

export function analyzeExampleCode(content: string, filePath: string): ExampleCodeAnalysis {
  if (shouldExcludeFile(filePath)) {return { patterns: [], violations: [], codeBlockCount: 0, hasExamples: false, confidence: 1.0 };}
  const isPython = filePath.endsWith('.py');
  const patterns: ExampleCodePatternInfo[] = isPython
    ? [...detectCodeBlock(content, filePath), ...detectInlineCode(content, filePath), ...detectPythonDoctest(content, filePath), ...detectPythonExampleSection(content, filePath), ...detectPythonUsageComment(content, filePath), ...detectSnippet(content, filePath), ...detectDemoCode(content, filePath)]
    : [...detectCodeBlock(content, filePath), ...detectInlineCode(content, filePath), ...detectExampleTag(content, filePath), ...detectUsageExample(content, filePath), ...detectSnippet(content, filePath), ...detectDemoCode(content, filePath)];
  const violations: ExampleCodeViolationInfo[] = [];
  const codeBlockCount = patterns.filter((p) => p.type === 'code-block').length;
  const hasExamples = patterns.some((p) => p.type === 'example-tag' || p.type === 'usage-example');
  let confidence = 0.7; if (patterns.length > 0) {confidence += 0.2;} confidence = Math.min(confidence, 0.95);
  return { patterns, violations, codeBlockCount, hasExamples, confidence };
}

export class ExampleCodeDetector extends RegexDetector {
  readonly id = 'documentation/example-code';
  readonly name = 'Example Code Detector';
  readonly description = 'Detects example code patterns in documentation';
  readonly category: PatternCategory = 'documentation';
  readonly subcategory = 'example-code';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'markdown', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {return this.createEmptyResult();}
    const analysis = analyzeExampleCode(context.content, context.file);
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
    
    return this.createResult([], violations, analysis.confidence, { custom: { patterns: analysis.patterns, codeBlockCount: analysis.codeBlockCount, hasExamples: analysis.hasExamples } });
  }

  generateQuickFix(_violation: Violation): QuickFix | null { return null; }
}

export function createExampleCodeDetector(): ExampleCodeDetector { return new ExampleCodeDetector(); }
