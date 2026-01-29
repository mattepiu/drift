/**
 * Metric Naming Detector - Metric naming convention detection
 *
 * Detects metric naming patterns including:
 * - Counter naming
 * - Gauge naming
 * - Histogram naming
 * - Metric prefixes
 *
 * @requirements 15.6 - Metric naming patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type MetricNamingPatternType =
  | 'counter-metric'
  | 'gauge-metric'
  | 'histogram-metric'
  | 'summary-metric'
  | 'metric-prefix';

export interface MetricNamingPatternInfo {
  type: MetricNamingPatternType;
  line: number;
  column: number;
  match: string;
  metricName?: string | undefined;
}

export interface MetricNamingAnalysis {
  patterns: MetricNamingPatternInfo[];
  hasMetrics: boolean;
  metricTypes: string[];
}

// ============================================================================
// Patterns (JavaScript/TypeScript + Python)
// ============================================================================

export const COUNTER_METRIC_PATTERNS = [
  // JavaScript/TypeScript
  /Counter\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /createCounter\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /\.counter\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /_total\s*[=:]/gi,
  /_count\s*[=:]/gi,
  // Python prometheus_client
  /Counter\s*\(\s*['"]([^'"]+)['"]/gi,
  /counter\.inc\s*\(/gi,
];

export const GAUGE_METRIC_PATTERNS = [
  // JavaScript/TypeScript
  /Gauge\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /createGauge\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /\.gauge\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  // Python prometheus_client
  /Gauge\s*\(\s*['"]([^'"]+)['"]/gi,
  /gauge\.set\s*\(/gi,
];

export const HISTOGRAM_METRIC_PATTERNS = [
  // JavaScript/TypeScript
  /Histogram\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /createHistogram\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /\.histogram\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /_bucket\s*[=:]/gi,
  /_duration/gi,
  // Python prometheus_client
  /Histogram\s*\(\s*['"]([^'"]+)['"]/gi,
  /histogram\.observe\s*\(/gi,
];

export const SUMMARY_METRIC_PATTERNS = [
  // JavaScript/TypeScript
  /Summary\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /createSummary\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /\.summary\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  // Python prometheus_client
  /Summary\s*\(\s*['"]([^'"]+)['"]/gi,
];

export const METRIC_PREFIX_PATTERNS = [
  // Both languages
  /http_request_/gi,
  /app_/gi,
  /service_/gi,
  /process_/gi,
  /nodejs_/gi,
  // Python specific
  /python_/gi,
  /fastapi_/gi,
];

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /\.d\.ts$/,
    /node_modules\//,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

function detectPatterns(
  content: string,
  patterns: RegExp[],
  type: MetricNamingPatternType
): MetricNamingPatternInfo[] {
  const results: MetricNamingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type,
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          metricName: match[1],
        });
      }
    }
  }

  return results;
}

export function analyzeMetricNaming(content: string, filePath: string): MetricNamingAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      hasMetrics: false,
      metricTypes: [],
    };
  }

  const patterns: MetricNamingPatternInfo[] = [
    ...detectPatterns(content, COUNTER_METRIC_PATTERNS, 'counter-metric'),
    ...detectPatterns(content, GAUGE_METRIC_PATTERNS, 'gauge-metric'),
    ...detectPatterns(content, HISTOGRAM_METRIC_PATTERNS, 'histogram-metric'),
    ...detectPatterns(content, SUMMARY_METRIC_PATTERNS, 'summary-metric'),
    ...detectPatterns(content, METRIC_PREFIX_PATTERNS, 'metric-prefix'),
  ];

  const hasMetrics = patterns.length > 0;
  const metricTypes = [...new Set(patterns.map((p) => p.type))];

  return {
    patterns,
    hasMetrics,
    metricTypes,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class MetricNamingDetector extends RegexDetector {
  readonly id = 'logging/metric-naming';
  readonly name = 'Metric Naming Detector';
  readonly description = 'Detects metric naming convention patterns';
  readonly category: PatternCategory = 'logging';
  readonly subcategory = 'metric-naming';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeMetricNaming(context.content, context.file);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = 0.9;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        hasMetrics: analysis.hasMetrics,
        metricTypes: analysis.metricTypes,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createMetricNamingDetector(): MetricNamingDetector {
  return new MetricNamingDetector();
}
