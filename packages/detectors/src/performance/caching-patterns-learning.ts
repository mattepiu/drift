/**
 * Caching Patterns Detector - LEARNING VERSION
 *
 * Learns caching patterns from the user's codebase:
 * - Cache library preferences
 * - TTL conventions
 * - Cache key patterns
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

export type CacheLibrary = 'redis' | 'memcached' | 'node-cache' | 'lru-cache' | 'custom';
export type CacheKeyStyle = 'colon-separated' | 'slash-separated' | 'dot-separated';

export interface CachingPatternsConventions {
  [key: string]: unknown;
  library: CacheLibrary;
  keyStyle: CacheKeyStyle;
  usesPrefix: boolean;
}

interface CachePatternInfo {
  library: CacheLibrary;
  keyStyle: CacheKeyStyle | null;
  hasPrefix: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectKeyStyle(key: string): CacheKeyStyle | null {
  if (key.includes(':')) {return 'colon-separated';}
  if (key.includes('/')) {return 'slash-separated';}
  if (key.includes('.')) {return 'dot-separated';}
  return null;
}

function extractCachePatterns(content: string, file: string): CachePatternInfo[] {
  const results: CachePatternInfo[] = [];

  // Redis patterns
  const redisPattern = /redis\.\w+|createClient|ioredis/gi;
  let match;
  while ((match = redisPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      library: 'redis',
      keyStyle: null,
      hasPrefix: false,
      line,
      column,
      file,
    });
  }

  // Cache key patterns
  const keyPattern = /(?:cache|redis)\.(?:get|set|del)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((match = keyPattern.exec(content)) !== null) {
    const key = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      library: 'custom',
      keyStyle: detectKeyStyle(key),
      hasPrefix: key.includes(':') || key.includes('/'),
      line,
      column,
      file,
    });
  }

  // LRU Cache patterns
  const lruPattern = /new\s+LRUCache|lru-cache/g;
  while ((match = lruPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      library: 'lru-cache',
      keyStyle: null,
      hasPrefix: false,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Caching Patterns Detector
// ============================================================================

export class CachingPatternsLearningDetector extends LearningDetector<CachingPatternsConventions> {
  readonly id = 'performance/caching-patterns';
  readonly category = 'performance' as const;
  readonly subcategory = 'caching-patterns';
  readonly name = 'Caching Patterns Detector (Learning)';
  readonly description = 'Learns caching patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof CachingPatternsConventions> {
    return ['library', 'keyStyle', 'usesPrefix'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof CachingPatternsConventions, ValueDistribution>
  ): void {
    const patterns = extractCachePatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const libraryDist = distributions.get('library')!;
    const keyStyleDist = distributions.get('keyStyle')!;
    const prefixDist = distributions.get('usesPrefix')!;

    for (const pattern of patterns) {
      if (pattern.library !== 'custom') {
        libraryDist.add(pattern.library, context.file);
      }
      if (pattern.keyStyle) {
        keyStyleDist.add(pattern.keyStyle, context.file);
      }
      prefixDist.add(pattern.hasPrefix, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<CachingPatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const cachePatterns = extractCachePatterns(context.content, context.file);
    if (cachePatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedKeyStyle = conventions.conventions.keyStyle?.value;

    // Check key style consistency
    if (learnedKeyStyle) {
      for (const pattern of cachePatterns) {
        if (pattern.keyStyle && pattern.keyStyle !== learnedKeyStyle) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'cache key style', pattern.keyStyle, learnedKeyStyle,
            `Cache key uses ${pattern.keyStyle} but project uses ${learnedKeyStyle}`
          ));
        }
      }
    }

    if (cachePatterns.length > 0) {
      const first = cachePatterns[0]!;
      patterns.push({
        patternId: `${this.id}/cache`,
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

export function createCachingPatternsLearningDetector(): CachingPatternsLearningDetector {
  return new CachingPatternsLearningDetector();
}
