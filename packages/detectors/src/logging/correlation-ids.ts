/**
 * Correlation IDs Detector - Request correlation ID pattern detection
 *
 * Detects correlation ID patterns including:
 * - Request tracing
 * - Distributed tracing
 * - Correlation propagation
 *
 * @requirements 15.4 - Correlation ID patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type CorrelationIdPatternType =
  | 'correlation-id'
  | 'trace-id'
  | 'span-id'
  | 'request-id'
  | 'propagation';

export interface CorrelationIdPatternInfo {
  type: CorrelationIdPatternType;
  line: number;
  column: number;
  match: string;
}

export interface CorrelationIdAnalysis {
  patterns: CorrelationIdPatternInfo[];
  hasCorrelationId: boolean;
  hasDistributedTracing: boolean;
}

// ============================================================================
// Patterns (JavaScript/TypeScript + Python)
// ============================================================================

export const CORRELATION_ID_PATTERNS = [
  // Both languages
  /correlationId/gi,
  /correlation_id/gi,
  /x-correlation-id/gi,
];

export const TRACE_ID_PATTERNS = [
  // Both languages
  /traceId/gi,
  /trace_id/gi,
  /x-trace-id/gi,
  /traceparent/gi,
  // Python OpenTelemetry
  /get_current_span/gi,
  /trace\.get_current_span/gi,
];

export const SPAN_ID_PATTERNS = [
  // Both languages
  /spanId/gi,
  /span_id/gi,
  /x-span-id/gi,
];

export const REQUEST_ID_PATTERNS = [
  // Both languages
  /requestId/gi,
  /request_id/gi,
  /x-request-id/gi,
];

export const PROPAGATION_PATTERNS = [
  // JavaScript/TypeScript
  /propagate\s*\(/gi,
  /inject\s*\([^)]*context/gi,
  /extract\s*\([^)]*context/gi,
  /AsyncLocalStorage/gi,
  // Python
  /contextvars/gi,
  /ContextVar/gi,
  /copy_context/gi,
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
  type: CorrelationIdPatternType
): CorrelationIdPatternInfo[] {
  const results: CorrelationIdPatternInfo[] = [];
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
        });
      }
    }
  }

  return results;
}

export function analyzeCorrelationIds(content: string, filePath: string): CorrelationIdAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      hasCorrelationId: false,
      hasDistributedTracing: false,
    };
  }

  const patterns: CorrelationIdPatternInfo[] = [
    ...detectPatterns(content, CORRELATION_ID_PATTERNS, 'correlation-id'),
    ...detectPatterns(content, TRACE_ID_PATTERNS, 'trace-id'),
    ...detectPatterns(content, SPAN_ID_PATTERNS, 'span-id'),
    ...detectPatterns(content, REQUEST_ID_PATTERNS, 'request-id'),
    ...detectPatterns(content, PROPAGATION_PATTERNS, 'propagation'),
  ];

  const hasCorrelationId = patterns.some(
    (p) => p.type === 'correlation-id' || p.type === 'request-id'
  );
  const hasDistributedTracing = patterns.some(
    (p) => p.type === 'trace-id' || p.type === 'span-id'
  );

  return {
    patterns,
    hasCorrelationId,
    hasDistributedTracing,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class CorrelationIdsDetector extends RegexDetector {
  readonly id = 'logging/correlation-ids';
  readonly name = 'Correlation IDs Detector';
  readonly description = 'Detects request correlation ID patterns';
  readonly category: PatternCategory = 'logging';
  readonly subcategory = 'correlation-ids';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeCorrelationIds(context.content, context.file);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = 0.9;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        hasCorrelationId: analysis.hasCorrelationId,
        hasDistributedTracing: analysis.hasDistributedTracing,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createCorrelationIdsDetector(): CorrelationIdsDetector {
  return new CorrelationIdsDetector();
}
