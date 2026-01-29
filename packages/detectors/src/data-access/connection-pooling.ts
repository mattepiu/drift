/**
 * Connection Pooling Detector - Database connection pool pattern detection
 *
 * Detects connection pooling patterns including:
 * - Pool configuration
 * - Connection management
 * - Pool size settings
 * - Connection lifecycle
 *
 * @requirements 13.7 - Connection pooling detection
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type ConnectionPoolPatternType =
  | 'pool-config'
  | 'pool-size'
  | 'connection-timeout'
  | 'idle-timeout'
  | 'connection-acquire'
  | 'connection-release';

export type ConnectionPoolViolationType =
  | 'missing-pool-config'
  | 'connection-leak'
  | 'unbounded-pool';

export interface ConnectionPoolPatternInfo {
  type: ConnectionPoolPatternType;
  line: number;
  column: number;
  match: string;
  value?: string | undefined;
}

export interface ConnectionPoolViolationInfo {
  type: ConnectionPoolViolationType;
  line: number;
  column: number;
  match: string;
  message: string;
}

export interface ConnectionPoolAnalysis {
  patterns: ConnectionPoolPatternInfo[];
  violations: ConnectionPoolViolationInfo[];
  hasPoolConfig: boolean;
  poolSettings: Record<string, string>;
}

// ============================================================================
// Patterns
// ============================================================================

export const POOL_CONFIG_PATTERNS = [
  // JavaScript/TypeScript
  /pool\s*:\s*\{/gi,
  /connectionPool\s*:\s*\{/gi,
  /poolConfig\s*:\s*\{/gi,
  /createPool\s*\(/gi,
  /Pool\s*\(/gi,
  // Python
  /pool_size\s*=/gi,
  /max_overflow\s*=/gi,
  /pool_pre_ping\s*=/gi,
  /create_engine\s*\([^)]*pool/gi,
  /QueuePool/gi,
  /NullPool/gi,
  /StaticPool/gi,
  /AsyncAdaptedQueuePool/gi,
];

export const POOL_SIZE_PATTERNS = [
  // JavaScript/TypeScript
  /(?:max|min|poolSize|connectionLimit)\s*:\s*(\d+)/gi,
  /max_connections\s*[=:]\s*(\d+)/gi,
  /pool_size\s*[=:]\s*(\d+)/gi,
  /CONNECTION_POOL_SIZE\s*[=:]\s*(\d+)/gi,
  // Python
  /pool_size\s*=\s*(\d+)/gi,
  /max_overflow\s*=\s*(\d+)/gi,
  /POOL_SIZE\s*=\s*(\d+)/gi,
];

export const CONNECTION_TIMEOUT_PATTERNS = [
  /(?:connectionTimeout|connectTimeout|acquireTimeout)\s*:\s*(\d+)/gi,
  /connection_timeout\s*[=:]\s*(\d+)/gi,
  /timeout\s*:\s*(\d+)/gi,
];

export const IDLE_TIMEOUT_PATTERNS = [
  /(?:idleTimeout|idleTimeoutMillis|idle_timeout)\s*:\s*(\d+)/gi,
  /evictionRunIntervalMillis\s*:\s*(\d+)/gi,
  /softIdleTimeoutMillis\s*:\s*(\d+)/gi,
];

export const CONNECTION_ACQUIRE_PATTERNS = [
  // JavaScript/TypeScript
  /\.getConnection\s*\(/gi,
  /\.acquire\s*\(/gi,
  /\.connect\s*\(/gi,
  /pool\.query\s*\(/gi,
  // Python
  /engine\.connect\s*\(/gi,
  /\.get_connection\s*\(/gi,
  /connection_pool\.getconn\s*\(/gi,
  /pool\.connection\s*\(/gi,
];

export const CONNECTION_RELEASE_PATTERNS = [
  // JavaScript/TypeScript
  /\.release\s*\(/gi,
  /\.end\s*\(/gi,
  /\.destroy\s*\(/gi,
  /connection\.close\s*\(/gi,
  // Python
  /connection\.close\s*\(/gi,
  /\.putconn\s*\(/gi,
  /\.dispose\s*\(/gi,
  /session\.close\s*\(/gi,
];

export const CONNECTION_LEAK_PATTERNS = [
  /getConnection\s*\([^)]*\)[^]*?(?!\.release|\.end|finally)/gis,
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

export function detectPoolConfig(content: string): ConnectionPoolPatternInfo[] {
  const results: ConnectionPoolPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of POOL_CONFIG_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'pool-config',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectPoolSize(content: string): ConnectionPoolPatternInfo[] {
  const results: ConnectionPoolPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of POOL_SIZE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'pool-size',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          value: match[1],
        });
      }
    }
  }

  return results;
}

export function detectConnectionTimeout(content: string): ConnectionPoolPatternInfo[] {
  const results: ConnectionPoolPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CONNECTION_TIMEOUT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'connection-timeout',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          value: match[1],
        });
      }
    }
  }

  return results;
}

export function detectIdleTimeout(content: string): ConnectionPoolPatternInfo[] {
  const results: ConnectionPoolPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of IDLE_TIMEOUT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'idle-timeout',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          value: match[1],
        });
      }
    }
  }

  return results;
}

export function detectConnectionAcquire(content: string): ConnectionPoolPatternInfo[] {
  const results: ConnectionPoolPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CONNECTION_ACQUIRE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'connection-acquire',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectConnectionRelease(content: string): ConnectionPoolPatternInfo[] {
  const results: ConnectionPoolPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CONNECTION_RELEASE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'connection-release',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function analyzeConnectionPooling(content: string, filePath: string): ConnectionPoolAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasPoolConfig: false,
      poolSettings: {},
    };
  }

  const patterns: ConnectionPoolPatternInfo[] = [
    ...detectPoolConfig(content),
    ...detectPoolSize(content),
    ...detectConnectionTimeout(content),
    ...detectIdleTimeout(content),
    ...detectConnectionAcquire(content),
    ...detectConnectionRelease(content),
  ];

  const violations: ConnectionPoolViolationInfo[] = [];

  // Check for connection acquire without release
  const acquires = patterns.filter((p) => p.type === 'connection-acquire');
  const releases = patterns.filter((p) => p.type === 'connection-release');

  if (acquires.length > 0 && releases.length === 0) {
    violations.push({
      type: 'connection-leak',
      line: acquires[0]!.line,
      column: acquires[0]!.column,
      match: acquires[0]!.match,
      message: 'Connection acquired but no release detected - potential connection leak',
    });
  }

  // Extract pool settings
  const poolSettings: Record<string, string> = {};
  for (const pattern of patterns) {
    if (pattern.value) {
      poolSettings[pattern.type] = pattern.value;
    }
  }

  const hasPoolConfig = patterns.some((p) => p.type === 'pool-config' || p.type === 'pool-size');

  return {
    patterns,
    violations,
    hasPoolConfig,
    poolSettings,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class ConnectionPoolingDetector extends RegexDetector {
  readonly id = 'data-access/connection-pooling';
  readonly name = 'Connection Pooling Detector';
  readonly description = 'Detects database connection pooling patterns and potential leaks';
  readonly category: PatternCategory = 'data-access';
  readonly subcategory = 'connection-pooling';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeConnectionPooling(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      file: context.file,
      line: v.line,
      column: v.column,
      type: v.type,
      value: v.match,
      issue: v.message,
      severity: 'warning',
    }));

    const confidence = analysis.hasPoolConfig ? 0.9 : 0.7;
    return this.createResult([], violations, confidence, {
      custom: {
        patterns: analysis.patterns,
        hasPoolConfig: analysis.hasPoolConfig,
        poolSettings: analysis.poolSettings,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createConnectionPoolingDetector(): ConnectionPoolingDetector {
  return new ConnectionPoolingDetector();
}
