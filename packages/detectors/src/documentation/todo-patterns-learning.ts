/**
 * TODO Patterns Detector - LEARNING VERSION
 *
 * Learns TODO/FIXME comment patterns from the user's codebase:
 * - Comment format conventions
 * - Tag usage patterns
 * - Attribution patterns
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

export type TodoTag = 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'NOTE';
export type TodoFormat = 'with-author' | 'with-date' | 'with-issue' | 'plain';

export interface TodoPatternsConventions {
  [key: string]: unknown;
  preferredTag: TodoTag;
  format: TodoFormat;
  usesAttribution: boolean;
}

interface TodoPatternInfo {
  tag: TodoTag;
  format: TodoFormat;
  hasAuthor: boolean;
  hasDate: boolean;
  hasIssue: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractTodoPatterns(content: string, file: string): TodoPatternInfo[] {
  const results: TodoPatternInfo[] = [];

  const todoPattern = /\/\/\s*(TODO|FIXME|HACK|XXX|NOTE)(?:\s*\(([^)]+)\))?:?\s*(.+)/gi;
  let match;
  while ((match = todoPattern.exec(content)) !== null) {
    const tag = (match[1] || 'TODO').toUpperCase() as TodoTag;
    const attribution = match[2] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    const hasAuthor = /@\w+/.test(attribution) || /\w+@/.test(attribution);
    const hasDate = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(attribution);
    const hasIssue = /#\d+|[A-Z]+-\d+/.test(attribution);

    let format: TodoFormat = 'plain';
    if (hasAuthor) {format = 'with-author';}
    else if (hasDate) {format = 'with-date';}
    else if (hasIssue) {format = 'with-issue';}

    results.push({
      tag,
      format,
      hasAuthor,
      hasDate,
      hasIssue,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning TODO Patterns Detector
// ============================================================================

export class TodoPatternsLearningDetector extends LearningDetector<TodoPatternsConventions> {
  readonly id = 'documentation/todo-patterns';
  readonly category = 'documentation' as const;
  readonly subcategory = 'todo-patterns';
  readonly name = 'TODO Patterns Detector (Learning)';
  readonly description = 'Learns TODO/FIXME comment patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof TodoPatternsConventions> {
    return ['preferredTag', 'format', 'usesAttribution'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TodoPatternsConventions, ValueDistribution>
  ): void {
    const patterns = extractTodoPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const tagDist = distributions.get('preferredTag')!;
    const formatDist = distributions.get('format')!;
    const attrDist = distributions.get('usesAttribution')!;

    for (const pattern of patterns) {
      tagDist.add(pattern.tag, context.file);
      formatDist.add(pattern.format, context.file);
      attrDist.add(pattern.hasAuthor || pattern.hasDate || pattern.hasIssue, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TodoPatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const todoPatterns = extractTodoPatterns(context.content, context.file);
    if (todoPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedFormat = conventions.conventions.format?.value;
    const learnedUsesAttribution = conventions.conventions.usesAttribution?.value;

    // Check format consistency
    if (learnedUsesAttribution === true) {
      for (const pattern of todoPatterns) {
        if (pattern.format === 'plain') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'TODO format', 'plain', learnedFormat || 'with attribution',
            `${pattern.tag} should include attribution (project convention)`
          ));
        }
      }
    }

    if (todoPatterns.length > 0) {
      const first = todoPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/todo`,
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

export function createTodoPatternsLearningDetector(): TodoPatternsLearningDetector {
  return new TodoPatternsLearningDetector();
}
