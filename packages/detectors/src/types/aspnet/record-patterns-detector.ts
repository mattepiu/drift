/**
 * Record Patterns Detector for C#
 *
 * Detects record type usage patterns:
 * - record vs record class vs record struct
 * - Primary constructor parameters
 * - with expression usage
 * - Positional records
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Language } from 'driftdetect-core';

export interface RecordPatternInfo {
  type: 'record' | 'record-class' | 'record-struct' | 'with-expression' | 'positional';
  name: string;
  parameters: string[];
  line: number;
  file: string;
}

export interface RecordPatternAnalysis {
  patterns: RecordPatternInfo[];
  recordCount: number;
  recordStructCount: number;
  usesWithExpression: boolean;
  usesPositionalRecords: boolean;
  confidence: number;
}

export class RecordPatternsDetector extends BaseDetector {
  readonly id = 'types/csharp-record-patterns';
  readonly category = 'types' as const;
  readonly subcategory = 'type-definitions';
  readonly name = 'C# Record Patterns Detector';
  readonly description = 'Detects record type usage patterns in C#';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (!this.isRelevantFile(content)) {return this.createEmptyResult();}

    const analysis = this.analyzeRecordPatterns(content, file);
    const patterns: PatternMatch[] = analysis.patterns.map(p => ({
      patternId: `${this.id}/${p.type}`,
      location: { file: p.file, line: p.line, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    }));

    return this.createResult(patterns, [], analysis.confidence, {
      custom: { recordPatternAnalysis: analysis },
    });
  }

  private isRelevantFile(content: string): boolean {
    return content.includes('record ') || content.includes(' with ');
  }

  analyzeRecordPatterns(content: string, file: string): RecordPatternAnalysis {
    const patterns: RecordPatternInfo[] = [];
    let recordCount = 0;
    let recordStructCount = 0;
    let usesWithExpression = false;
    let usesPositionalRecords = false;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // record struct
      const recordStructMatch = line.match(/(?:public|internal|private)?\s*record\s+struct\s+(\w+)/);
      if (recordStructMatch?.[1]) {
        recordStructCount++;
        const params = this.extractParameters(line);
        patterns.push({
          type: 'record-struct', name: recordStructMatch[1], parameters: params, line: lineNum, file
        });
        if (params.length > 0) {usesPositionalRecords = true;}
      }
      // record class or just record
      else {
        const recordMatch = line.match(/(?:public|internal|private)?\s*record\s+(?:class\s+)?(\w+)/);
        if (recordMatch?.[1]) {
          recordCount++;
          const isRecordClass = line.includes('record class');
          const params = this.extractParameters(line);
          patterns.push({
            type: isRecordClass ? 'record-class' : 'record',
            name: recordMatch[1], parameters: params, line: lineNum, file
          });
          if (params.length > 0) {usesPositionalRecords = true;}
        }
      }

      // with expression
      if (line.includes(' with {') || line.includes(' with{')) {
        usesWithExpression = true;
        patterns.push({ type: 'with-expression', name: 'with', parameters: [], line: lineNum, file });
      }
    }

    return {
      patterns, recordCount, recordStructCount, usesWithExpression, usesPositionalRecords,
      confidence: patterns.length > 0 ? 0.9 : 0,
    };
  }

  private extractParameters(line: string): string[] {
    const match = line.match(/\(([^)]+)\)/);
    if (!match) {return [];}
    return match[1]?.split(',').map(p => p.trim()).filter(Boolean) || [];
  }

  generateQuickFix(): null { return null; }
}

export function createRecordPatternsDetector(): RecordPatternsDetector {
  return new RecordPatternsDetector();
}
