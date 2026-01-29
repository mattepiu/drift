/**
 * Rate Limiting Detector - Rate limiting and throttling pattern detection
 *
 * Detects rate limiting patterns including:
 * - Rate limiter middleware
 * - Throttling implementations
 * - Request quotas
 * - Sliding window patterns
 * - Token bucket algorithms
 *
 * @requirements 16.7 - Rate limiting patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type RateLimitPatternType =
  | 'rate-limiter'
  | 'throttle'
  | 'request-quota'
  | 'sliding-window'
  | 'token-bucket'
  | 'leaky-bucket'
  | 'fixed-window'
  | 'redis-rate-limit';

export type RateLimitViolationType =
  | 'missing-rate-limit'
  | 'weak-rate-limit'
  | 'no-ip-tracking'
  | 'no-user-tracking'
  | 'hardcoded-limits';

export interface RateLimitPatternInfo {
  type: RateLimitPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  algorithm?: string | undefined;
  library?: string | undefined;
  context?: string | undefined;
}

export interface RateLimitViolationInfo {
  type: RateLimitViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface RateLimitAnalysis {
  patterns: RateLimitPatternInfo[];
  violations: RateLimitViolationInfo[];
  hasRateLimiting: boolean;
  usesRedis: boolean;
  algorithm?: string | undefined;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const RATE_LIMITER_PATTERNS = [
  // TypeScript/JavaScript patterns
  /rateLimit\s*\(/gi,
  /rateLimiter/gi,
  /RateLimiter/gi,
  /rate-limit/gi,
  /express-rate-limit/gi,
  /koa-ratelimit/gi,
  /fastify-rate-limit/gi,
  /@nestjs\/throttler/gi,
  /rate_limit/gi,
  /RateLimit/gi,
  /slowDown\s*\(/gi,
  /express-slow-down/gi,
  // Python patterns - FastAPI, Flask, Django
  /slowapi/gi,
  /Limiter\s*\(/gi,
  /@limiter\.limit\s*\(/gi,
  /RateLimitMiddleware/gi,
  /flask_limiter/gi,
  /django_ratelimit/gi,
  /@ratelimit\s*\(/gi,
] as const;

export const THROTTLE_PATTERNS = [
  /throttle\s*\(/gi,
  /Throttle\s*\(/gi,
  /throttler/gi,
  /Throttler/gi,
  /ThrottlerModule/gi,
  /ThrottlerGuard/gi,
  /@Throttle\s*\(/gi,
  /useThrottle/gi,
  /withThrottle/gi,
  /throttleTime/gi,
  /debounceTime/gi,
] as const;

export const REQUEST_QUOTA_PATTERNS = [
  /quota/gi,
  /requestQuota/gi,
  /apiQuota/gi,
  /usageLimit/gi,
  /dailyLimit/gi,
  /monthlyLimit/gi,
  /requestsPerDay/gi,
  /requestsPerHour/gi,
  /maxRequests/gi,
  /requestCount/gi,
] as const;

export const SLIDING_WINDOW_PATTERNS = [
  /slidingWindow/gi,
  /sliding-window/gi,
  /sliding_window/gi,
  /windowMs/gi,
  /windowSize/gi,
  /timeWindow/gi,
  /rollingWindow/gi,
] as const;

export const TOKEN_BUCKET_PATTERNS = [
  /tokenBucket/gi,
  /token-bucket/gi,
  /token_bucket/gi,
  /TokenBucket/gi,
  /bucketSize/gi,
  /tokensPerInterval/gi,
  /refillRate/gi,
  /limiter\.consume/gi,
  /rate-limiter-flexible/gi,
  /RateLimiterMemory/gi,
  /RateLimiterRedis/gi,
] as const;

export const LEAKY_BUCKET_PATTERNS = [
  /leakyBucket/gi,
  /leaky-bucket/gi,
  /leaky_bucket/gi,
  /LeakyBucket/gi,
  /drainRate/gi,
  /bucketCapacity/gi,
] as const;

export const FIXED_WINDOW_PATTERNS = [
  /fixedWindow/gi,
  /fixed-window/gi,
  /fixed_window/gi,
  /FixedWindow/gi,
  /windowStart/gi,
  /resetTime/gi,
] as const;

export const REDIS_RATE_LIMIT_PATTERNS = [
  /redis.*rate/gi,
  /rate.*redis/gi,
  /ioredis.*limit/gi,
  /RedisStore/gi,
  /redis-rate-limiter/gi,
  /RateLimiterRedis/gi,
  /redisClient.*incr/gi,
  /redis\.incr/gi,
  /MULTI.*INCR.*EXPIRE.*EXEC/gi,
] as const;

// Violation patterns
export const WEAK_RATE_LIMIT_PATTERNS = [
  /max\s*:\s*(?:1000|10000|100000)/gi,
  /limit\s*:\s*(?:1000|10000|100000)/gi,
  /windowMs\s*:\s*(?:1000|60000)\s*[,}]/gi, // 1 second or 1 minute windows
  /points\s*:\s*(?:1000|10000)/gi,
] as const;

export const HARDCODED_LIMIT_PATTERNS = [
  /max\s*:\s*\d+\s*[,}]/gi,
  /limit\s*:\s*\d+\s*[,}]/gi,
  /points\s*:\s*\d+\s*[,}]/gi,
  /windowMs\s*:\s*\d+\s*[,}]/gi,
] as const;

export const API_ENDPOINT_PATTERNS = [
  // TypeScript/JavaScript patterns
  /app\.(?:get|post|put|patch|delete)\s*\(/gi,
  /router\.(?:get|post|put|patch|delete)\s*\(/gi,
  /@(?:Get|Post|Put|Patch|Delete)\s*\(/gi,
  /\.route\s*\(/gi,
  /fastify\.(?:get|post|put|patch|delete)\s*\(/gi,
  // Python patterns - FastAPI, Flask, Django
  /@app\.(?:get|post|put|patch|delete)\s*\(/gi,
  /@router\.(?:get|post|put|patch|delete)\s*\(/gi,
  /@api_view\s*\(\s*\[/gi,
  /path\s*\(\s*['"`]/gi,
  /url\s*\(\s*r?['"`]/gi,
  /def\s+\w+\s*\(\s*request/gi,
] as const;

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
    /\.min\.[jt]s$/,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectRateLimiters(
  content: string,
  filePath: string
): RateLimitPatternInfo[] {
  const results: RateLimitPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of RATE_LIMITER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        let library = 'unknown';
        if (/express-rate-limit/i.test(line)) {library = 'express-rate-limit';}
        else if (/koa-ratelimit/i.test(line)) {library = 'koa-ratelimit';}
        else if (/fastify-rate-limit/i.test(line)) {library = 'fastify-rate-limit';}
        else if (/slowDown|express-slow-down/i.test(line)) {library = 'express-slow-down';}

        results.push({
          type: 'rate-limiter',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          library,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectThrottling(
  content: string,
  filePath: string
): RateLimitPatternInfo[] {
  const results: RateLimitPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of THROTTLE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        let library = 'unknown';
        if (/ThrottlerModule|ThrottlerGuard|@Throttle/i.test(line)) {library = '@nestjs/throttler';}
        else if (/throttleTime|debounceTime/i.test(line)) {library = 'rxjs';}

        results.push({
          type: 'throttle',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          library,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectRequestQuotas(
  content: string,
  filePath: string
): RateLimitPatternInfo[] {
  const results: RateLimitPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REQUEST_QUOTA_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'request-quota',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectSlidingWindow(
  content: string,
  filePath: string
): RateLimitPatternInfo[] {
  const results: RateLimitPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SLIDING_WINDOW_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'sliding-window',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          algorithm: 'sliding-window',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectTokenBucket(
  content: string,
  filePath: string
): RateLimitPatternInfo[] {
  const results: RateLimitPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TOKEN_BUCKET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        let library = 'unknown';
        if (/rate-limiter-flexible|RateLimiter(?:Memory|Redis)/i.test(line)) {
          library = 'rate-limiter-flexible';
        }

        results.push({
          type: 'token-bucket',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          algorithm: 'token-bucket',
          library,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectLeakyBucket(
  content: string,
  filePath: string
): RateLimitPatternInfo[] {
  const results: RateLimitPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of LEAKY_BUCKET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'leaky-bucket',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          algorithm: 'leaky-bucket',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectFixedWindow(
  content: string,
  filePath: string
): RateLimitPatternInfo[] {
  const results: RateLimitPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of FIXED_WINDOW_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'fixed-window',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          algorithm: 'fixed-window',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectRedisRateLimit(
  content: string,
  filePath: string
): RateLimitPatternInfo[] {
  const results: RateLimitPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REDIS_RATE_LIMIT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'redis-rate-limit',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          library: 'redis',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectWeakRateLimits(
  content: string,
  filePath: string
): RateLimitViolationInfo[] {
  const results: RateLimitViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of WEAK_RATE_LIMIT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'weak-rate-limit',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Rate limit may be too permissive',
          suggestedFix: 'Consider stricter limits based on your use case',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectHardcodedLimits(
  content: string,
  filePath: string
): RateLimitViolationInfo[] {
  const results: RateLimitViolationInfo[] = [];
  const lines = content.split('\n');

  // Only flag if there's rate limiting but limits are hardcoded
  const hasRateLimiting = RATE_LIMITER_PATTERNS.some((p) =>
    new RegExp(p.source, p.flags).test(content)
  );

  if (!hasRateLimiting) {return results;}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip if using environment variables
    if (/process\.env|import\.meta\.env/.test(line)) {continue;}

    for (const pattern of HARDCODED_LIMIT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'hardcoded-limits',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Rate limit values are hardcoded',
          suggestedFix: 'Use environment variables for rate limit configuration',
          severity: 'low',
        });
      }
    }
  }

  return results;
}

export function detectMissingRateLimits(
  content: string,
  filePath: string
): RateLimitViolationInfo[] {
  const results: RateLimitViolationInfo[] = [];

  // Check if this is a route/controller file
  const isRouteFile =
    /route|controller|handler|endpoint/i.test(filePath) ||
    API_ENDPOINT_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(content));

  if (!isRouteFile) {return results;}

  // Check if rate limiting is present
  const hasRateLimiting =
    RATE_LIMITER_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(content)) ||
    THROTTLE_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(content));

  if (!hasRateLimiting) {
    // Find the first API endpoint to report the violation
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const pattern of API_ENDPOINT_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        const match = regex.exec(line);
        if (match) {
          results.push({
            type: 'missing-rate-limit',
            file: filePath,
            line: i + 1,
            column: match.index + 1,
            matchedText: match[0],
            issue: 'API endpoint without rate limiting',
            suggestedFix: 'Add rate limiting middleware to protect against abuse',
            severity: 'high',
          });
          return results; // Only report once per file
        }
      }
    }
  }

  return results;
}

export function analyzeRateLimiting(
  content: string,
  filePath: string
): RateLimitAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasRateLimiting: false,
      usesRedis: false,
      confidence: 1.0,
    };
  }

  const patterns: RateLimitPatternInfo[] = [
    ...detectRateLimiters(content, filePath),
    ...detectThrottling(content, filePath),
    ...detectRequestQuotas(content, filePath),
    ...detectSlidingWindow(content, filePath),
    ...detectTokenBucket(content, filePath),
    ...detectLeakyBucket(content, filePath),
    ...detectFixedWindow(content, filePath),
    ...detectRedisRateLimit(content, filePath),
  ];

  const violations: RateLimitViolationInfo[] = [
    ...detectWeakRateLimits(content, filePath),
    ...detectHardcodedLimits(content, filePath),
    ...detectMissingRateLimits(content, filePath),
  ];

  const hasRateLimiting = patterns.some(
    (p) => p.type === 'rate-limiter' || p.type === 'throttle' || p.type === 'token-bucket'
  );
  const usesRedis = patterns.some((p) => p.type === 'redis-rate-limit');

  // Determine algorithm
  let algorithm: string | undefined;
  const algorithmPattern = patterns.find(
    (p) => p.type === 'sliding-window' || p.type === 'token-bucket' ||
           p.type === 'leaky-bucket' || p.type === 'fixed-window'
  );
  if (algorithmPattern) {
    algorithm = algorithmPattern.algorithm;
  }

  let confidence = 0.7;
  if (hasRateLimiting) {confidence += 0.15;}
  if (usesRedis) {confidence += 0.1;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    hasRateLimiting,
    usesRedis,
    algorithm,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class RateLimitingDetector extends RegexDetector {
  readonly id = 'security/rate-limiting';
  readonly name = 'Rate Limiting Detector';
  readonly description =
    'Detects rate limiting patterns and identifies missing or weak rate limits';
  readonly category: PatternCategory = 'security';
  readonly subcategory = 'rate-limiting';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeRateLimiting(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    // Map severity: high -> error, medium -> warning, low -> info
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      file: v.file,
      line: v.line,
      column: v.column,
      value: v.matchedText,
      issue: v.issue,
      suggestedFix: v.suggestedFix,
      severity: v.severity === 'high' ? 'error' : v.severity === 'medium' ? 'warning' : 'info',
    }));

    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasRateLimiting: analysis.hasRateLimiting,
        usesRedis: analysis.usesRedis,
        algorithm: analysis.algorithm,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createRateLimitingDetector(): RateLimitingDetector {
  return new RateLimitingDetector();
}
