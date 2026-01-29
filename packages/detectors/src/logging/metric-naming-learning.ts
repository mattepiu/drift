/**
 * Metric Naming Detector - LEARNING VERSION
 *
 * Learns metric naming patterns from the user's codebase:
 * - Metric naming conventions
 * - Prefix patterns
 * - Label naming
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

export type MetricNamingStyle = 'snake_case' | 'dot.separated' | 'camelCase';

export interface MetricNamingConventions {
  [key: string]: unknown;
  namingStyle: MetricNamingStyle;
  usesPrefix: boolean;
  prefix: string | null;
}

interface MetricInfo {
  name: string;
  style: MetricNamingStyle;
  prefix: string | null;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectMetricStyle(name: string): MetricNamingStyle {
  if (name.includes('.')) {return 'dot.separated';}
  if (name.includes('_')) {return 'snake_case';}
  return 'camelCase';
}

function extractPrefix(name: string): string | null {
  const parts = name.split(/[._]/);
  if (parts.length > 1) {return parts[0] || null;}
  return null;
}

function extractMetrics(content: string, file: string): MetricInfo[] {
  const results: MetricInfo[] = [];

  // Common metric patterns
  const metricPatterns = [
    /(?:counter|gauge|histogram|summary)\s*\(\s*['"]([^'"]+)['"]/gi,
    /metrics?\.\w+\s*\(\s*['"]([^'"]+)['"]/gi,
    /(?:increment|decrement|record|observe)\s*\(\s*['"]([^'"]+)['"]/gi,
  ];

  for (const pattern of metricPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1] || '';
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        name,
        style: detectMetricStyle(name),
        prefix: extractPrefix(name),
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Metric Naming Detector
// ============================================================================

export class MetricNamingLearningDetector extends LearningDetector<MetricNamingConventions> {
  readonly id = 'logging/metric-naming';
  readonly category = 'logging' as const;
  readonly subcategory = 'metric-naming';
  readonly name = 'Metric Naming Detector (Learning)';
  readonly description = 'Learns metric naming patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof MetricNamingConventions> {
    return ['namingStyle', 'usesPrefix', 'prefix'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof MetricNamingConventions, ValueDistribution>
  ): void {
    const metrics = extractMetrics(context.content, context.file);
    if (metrics.length === 0) {return;}

    const styleDist = distributions.get('namingStyle')!;
    const prefixDist = distributions.get('usesPrefix')!;
    const prefixValueDist = distributions.get('prefix')!;

    for (const metric of metrics) {
      styleDist.add(metric.style, context.file);
      prefixDist.add(metric.prefix !== null, context.file);
      if (metric.prefix) {
        prefixValueDist.add(metric.prefix, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<MetricNamingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const metrics = extractMetrics(context.content, context.file);
    if (metrics.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.namingStyle?.value;
    const learnedPrefix = conventions.conventions.prefix?.value;

    // Check naming style consistency
    if (learnedStyle) {
      for (const metric of metrics) {
        if (metric.style !== learnedStyle) {
          violations.push(this.createConventionViolation(
            metric.file, metric.line, metric.column,
            'metric naming', metric.style, learnedStyle,
            `Metric '${metric.name}' uses ${metric.style} but project uses ${learnedStyle}`
          ));
        }
      }
    }

    // Check prefix consistency
    if (learnedPrefix) {
      for (const metric of metrics) {
        if (metric.prefix && metric.prefix !== learnedPrefix) {
          violations.push(this.createConventionViolation(
            metric.file, metric.line, metric.column,
            'metric prefix', metric.prefix, learnedPrefix,
            `Metric '${metric.name}' uses prefix '${metric.prefix}' but project uses '${learnedPrefix}'`
          ));
        }
      }
    }

    if (metrics.length > 0) {
      const first = metrics[0]!;
      patterns.push({
        patternId: `${this.id}/metric`,
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

export function createMetricNamingLearningDetector(): MetricNamingLearningDetector {
  return new MetricNamingLearningDetector();
}
