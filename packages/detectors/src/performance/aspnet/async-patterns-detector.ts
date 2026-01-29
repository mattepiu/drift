/**
 * Async Patterns Detector for C#
 *
 * Detects async/await patterns:
 * - async Task vs async ValueTask
 * - ConfigureAwait(false) usage
 * - Async void (warning)
 * - Task.Run() patterns
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Violation, Language } from 'driftdetect-core';

export interface AsyncPatternInfo {
  type: 'async-task' | 'async-valuetask' | 'async-void' | 'configure-await' | 'task-run' | 'wait-sync';
  name: string;
  line: number;
  file: string;
}

export interface AsyncPatternAnalysis {
  patterns: AsyncPatternInfo[];
  asyncTaskCount: number;
  asyncValueTaskCount: number;
  asyncVoidCount: number;
  usesConfigureAwait: boolean;
  issues: string[];
  confidence: number;
}

export class AsyncPatternsDetector extends BaseDetector {
  readonly id = 'performance/csharp-async-patterns';
  readonly category = 'performance' as const;
  readonly subcategory = 'async';
  readonly name = 'C# Async Patterns Detector';
  readonly description = 'Detects async/await patterns and potential issues in C#';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (!this.isRelevantFile(content)) {return this.createEmptyResult();}

    const analysis = this.analyzeAsyncPatterns(content, file);
    const patterns: PatternMatch[] = analysis.patterns.map(p => ({
      patternId: `${this.id}/${p.type}`,
      location: { file: p.file, line: p.line, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    }));

    const violations = this.detectViolations(analysis, file);
    return this.createResult(patterns, violations, analysis.confidence, {
      custom: { asyncPatternAnalysis: analysis },
    });
  }

  private isRelevantFile(content: string): boolean {
    return content.includes('async ') || content.includes('await ') || content.includes('Task');
  }

  analyzeAsyncPatterns(content: string, file: string): AsyncPatternAnalysis {
    const patterns: AsyncPatternInfo[] = [];
    const issues: string[] = [];
    let asyncTaskCount = 0;
    let asyncValueTaskCount = 0;
    let asyncVoidCount = 0;
    let usesConfigureAwait = false;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // async Task
      if (line.match(/async\s+Task[<\s]/)) {
        asyncTaskCount++;
        patterns.push({ type: 'async-task', name: 'async Task', line: lineNum, file });
      }

      // async ValueTask
      if (line.match(/async\s+ValueTask[<\s]/)) {
        asyncValueTaskCount++;
        patterns.push({ type: 'async-valuetask', name: 'async ValueTask', line: lineNum, file });
      }

      // async void (potential issue)
      if (line.match(/async\s+void\s+\w+/)) {
        asyncVoidCount++;
        patterns.push({ type: 'async-void', name: 'async void', line: lineNum, file });
        issues.push(`async void method at line ${lineNum} - exceptions cannot be caught`);
      }

      // ConfigureAwait
      if (line.includes('.ConfigureAwait(')) {
        usesConfigureAwait = true;
        patterns.push({ type: 'configure-await', name: 'ConfigureAwait', line: lineNum, file });
      }

      // Task.Run
      if (line.includes('Task.Run(')) {
        patterns.push({ type: 'task-run', name: 'Task.Run', line: lineNum, file });
      }

      // Sync over async (.Result, .Wait())
      if (line.includes('.Result') || line.match(/\.Wait\s*\(/)) {
        patterns.push({ type: 'wait-sync', name: 'SyncOverAsync', line: lineNum, file });
        issues.push(`Sync over async at line ${lineNum} - can cause deadlocks`);
      }
    }

    return {
      patterns, asyncTaskCount, asyncValueTaskCount, asyncVoidCount, usesConfigureAwait, issues,
      confidence: patterns.length > 0 ? 0.85 : 0,
    };
  }

  private detectViolations(analysis: AsyncPatternAnalysis, file: string): Violation[] {
    return analysis.issues.map((issue, idx) => {
      const lineMatch = issue.match(/line (\d+)/);
      const lineNum = lineMatch ? parseInt(lineMatch[1] || '1', 10) : 1;
      return {
        id: `${this.id}-${file}-${lineNum}-${idx}`,
        patternId: this.id,
        severity: issue.includes('async void') ? 'warning' : 'error',
        file,
        range: { start: { line: lineNum - 1, character: 0 }, end: { line: lineNum - 1, character: 100 } },
        message: issue,
        expected: issue.includes('async void') ? 'Use async Task instead' : 'Use await instead of .Result/.Wait()',
        actual: issue,
        aiExplainAvailable: true,
        aiFixAvailable: true,
        firstSeen: new Date(),
        occurrences: 1,
      };
    });
  }

  generateQuickFix(): null { return null; }
}

export function createAsyncPatternsDetector(): AsyncPatternsDetector {
  return new AsyncPatternsDetector();
}
