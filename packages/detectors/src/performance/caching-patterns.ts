/**
 * Caching Patterns Detector - Caching pattern detection
 *
 * Detects caching patterns including:
 * - HTTP caching headers
 * - Service worker caching
 * - React Query/SWR caching
 * - Redis/memory caching
 * - Browser storage caching
 *
 * @requirements 19.4 - Caching patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type CachingPatternType =
  | 'http-cache-control'
  | 'etag'
  | 'service-worker'
  | 'react-query'
  | 'swr'
  | 'redis-cache'
  | 'memory-cache'
  | 'local-storage'
  | 'session-storage'
  | 'indexed-db';

export type CachingViolationType =
  | 'no-cache-strategy'
  | 'missing-stale-time'
  | 'unbounded-cache';

export interface CachingPatternInfo {
  type: CachingPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  context?: string | undefined;
}

export interface CachingViolationInfo {
  type: CachingViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface CachingPatternsAnalysis {
  patterns: CachingPatternInfo[];
  violations: CachingViolationInfo[];
  httpCacheCount: number;
  clientCacheCount: number;
  usesReactQuery: boolean;
  usesSWR: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const HTTP_CACHE_CONTROL_PATTERNS = [
  /Cache-Control/gi,
  /cache-control/g,
  /max-age\s*=/g,
  /s-maxage\s*=/g,
  /stale-while-revalidate/g,
  /no-cache/g,
  /no-store/g,
] as const;

export const ETAG_PATTERNS = [
  /ETag/gi,
  /If-None-Match/gi,
  /If-Modified-Since/gi,
  /Last-Modified/gi,
] as const;

export const SERVICE_WORKER_PATTERNS = [
  /serviceWorker/g,
  /navigator\.serviceWorker/g,
  /CacheStorage/g,
  /caches\.open/g,
  /caches\.match/g,
  /workbox/gi,
] as const;

export const REACT_QUERY_PATTERNS = [
  /useQuery\s*\(/g,
  /useMutation\s*\(/g,
  /useInfiniteQuery\s*\(/g,
  /QueryClient/g,
  /QueryClientProvider/g,
  /@tanstack\/react-query/g,
  /staleTime/g,
  /cacheTime/g,
  /gcTime/g,
] as const;

export const SWR_PATTERNS = [
  /useSWR\s*\(/g,
  /useSWRMutation/g,
  /useSWRInfinite/g,
  /SWRConfig/g,
  /from\s+['"`]swr['"`]/g,
  /revalidateOnFocus/g,
  /revalidateOnReconnect/g,
] as const;

export const REDIS_CACHE_PATTERNS = [
  // JavaScript/TypeScript
  /redis/gi,
  /ioredis/g,
  /createClient/g,
  /\.get\s*\(/g,
  /\.set\s*\(/g,
  /\.setex\s*\(/g,
  /EXPIRE/g,
  // Python
  /redis\.Redis/gi,
  /redis\.StrictRedis/gi,
  /aioredis/gi,
  /redis_client/gi,
  /\.get\s*\(/g,
  /\.set\s*\(/g,
  /\.setex\s*\(/g,
] as const;

export const MEMORY_CACHE_PATTERNS = [
  // JavaScript/TypeScript
  /new\s+Map\s*\(/g,
  /new\s+WeakMap\s*\(/g,
  /lru-cache/g,
  /node-cache/g,
  /memory-cache/g,
  // Python
  /@lru_cache/g,
  /@cache/g,
  /functools\.lru_cache/g,
  /functools\.cache/g,
  /cachetools/gi,
  /TTLCache/g,
  /LRUCache/g,
] as const;

export const LOCAL_STORAGE_PATTERNS = [
  /localStorage\./g,
  /localStorage\[/g,
  /window\.localStorage/g,
] as const;

export const SESSION_STORAGE_PATTERNS = [
  /sessionStorage\./g,
  /sessionStorage\[/g,
  /window\.sessionStorage/g,
] as const;

export const INDEXED_DB_PATTERNS = [
  /indexedDB/g,
  /IDBDatabase/g,
  /openDB/g,
  /idb/g,
  /dexie/gi,
] as const;

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /node_modules\//,
    /\.min\.[jt]s$/,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

function detectPatterns(
  content: string,
  filePath: string,
  patterns: readonly RegExp[],
  type: CachingPatternType
): CachingPatternInfo[] {
  const results: CachingPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type,
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

export function detectHttpCacheControl(content: string, filePath: string): CachingPatternInfo[] {
  return detectPatterns(content, filePath, HTTP_CACHE_CONTROL_PATTERNS, 'http-cache-control');
}

export function detectEtag(content: string, filePath: string): CachingPatternInfo[] {
  return detectPatterns(content, filePath, ETAG_PATTERNS, 'etag');
}

export function detectServiceWorker(content: string, filePath: string): CachingPatternInfo[] {
  return detectPatterns(content, filePath, SERVICE_WORKER_PATTERNS, 'service-worker');
}

export function detectReactQuery(content: string, filePath: string): CachingPatternInfo[] {
  return detectPatterns(content, filePath, REACT_QUERY_PATTERNS, 'react-query');
}

export function detectSWR(content: string, filePath: string): CachingPatternInfo[] {
  return detectPatterns(content, filePath, SWR_PATTERNS, 'swr');
}

export function detectRedisCache(content: string, filePath: string): CachingPatternInfo[] {
  return detectPatterns(content, filePath, REDIS_CACHE_PATTERNS, 'redis-cache');
}

export function detectMemoryCache(content: string, filePath: string): CachingPatternInfo[] {
  return detectPatterns(content, filePath, MEMORY_CACHE_PATTERNS, 'memory-cache');
}

export function detectLocalStorage(content: string, filePath: string): CachingPatternInfo[] {
  return detectPatterns(content, filePath, LOCAL_STORAGE_PATTERNS, 'local-storage');
}

export function detectSessionStorage(content: string, filePath: string): CachingPatternInfo[] {
  return detectPatterns(content, filePath, SESSION_STORAGE_PATTERNS, 'session-storage');
}

export function detectIndexedDB(content: string, filePath: string): CachingPatternInfo[] {
  return detectPatterns(content, filePath, INDEXED_DB_PATTERNS, 'indexed-db');
}

export function analyzeCachingPatterns(
  content: string,
  filePath: string
): CachingPatternsAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      httpCacheCount: 0,
      clientCacheCount: 0,
      usesReactQuery: false,
      usesSWR: false,
      confidence: 1.0,
    };
  }

  const patterns: CachingPatternInfo[] = [
    ...detectHttpCacheControl(content, filePath),
    ...detectEtag(content, filePath),
    ...detectServiceWorker(content, filePath),
    ...detectReactQuery(content, filePath),
    ...detectSWR(content, filePath),
    ...detectRedisCache(content, filePath),
    ...detectMemoryCache(content, filePath),
    ...detectLocalStorage(content, filePath),
    ...detectSessionStorage(content, filePath),
    ...detectIndexedDB(content, filePath),
  ];

  const violations: CachingViolationInfo[] = [];

  const httpCacheCount = patterns.filter(
    (p) => p.type === 'http-cache-control' || p.type === 'etag'
  ).length;
  const clientCacheCount = patterns.filter(
    (p) => p.type === 'local-storage' || p.type === 'session-storage' || p.type === 'indexed-db'
  ).length;
  const usesReactQuery = patterns.some((p) => p.type === 'react-query');
  const usesSWR = patterns.some((p) => p.type === 'swr');

  let confidence = 0.7;
  if (patterns.length > 0) {confidence += 0.15;}
  if (usesReactQuery || usesSWR) {confidence += 0.1;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    httpCacheCount,
    clientCacheCount,
    usesReactQuery,
    usesSWR,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class CachingPatternsDetector extends RegexDetector {
  readonly id = 'performance/caching-patterns';
  readonly name = 'Caching Patterns Detector';
  readonly description = 'Detects caching patterns including HTTP, client, and server caching';
  readonly category: PatternCategory = 'performance';
  readonly subcategory = 'caching-patterns';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeCachingPatterns(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations.map(v => ({
      file: v.file,
      line: v.line,
      column: v.column,
      value: v.matchedText,
      issue: v.issue,
      suggestedFix: v.suggestedFix,
      severity: v.severity === 'high' ? 'error' as const : v.severity === 'medium' ? 'warning' as const : 'info' as const,
    })));

    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        httpCacheCount: analysis.httpCacheCount,
        clientCacheCount: analysis.clientCacheCount,
        usesReactQuery: analysis.usesReactQuery,
        usesSWR: analysis.usesSWR,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createCachingPatternsDetector(): CachingPatternsDetector {
  return new CachingPatternsDetector();
}
