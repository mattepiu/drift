/**
 * Options Pattern Detector for ASP.NET Core
 *
 * Detects Options pattern usage:
 * - IOptions<T> injection
 * - IOptionsSnapshot<T> for reloadable config
 * - IOptionsMonitor<T> for change notifications
 * - Options validation
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Language } from 'driftdetect-core';

export interface OptionsPatternInfo {
  type: 'options' | 'options-snapshot' | 'options-monitor' | 'configure' | 'validation';
  name: string;
  optionsType: string | null;
  line: number;
  file: string;
}

export interface OptionsPatternAnalysis {
  patterns: OptionsPatternInfo[];
  optionsTypes: string[];
  usesSnapshot: boolean;
  usesMonitor: boolean;
  usesValidation: boolean;
  confidence: number;
}

export class OptionsPatternDetector extends BaseDetector {
  readonly id = 'config/aspnet-options-pattern';
  readonly category = 'config' as const;
  readonly subcategory = 'configuration';
  readonly name = 'ASP.NET Options Pattern Detector';
  readonly description = 'Detects Options pattern usage in ASP.NET Core';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (!this.isRelevantFile(content)) {return this.createEmptyResult();}

    const analysis = this.analyzeOptionsPattern(content, file);
    const patterns: PatternMatch[] = analysis.patterns.map(p => ({
      patternId: `${this.id}/${p.type}`,
      location: { file: p.file, line: p.line, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    }));

    return this.createResult(patterns, [], analysis.confidence, {
      custom: { optionsPatternAnalysis: analysis },
    });
  }

  private isRelevantFile(content: string): boolean {
    return content.includes('IOptions') || content.includes('Configure<') || 
           content.includes('.Value') || content.includes('OptionsBuilder');
  }

  analyzeOptionsPattern(content: string, file: string): OptionsPatternAnalysis {
    const patterns: OptionsPatternInfo[] = [];
    const optionsTypes = new Set<string>();
    let usesSnapshot = false;
    let usesMonitor = false;
    let usesValidation = false;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // IOptions<T>
      const optionsMatch = line.match(/IOptions<(\w+)>/);
      if (optionsMatch?.[1]) {
        optionsTypes.add(optionsMatch[1]);
        patterns.push({ type: 'options', name: 'IOptions', optionsType: optionsMatch[1], line: lineNum, file });
      }

      // IOptionsSnapshot<T>
      const snapshotMatch = line.match(/IOptionsSnapshot<(\w+)>/);
      if (snapshotMatch?.[1]) {
        usesSnapshot = true;
        optionsTypes.add(snapshotMatch[1]);
        patterns.push({ type: 'options-snapshot', name: 'IOptionsSnapshot', optionsType: snapshotMatch[1], line: lineNum, file });
      }

      // IOptionsMonitor<T>
      const monitorMatch = line.match(/IOptionsMonitor<(\w+)>/);
      if (monitorMatch?.[1]) {
        usesMonitor = true;
        optionsTypes.add(monitorMatch[1]);
        patterns.push({ type: 'options-monitor', name: 'IOptionsMonitor', optionsType: monitorMatch[1], line: lineNum, file });
      }

      // Configure<T>
      const configureMatch = line.match(/\.Configure<(\w+)>/);
      if (configureMatch?.[1]) {
        optionsTypes.add(configureMatch[1]);
        patterns.push({ type: 'configure', name: 'Configure', optionsType: configureMatch[1], line: lineNum, file });
      }

      // Validation
      if (line.includes('ValidateDataAnnotations') || line.includes('ValidateOnStart') || line.includes('Validate(')) {
        usesValidation = true;
        patterns.push({ type: 'validation', name: 'OptionsValidation', optionsType: null, line: lineNum, file });
      }
    }

    return {
      patterns, optionsTypes: Array.from(optionsTypes), usesSnapshot, usesMonitor, usesValidation,
      confidence: patterns.length > 0 ? 0.85 : 0,
    };
  }

  generateQuickFix(): null { return null; }
}

export function createOptionsPatternDetector(): OptionsPatternDetector {
  return new OptionsPatternDetector();
}
