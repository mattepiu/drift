/**
 * Structured Format Detector - Structured logging format detection
 *
 * Detects structured logging patterns including:
 * - JSON logging
 * - Key-value logging
 * - Logger library usage
 *
 * @requirements 15.1 - Structured logging format patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type StructuredFormatPatternType =
  | 'json-logging'
  | 'key-value-logging'
  | 'winston-logger'
  | 'pino-logger'
  | 'bunyan-logger'
  | 'console-log';

export interface StructuredFormatPatternInfo {
  type: StructuredFormatPatternType;
  line: number;
  column: number;
  match: string;
  library?: string | undefined;
}

export interface StructuredFormatAnalysis {
  patterns: StructuredFormatPatternInfo[];
  hasStructuredLogging: boolean;
  dominantLibrary: string | null;
  consoleLogCount: number;
}

// ============================================================================
// Patterns (JavaScript/TypeScript + Python)
// ============================================================================

export const JSON_LOGGING_PATTERNS = [
  // JavaScript/TypeScript
  /logger\.\w+\s*\(\s*\{/gi,
  /log\.\w+\s*\(\s*\{/gi,
  /JSON\.stringify\s*\([^)]*log/gi,
  // Python - dict/extra logging
  /logger\.\w+\s*\([^)]+,\s*extra\s*=/gi,
  /logging\.\w+\s*\([^)]+,\s*extra\s*=/gi,
];

export const KEY_VALUE_LOGGING_PATTERNS = [
  // JavaScript/TypeScript
  /logger\.\w+\s*\([^)]*,\s*\{/gi,
  /log\.\w+\s*\([^)]*,\s*\{/gi,
  // Python - f-string structured logging
  /logger\.\w+\s*\(\s*f['"]/gi,
  /logging\.\w+\s*\(\s*f['"]/gi,
];

export const WINSTON_PATTERNS = [
  /winston\.createLogger/gi,
  /winston\.\w+\s*\(/gi,
  /import.*winston/gi,
];

export const PINO_PATTERNS = [
  /pino\s*\(/gi,
  /import.*pino/gi,
  /require\s*\(\s*['"`]pino['"`]\s*\)/gi,
];

export const BUNYAN_PATTERNS = [
  /bunyan\.createLogger/gi,
  /import.*bunyan/gi,
];

// Python logging libraries
export const PYTHON_STRUCTLOG_PATTERNS = [
  /structlog\.get_logger/gi,
  /structlog\.configure/gi,
  /import\s+structlog/gi,
  /from\s+structlog/gi,
];

export const PYTHON_LOGURU_PATTERNS = [
  /from\s+loguru\s+import/gi,
  /loguru\.logger/gi,
];

export const CONSOLE_LOG_PATTERNS = [
  // JavaScript/TypeScript
  /console\.log\s*\(/gi,
  /console\.info\s*\(/gi,
  /console\.warn\s*\(/gi,
  /console\.error\s*\(/gi,
  /console\.debug\s*\(/gi,
  // Python print (anti-pattern in production)
  /print\s*\(/gi,
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

export function detectJSONLogging(content: string): StructuredFormatPatternInfo[] {
  const results: StructuredFormatPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of JSON_LOGGING_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'json-logging',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectWinstonLogger(content: string): StructuredFormatPatternInfo[] {
  const results: StructuredFormatPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of WINSTON_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'winston-logger',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          library: 'winston',
        });
      }
    }
  }

  return results;
}

export function detectPinoLogger(content: string): StructuredFormatPatternInfo[] {
  const results: StructuredFormatPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of PINO_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'pino-logger',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          library: 'pino',
        });
      }
    }
  }

  return results;
}

export function detectConsoleLog(content: string): StructuredFormatPatternInfo[] {
  const results: StructuredFormatPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CONSOLE_LOG_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'console-log',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function analyzeStructuredFormat(content: string, filePath: string): StructuredFormatAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      hasStructuredLogging: false,
      dominantLibrary: null,
      consoleLogCount: 0,
    };
  }

  const patterns: StructuredFormatPatternInfo[] = [
    ...detectJSONLogging(content),
    ...detectWinstonLogger(content),
    ...detectPinoLogger(content),
    ...detectConsoleLog(content),
  ];

  const libraryCounts = new Map<string, number>();
  for (const pattern of patterns) {
    if (pattern.library) {
      libraryCounts.set(pattern.library, (libraryCounts.get(pattern.library) || 0) + 1);
    }
  }

  let dominantLibrary: string | null = null;
  let maxCount = 0;
  for (const [lib, count] of libraryCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantLibrary = lib;
    }
  }

  const hasStructuredLogging = patterns.some(
    (p) => p.type === 'json-logging' || p.type === 'winston-logger' || p.type === 'pino-logger'
  );
  const consoleLogCount = patterns.filter((p) => p.type === 'console-log').length;

  return {
    patterns,
    hasStructuredLogging,
    dominantLibrary,
    consoleLogCount,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class StructuredFormatDetector extends RegexDetector {
  readonly id = 'logging/structured-format';
  readonly name = 'Structured Format Detector';
  readonly description = 'Detects structured logging format patterns';
  readonly category: PatternCategory = 'logging';
  readonly subcategory = 'structured-format';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeStructuredFormat(context.content, context.file);

    if (analysis.patterns.length === 0) {
      return this.createEmptyResult();
    }

    const confidence = analysis.hasStructuredLogging ? 0.9 : 0.7;
    return this.createResult([], [], confidence, {
      custom: {
        patterns: analysis.patterns,
        hasStructuredLogging: analysis.hasStructuredLogging,
        dominantLibrary: analysis.dominantLibrary,
        consoleLogCount: analysis.consoleLogCount,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createStructuredFormatDetector(): StructuredFormatDetector {
  return new StructuredFormatDetector();
}
