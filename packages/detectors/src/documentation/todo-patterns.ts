/**
 * TODO Patterns Detector - TODO/FIXME comment pattern detection
 * @requirements 21.3 - TODO patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

export type TodoPatternType = 'todo' | 'fixme' | 'hack' | 'xxx' | 'bug' | 'note' | 'optimize' | 'review';
export type TodoViolationType = 'stale-todo' | 'unassigned-todo';

export interface TodoPatternInfo { type: TodoPatternType; file: string; line: number; column: number; matchedText: string; author?: string | undefined; message?: string | undefined; context?: string | undefined; }
export interface TodoViolationInfo { type: TodoViolationType; file: string; line: number; column: number; matchedText: string; issue: string; suggestedFix?: string | undefined; severity: 'high' | 'medium' | 'low'; }
export interface TodoAnalysis { patterns: TodoPatternInfo[]; violations: TodoViolationInfo[]; todoCount: number; fixmeCount: number; hackCount: number; confidence: number; }

export const TODO_PATTERNS = [/\/\/\s*TODO:?\s*(.+)/gi, /\/\*\s*TODO:?\s*(.+)\*\//gi, /#\s*TODO:?\s*(.+)/gi] as const;
export const FIXME_PATTERNS = [/\/\/\s*FIXME:?\s*(.+)/gi, /\/\*\s*FIXME:?\s*(.+)\*\//gi, /#\s*FIXME:?\s*(.+)/gi] as const;
export const HACK_PATTERNS = [/\/\/\s*HACK:?\s*(.+)/gi, /\/\*\s*HACK:?\s*(.+)\*\//gi] as const;
export const XXX_PATTERNS = [/\/\/\s*XXX:?\s*(.+)/gi] as const;
export const BUG_PATTERNS = [/\/\/\s*BUG:?\s*(.+)/gi, /\/\*\s*BUG:?\s*(.+)\*\//gi] as const;
export const NOTE_PATTERNS = [/\/\/\s*NOTE:?\s*(.+)/gi, /\/\*\s*NOTE:?\s*(.+)\*\//gi] as const;
export const OPTIMIZE_PATTERNS = [/\/\/\s*OPTIMIZE:?\s*(.+)/gi, /\/\/\s*PERF:?\s*(.+)/gi] as const;
export const REVIEW_PATTERNS = [/\/\/\s*REVIEW:?\s*(.+)/gi] as const;

export function shouldExcludeFile(filePath: string): boolean {
  return [/node_modules\//, /\.min\.[jt]s$/].some((p) => p.test(filePath));
}

function detectPatterns(content: string, filePath: string, patterns: readonly RegExp[], type: TodoPatternType): TodoPatternInfo[] {
  const results: TodoPatternInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const authorMatch = match[1]?.match(/\(([^)]+)\)/);
        results.push({ type, file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0], author: authorMatch ? authorMatch[1] : undefined, message: match[1]?.replace(/\([^)]+\)\s*/, '').trim(), context: line.trim() });
      }
    }
  }
  return results;
}

export function detectTodo(content: string, filePath: string): TodoPatternInfo[] { return detectPatterns(content, filePath, TODO_PATTERNS, 'todo'); }
export function detectFixme(content: string, filePath: string): TodoPatternInfo[] { return detectPatterns(content, filePath, FIXME_PATTERNS, 'fixme'); }
export function detectHack(content: string, filePath: string): TodoPatternInfo[] { return detectPatterns(content, filePath, HACK_PATTERNS, 'hack'); }
export function detectXxx(content: string, filePath: string): TodoPatternInfo[] { return detectPatterns(content, filePath, XXX_PATTERNS, 'xxx'); }
export function detectBug(content: string, filePath: string): TodoPatternInfo[] { return detectPatterns(content, filePath, BUG_PATTERNS, 'bug'); }
export function detectNote(content: string, filePath: string): TodoPatternInfo[] { return detectPatterns(content, filePath, NOTE_PATTERNS, 'note'); }
export function detectOptimize(content: string, filePath: string): TodoPatternInfo[] { return detectPatterns(content, filePath, OPTIMIZE_PATTERNS, 'optimize'); }
export function detectReview(content: string, filePath: string): TodoPatternInfo[] { return detectPatterns(content, filePath, REVIEW_PATTERNS, 'review'); }

export function analyzeTodoPatterns(content: string, filePath: string): TodoAnalysis {
  if (shouldExcludeFile(filePath)) {return { patterns: [], violations: [], todoCount: 0, fixmeCount: 0, hackCount: 0, confidence: 1.0 };}
  const patterns: TodoPatternInfo[] = [...detectTodo(content, filePath), ...detectFixme(content, filePath), ...detectHack(content, filePath), ...detectXxx(content, filePath), ...detectBug(content, filePath), ...detectNote(content, filePath), ...detectOptimize(content, filePath), ...detectReview(content, filePath)];
  const violations: TodoViolationInfo[] = [];
  const todoCount = patterns.filter((p) => p.type === 'todo').length;
  const fixmeCount = patterns.filter((p) => p.type === 'fixme').length;
  const hackCount = patterns.filter((p) => p.type === 'hack').length;
  let confidence = 0.7; if (patterns.length > 0) {confidence += 0.2;} confidence = Math.min(confidence, 0.95);
  return { patterns, violations, todoCount, fixmeCount, hackCount, confidence };
}

export class TodoPatternsDetector extends RegexDetector {
  readonly id = 'documentation/todo-patterns';
  readonly name = 'TODO Patterns Detector';
  readonly description = 'Detects TODO/FIXME comment patterns';
  readonly category: PatternCategory = 'documentation';
  readonly subcategory = 'todo-patterns';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {return this.createEmptyResult();}
    const analysis = analyzeTodoPatterns(context.content, context.file);
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
    
    return this.createResult([], violations, analysis.confidence, { custom: { patterns: analysis.patterns, todoCount: analysis.todoCount, fixmeCount: analysis.fixmeCount, hackCount: analysis.hackCount } });
  }

  generateQuickFix(_violation: Violation): QuickFix | null { return null; }
}

export function createTodoPatternsDetector(): TodoPatternsDetector { return new TodoPatternsDetector(); }
