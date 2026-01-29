/**
 * Laravel Performance Patterns Detector - SEMANTIC VERSION
 *
 * Learns performance patterns from your Laravel codebase:
 * - Caching patterns (Cache facade, remember, tags)
 * - Eager loading (with, load, loadMissing)
 * - Query optimization (chunking, cursor, lazy)
 * - Queue patterns (dispatch, jobs)
 * - N+1 prevention
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

// ============================================================================
// Context Validation Patterns
// ============================================================================

const PERFORMANCE_FILE_PATTERNS = [
  /services\//i, /repositories\//i, /controllers\//i,
  /models\//i, /jobs\//i, /cache/i,
];

const PERFORMANCE_CONTEXT_KEYWORDS = [
  'illuminate\\support\\facades\\cache',
  'illuminate\\contracts\\cache',
  'illuminate\\support\\facades\\queue',
  'cache::', 'cache(', 'remember', 'rememberforever',
  'with(', 'load(', 'loadmissing(',
  'chunk(', 'cursor(', 'lazy(',
  'dispatch', 'dispatchsync', 'dispatchnow',
];

// ============================================================================
// Laravel Performance Semantic Detector
// ============================================================================

export class LaravelPerformanceSemanticDetector extends SemanticDetector {
  readonly id = 'performance/laravel-performance-semantic';
  readonly name = 'Laravel Performance Patterns Detector';
  readonly description = 'Learns performance patterns from your Laravel codebase';
  readonly category = 'performance' as const;
  readonly subcategory = 'laravel';

  override readonly supportedLanguages: Language[] = ['php'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: false,
    });
  }

  protected getSemanticKeywords(): string[] {
    return [
      // Caching
      'Cache', 'cache', 'remember', 'rememberForever', 'forever',
      'put', 'get', 'has', 'forget', 'flush',
      'tags', 'store', 'driver',
      'increment', 'decrement', 'lock',
      
      // Eager loading
      'with', 'load', 'loadMissing', 'loadCount', 'loadMorph',
      'withCount', 'withSum', 'withAvg', 'withMin', 'withMax',
      'without', 'withOnly',
      
      // Query optimization
      'chunk', 'chunkById', 'cursor', 'lazy', 'lazyById',
      'select', 'addSelect', 'distinct',
      'limit', 'take', 'skip', 'offset',
      
      // Indexing hints
      'useIndex', 'forceIndex', 'ignoreIndex',
      
      // Queue/Jobs
      'dispatch', 'dispatchSync', 'dispatchNow', 'dispatchAfterResponse',
      'Job', 'ShouldQueue', 'Queueable', 'InteractsWithQueue',
      'onQueue', 'onConnection', 'delay', 'afterCommit',
      'chain', 'batch', 'Bus',
      
      // Database transactions
      'transaction', 'beginTransaction', 'commit', 'rollBack',
      
      // Lazy collections
      'LazyCollection', 'lazy', 'cursor',
      
      // Response optimization
      'response', 'stream', 'streamDownload',
      
      // Route caching
      'routeCache', 'configCache', 'viewCache',
      
      // Octane
      'Octane', 'concurrently', 'tick',
    ];
  }

  protected getSemanticCategory(): string {
    return 'performance';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    // High-confidence keywords
    const highConfidenceKeywords = [
      'Cache', 'remember', 'rememberForever',
      'chunk', 'cursor', 'lazy',
      'dispatch', 'ShouldQueue', 'Job',
      'with', 'load', 'loadMissing',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      // Verify it's Laravel context
      if (keyword === 'with' && !lineContent.includes('->with(') && !lineContent.includes('::with(')) {
        return false;
      }
      return true;
    }

    // Skip comments
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // For ambiguous keywords, require performance context
    const ambiguousKeywords = ['get', 'put', 'has', 'forget', 'select', 'limit', 'transaction'];
    if (ambiguousKeywords.includes(keyword.toLowerCase())) {
      const hasContext = PERFORMANCE_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inPerformanceFile = PERFORMANCE_FILE_PATTERNS.some(p => p.test(file));
        if (!inPerformanceFile) {return false;}
      }
    }

    return true;
  }

  protected createPatternViolation(
    match: SemanticMatch,
    dominantPattern: UsagePattern
  ): Violation {
    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity: 'warning',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent performance pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for performance optimization in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelPerformanceSemanticDetector(): LaravelPerformanceSemanticDetector {
  return new LaravelPerformanceSemanticDetector();
}
