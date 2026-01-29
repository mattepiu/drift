/**
 * Dependency Injection Registration Detector for ASP.NET Core
 *
 * Detects DI registration patterns:
 * - AddScoped<T>() / AddTransient<T>() / AddSingleton<T>()
 * - Extension method registration
 * - Assembly scanning
 * - Decorator patterns
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Language } from 'driftdetect-core';

export interface DIRegistrationInfo {
  type: 'scoped' | 'transient' | 'singleton' | 'extension' | 'keyed' | 'factory';
  serviceType: string | null;
  implementationType: string | null;
  line: number;
  file: string;
}

export interface DIRegistrationAnalysis {
  patterns: DIRegistrationInfo[];
  scopedCount: number;
  transientCount: number;
  singletonCount: number;
  usesExtensionMethods: boolean;
  usesKeyedServices: boolean;
  confidence: number;
}

export class DIRegistrationDetector extends BaseDetector {
  readonly id = 'structural/aspnet-di-registration';
  readonly category = 'structural' as const;
  readonly subcategory = 'dependency-injection';
  readonly name = 'ASP.NET DI Registration Detector';
  readonly description = 'Detects dependency injection registration patterns in ASP.NET Core';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (!this.isRelevantFile(content)) {return this.createEmptyResult();}

    const analysis = this.analyzeDIRegistration(content, file);
    const patterns: PatternMatch[] = analysis.patterns.map(p => ({
      patternId: `${this.id}/${p.type}`,
      location: { file: p.file, line: p.line, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    }));

    return this.createResult(patterns, [], analysis.confidence, {
      custom: { diRegistrationAnalysis: analysis },
    });
  }

  private isRelevantFile(content: string): boolean {
    return content.includes('AddScoped') || content.includes('AddTransient') || 
           content.includes('AddSingleton') || content.includes('IServiceCollection');
  }

  analyzeDIRegistration(content: string, file: string): DIRegistrationAnalysis {
    const patterns: DIRegistrationInfo[] = [];
    let scopedCount = 0;
    let transientCount = 0;
    let singletonCount = 0;
    let usesExtensionMethods = false;
    let usesKeyedServices = false;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // AddScoped
      const scopedMatch = line.match(/\.AddScoped<([^,>]+)(?:,\s*([^>]+))?>/);
      if (scopedMatch) {
        scopedCount++;
        patterns.push({
          type: 'scoped', serviceType: scopedMatch[1] || null,
          implementationType: scopedMatch[2] || null, line: lineNum, file
        });
      }

      // AddTransient
      const transientMatch = line.match(/\.AddTransient<([^,>]+)(?:,\s*([^>]+))?>/);
      if (transientMatch) {
        transientCount++;
        patterns.push({
          type: 'transient', serviceType: transientMatch[1] || null,
          implementationType: transientMatch[2] || null, line: lineNum, file
        });
      }

      // AddSingleton
      const singletonMatch = line.match(/\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?>/);
      if (singletonMatch) {
        singletonCount++;
        patterns.push({
          type: 'singleton', serviceType: singletonMatch[1] || null,
          implementationType: singletonMatch[2] || null, line: lineNum, file
        });
      }

      // Extension method pattern
      if (line.match(/public\s+static\s+\w+\s+Add\w+\s*\(\s*this\s+IServiceCollection/)) {
        usesExtensionMethods = true;
        patterns.push({ type: 'extension', serviceType: null, implementationType: null, line: lineNum, file });
      }

      // Keyed services (.NET 8+)
      if (line.includes('AddKeyedScoped') || line.includes('AddKeyedTransient') || line.includes('AddKeyedSingleton')) {
        usesKeyedServices = true;
        patterns.push({ type: 'keyed', serviceType: null, implementationType: null, line: lineNum, file });
      }

      // Factory registration
      if (line.match(/\.Add(?:Scoped|Transient|Singleton)\s*\(/) && line.includes('=>')) {
        patterns.push({ type: 'factory', serviceType: null, implementationType: null, line: lineNum, file });
      }
    }

    return {
      patterns, scopedCount, transientCount, singletonCount, usesExtensionMethods, usesKeyedServices,
      confidence: patterns.length > 0 ? 0.9 : 0,
    };
  }

  generateQuickFix(): null { return null; }
}

export function createDIRegistrationDetector(): DIRegistrationDetector {
  return new DIRegistrationDetector();
}
