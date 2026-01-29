/**
 * Rate Limiting Detector - LEARNING VERSION
 *
 * Learns rate limiting patterns from the user's codebase:
 * - Rate limiting library preferences
 * - Configuration patterns
 * - Middleware usage
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

export type RateLimitLibrary = 'express-rate-limit' | 'rate-limiter-flexible' | 'bottleneck' | 'custom';

export interface RateLimitingConventions {
  [key: string]: unknown;
  library: RateLimitLibrary;
  usesMiddleware: boolean;
  usesRedisStore: boolean;
}

interface RateLimitPatternInfo {
  library: RateLimitLibrary;
  isMiddleware: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractRateLimitPatterns(content: string, file: string): RateLimitPatternInfo[] {
  const results: RateLimitPatternInfo[] = [];

  const patterns: Array<{ regex: RegExp; library: RateLimitLibrary }> = [
    { regex: /rateLimit\s*\(|express-rate-limit/g, library: 'express-rate-limit' },
    { regex: /RateLimiterRedis|RateLimiterMemory|rate-limiter-flexible/g, library: 'rate-limiter-flexible' },
    { regex: /Bottleneck|new\s+Bottleneck/g, library: 'bottleneck' },
  ];

  for (const { regex, library } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        library,
        isMiddleware: /app\.use|router\.use/.test(content),
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Rate Limiting Detector
// ============================================================================

export class RateLimitingLearningDetector extends LearningDetector<RateLimitingConventions> {
  readonly id = 'security/rate-limiting';
  readonly category = 'security' as const;
  readonly subcategory = 'rate-limiting';
  readonly name = 'Rate Limiting Detector (Learning)';
  readonly description = 'Learns rate limiting patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof RateLimitingConventions> {
    return ['library', 'usesMiddleware', 'usesRedisStore'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof RateLimitingConventions, ValueDistribution>
  ): void {
    const patterns = extractRateLimitPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const libraryDist = distributions.get('library')!;
    const middlewareDist = distributions.get('usesMiddleware')!;

    for (const pattern of patterns) {
      libraryDist.add(pattern.library, context.file);
      middlewareDist.add(pattern.isMiddleware, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<RateLimitingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const rateLimitPatterns = extractRateLimitPatterns(context.content, context.file);
    if (rateLimitPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedLibrary = conventions.conventions.library?.value;

    // Check library consistency
    if (learnedLibrary) {
      for (const pattern of rateLimitPatterns) {
        if (pattern.library !== learnedLibrary) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'rate limiting library', pattern.library, learnedLibrary,
            `Using ${pattern.library} but project uses ${learnedLibrary}`
          ));
        }
      }
    }

    if (rateLimitPatterns.length > 0) {
      const first = rateLimitPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/rate-limit`,
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

export function createRateLimitingLearningDetector(): RateLimitingLearningDetector {
  return new RateLimitingLearningDetector();
}
