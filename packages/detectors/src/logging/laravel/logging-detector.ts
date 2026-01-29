/**
 * Laravel Logging Detector
 *
 * Main detector for Laravel logging patterns.
 *
 * @module logging/laravel/logging-detector
 */

import { ChannelExtractor } from './extractors/channel-extractor.js';
import { LogFacadeExtractor } from './extractors/log-facade-extractor.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { LaravelLoggingAnalysis, LogContextPattern } from './types.js';
import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { Language } from 'driftdetect-core';



export class LaravelLoggingDetector extends BaseDetector {
  readonly id = 'logging/laravel-logging';
  readonly category = 'logging' as const;
  readonly subcategory = 'laravel';
  readonly name = 'Laravel Logging Detector';
  readonly description = 'Extracts logging patterns from Laravel code';
  readonly supportedLanguages: Language[] = ['php'];
  readonly detectionMethod = 'regex' as const;

  private readonly facadeExtractor: LogFacadeExtractor;
  private readonly channelExtractor: ChannelExtractor;

  constructor() {
    super();
    this.facadeExtractor = new LogFacadeExtractor();
    this.channelExtractor = new ChannelExtractor();
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    if (!this.isLaravelCode(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeLogging(content, file);

    return this.createResult([], [], analysis.confidence, {
      custom: { laravelLogging: analysis, framework: 'laravel' },
    });
  }

  analyzeLogging(content: string, file: string): LaravelLoggingAnalysis {
    const facade = this.facadeExtractor.extract(content, file);
    const channels = this.channelExtractor.extract(content, file);
    const contextPatterns = this.extractContextPatterns(facade.usages);

    const confidences = [facade.confidence, channels.confidence];
    const nonZeroConfidences = confidences.filter(c => c > 0);
    const confidence = nonZeroConfidences.length > 0
      ? nonZeroConfidences.reduce((a, b) => a + b, 0) / nonZeroConfidences.length
      : 0;

    return { facade, channels, contextPatterns, confidence };
  }

  generateQuickFix(): null {
    return null;
  }

  private isLaravelCode(content: string): boolean {
    return (
      content.includes('use Illuminate\\') ||
      content.includes('Log::') ||
      content.includes('logger(') ||
      content.includes("'channels'")
    );
  }

  private extractContextPatterns(usages: Array<{ contextKeys: string[]; file: string }>): LogContextPattern[] {
    const keyMap = new Map<string, { occurrences: number; files: Set<string> }>();

    for (const usage of usages) {
      for (const key of usage.contextKeys) {
        const existing = keyMap.get(key);
        if (existing) {
          existing.occurrences++;
          existing.files.add(usage.file);
        } else {
          keyMap.set(key, { occurrences: 1, files: new Set([usage.file]) });
        }
      }
    }

    return Array.from(keyMap.entries()).map(([key, data]) => ({
      key,
      valueType: 'unknown' as const,
      occurrences: data.occurrences,
      files: Array.from(data.files),
    }));
  }
}

export function createLaravelLoggingDetector(): LaravelLoggingDetector {
  return new LaravelLoggingDetector();
}
