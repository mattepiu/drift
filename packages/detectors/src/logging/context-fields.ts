/**
 * Context Fields Detector - Logging context field pattern detection
 *
 * Detects context field patterns including:
 * - Request ID fields
 * - User ID fields
 * - Timestamp fields
 * - Custom context fields
 *
 * @requirements 15.3 - Context field patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ContextFieldPatternType =
  | 'request-id'
  | 'user-id'
  | 'timestamp'
  | 'service-name'
  | 'custom-context';

export interface ContextFieldPatternInfo {
  type: ContextFieldPatternType;
  line: number;
  column: number;
  match: string;
  fieldName?: string | undefined;
}

export interface ContextFieldAnalysis {
  patterns: ContextFieldPatternInfo[];
  hasRequestId: boolean;
  hasUserId: boolean;
  hasTimestamp: boolean;
  contextFields: string[];
}

// ============================================================================
// Patterns (JavaScript/TypeScript + Python)
// ============================================================================

export const REQUEST_ID_PATTERNS = [
  // Both languages
  /requestId\s*[=:]/gi,
  /request_id\s*[=:]/gi,
  /traceId\s*[=:]/gi,
  /trace_id\s*[=:]/gi,
  /x-request-id/gi,
];

export const USER_ID_PATTERNS = [
  // Both languages
  /userId\s*[=:]/gi,
  /user_id\s*[=:]/gi,
  /userID\s*[=:]/gi,
  // Python - common in FastAPI
  /current_user/gi,
  /get_current_user/gi,
];

export const TIMESTAMP_PATTERNS = [
  // JavaScript/TypeScript
  /timestamp\s*[=:]/gi,
  /time\s*[=:]\s*(?:new\s+)?Date/gi,
  /createdAt\s*[=:]/gi,
  // Python
  /created_at\s*[=:]/gi,
  /datetime\.now\s*\(/gi,
  /datetime\.utcnow\s*\(/gi,
  /time\.time\s*\(/gi,
];

export const SERVICE_NAME_PATTERNS = [
  // Both languages
  /serviceName\s*[=:]/gi,
  /service_name\s*[=:]/gi,
  /service\s*[=:]\s*['"`]/gi,
  // Python
  /__name__/gi,
];

export const CUSTOM_CONTEXT_PATTERNS = [
  // JavaScript/TypeScript
  /context\s*[=:]\s*\{/gi,
  /metadata\s*[=:]\s*\{/gi,
  /\.child\s*\(\s*\{/gi,
  // Python - extra dict in logging
  /extra\s*=\s*\{/gi,
  /exc_info\s*=/gi,
  /stack_info\s*=/gi,
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
  type: ContextFieldPatternType
): ContextFieldPatternInfo[] {
  const results: ContextFieldPatternInfo[] = [];
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

export function analyzeContextFields(content: string, filePath: string): ContextFieldAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      hasRequestId: false,
      hasUserId: false,
      hasTimestamp: false,
      contextFields: [],
    };
  }

  const patterns: ContextFieldPatternInfo[] = [
    ...detectPatterns(content, REQUEST_ID_PATTERNS, 'request-id'),
    ...detectPatterns(content, USER_ID_PATTERNS, 'user-id'),
    ...detectPatterns(content, TIMESTAMP_PATTERNS, 'timestamp'),
    ...detectPatterns(content, SERVICE_NAME_PATTERNS, 'service-name'),
    ...detectPatterns(content, CUSTOM_CONTEXT_PATTERNS, 'custom-context'),
  ];

  const hasRequestId = patterns.some((p) => p.type === 'request-id');
  const hasUserId = patterns.some((p) => p.type === 'user-id');
  const hasTimestamp = patterns.some((p) => p.type === 'timestamp');

  const contextFields = [...new Set(patterns.map((p) => p.type))];

  return {
    patterns,
    hasRequestId,
    hasUserId,
    hasTimestamp,
    contextFields,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class ContextFieldsDetector extends RegexDetector {
  readonly id = 'logging/context-fields';
  readonly name = 'Context Fields Detector';
  readonly description = 'Detects logging context field patterns';
  readonly category: PatternCategory = 'logging';
  readonly subcategory = 'context-fields';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeContextFields(context.content, context.file);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = 0.9;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        hasRequestId: analysis.hasRequestId,
        hasUserId: analysis.hasUserId,
        hasTimestamp: analysis.hasTimestamp,
        contextFields: analysis.contextFields,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createContextFieldsDetector(): ContextFieldsDetector {
  return new ContextFieldsDetector();
}
