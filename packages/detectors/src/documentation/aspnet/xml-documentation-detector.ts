/**
 * XML Documentation Detector for C#
 *
 * Detects XML documentation patterns:
 * - /// <summary> comments
 * - <param>, <returns>, <exception> tags
 * - <inheritdoc/> usage
 * - Documentation coverage
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Language } from 'driftdetect-core';

export interface XmlDocPatternInfo {
  type: 'summary' | 'param' | 'returns' | 'exception' | 'inheritdoc' | 'remarks' | 'example';
  targetName: string | null;
  line: number;
  file: string;
}

export interface XmlDocAnalysis {
  patterns: XmlDocPatternInfo[];
  summaryCount: number;
  paramCount: number;
  returnsCount: number;
  usesInheritdoc: boolean;
  publicMembersCount: number;
  documentedMembersCount: number;
  coveragePercent: number;
  confidence: number;
}

export class XmlDocumentationDetector extends BaseDetector {
  readonly id = 'documentation/csharp-xml-docs';
  readonly category = 'documentation' as const;
  readonly subcategory = 'api-documentation';
  readonly name = 'C# XML Documentation Detector';
  readonly description = 'Detects XML documentation patterns in C#';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (!this.isRelevantFile(content)) {return this.createEmptyResult();}

    const analysis = this.analyzeXmlDocumentation(content, file);
    const patterns: PatternMatch[] = analysis.patterns.map(p => ({
      patternId: `${this.id}/${p.type}`,
      location: { file: p.file, line: p.line, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    }));

    return this.createResult(patterns, [], analysis.confidence, {
      custom: { xmlDocAnalysis: analysis },
    });
  }

  private isRelevantFile(content: string): boolean {
    return content.includes('///') || content.includes('<summary>') || content.includes('public ');
  }

  analyzeXmlDocumentation(content: string, file: string): XmlDocAnalysis {
    const patterns: XmlDocPatternInfo[] = [];
    let summaryCount = 0;
    let paramCount = 0;
    let returnsCount = 0;
    let usesInheritdoc = false;
    let publicMembersCount = 0;
    let documentedMembersCount = 0;

    const lines = content.split('\n');
    let lastDocLine = -10;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // <summary>
      if (line.includes('<summary>') || line.includes('/// <summary>')) {
        summaryCount++;
        lastDocLine = i;
        patterns.push({ type: 'summary', targetName: null, line: lineNum, file });
      }

      // <param>
      const paramMatch = line.match(/<param\s+name="(\w+)">/);
      if (paramMatch) {
        paramCount++;
        patterns.push({ type: 'param', targetName: paramMatch[1] || null, line: lineNum, file });
      }

      // <returns>
      if (line.includes('<returns>')) {
        returnsCount++;
        patterns.push({ type: 'returns', targetName: null, line: lineNum, file });
      }

      // <exception>
      if (line.includes('<exception')) {
        patterns.push({ type: 'exception', targetName: null, line: lineNum, file });
      }

      // <inheritdoc/>
      if (line.includes('<inheritdoc') || line.includes('inheritdoc/>')) {
        usesInheritdoc = true;
        lastDocLine = i;
        patterns.push({ type: 'inheritdoc', targetName: null, line: lineNum, file });
      }

      // <remarks>
      if (line.includes('<remarks>')) {
        patterns.push({ type: 'remarks', targetName: null, line: lineNum, file });
      }

      // <example>
      if (line.includes('<example>')) {
        patterns.push({ type: 'example', targetName: null, line: lineNum, file });
      }

      // Count public members
      if (line.match(/^\s*public\s+(?!class|interface|struct|record|enum)/)) {
        publicMembersCount++;
        if (i - lastDocLine <= 3) {
          documentedMembersCount++;
        }
      }
    }

    const coveragePercent = publicMembersCount > 0 
      ? Math.round((documentedMembersCount / publicMembersCount) * 100) 
      : 100;

    return {
      patterns, summaryCount, paramCount, returnsCount, usesInheritdoc,
      publicMembersCount, documentedMembersCount, coveragePercent,
      confidence: patterns.length > 0 ? 0.85 : 0,
    };
  }

  generateQuickFix(): null { return null; }
}

export function createXmlDocumentationDetector(): XmlDocumentationDetector {
  return new XmlDocumentationDetector();
}
