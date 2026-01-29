/**
 * Token Handling Detector - LEARNING VERSION
 *
 * Learns token handling patterns from the user's codebase:
 * - Token storage patterns
 * - Token validation patterns
 * - Refresh token patterns
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

export type TokenStorageMethod = 'localStorage' | 'sessionStorage' | 'cookie' | 'memory' | 'httpOnly';
export type TokenLibrary = 'jsonwebtoken' | 'jose' | 'jwt-decode' | 'custom';

export interface TokenHandlingConventions {
  [key: string]: unknown;
  storageMethod: TokenStorageMethod;
  library: TokenLibrary;
  usesRefreshTokens: boolean;
}

interface TokenPatternInfo {
  storageMethod: TokenStorageMethod | null;
  library: TokenLibrary | null;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractTokenPatterns(content: string, file: string): TokenPatternInfo[] {
  const results: TokenPatternInfo[] = [];

  // Storage patterns
  const storagePatterns: Array<{ regex: RegExp; method: TokenStorageMethod }> = [
    { regex: /localStorage\.(?:setItem|getItem)\s*\(\s*['"](?:token|accessToken|auth)/gi, method: 'localStorage' },
    { regex: /sessionStorage\.(?:setItem|getItem)\s*\(\s*['"](?:token|accessToken|auth)/gi, method: 'sessionStorage' },
    { regex: /document\.cookie|cookies\.set|setCookie/gi, method: 'cookie' },
    { regex: /httpOnly:\s*true/g, method: 'httpOnly' },
  ];

  for (const { regex, method } of storagePatterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        storageMethod: method,
        library: null,
        line,
        column,
        file,
      });
    }
  }

  // Library patterns
  const libraryPatterns: Array<{ regex: RegExp; library: TokenLibrary }> = [
    { regex: /jwt\.sign|jwt\.verify|jsonwebtoken/g, library: 'jsonwebtoken' },
    { regex: /jose\.|SignJWT|jwtVerify/g, library: 'jose' },
    { regex: /jwtDecode|jwt-decode/g, library: 'jwt-decode' },
  ];

  for (const { regex, library } of libraryPatterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        storageMethod: null,
        library,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Token Handling Detector
// ============================================================================

export class TokenHandlingLearningDetector extends LearningDetector<TokenHandlingConventions> {
  readonly id = 'auth/token-handling';
  readonly category = 'auth' as const;
  readonly subcategory = 'token-handling';
  readonly name = 'Token Handling Detector (Learning)';
  readonly description = 'Learns token handling patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof TokenHandlingConventions> {
    return ['storageMethod', 'library', 'usesRefreshTokens'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TokenHandlingConventions, ValueDistribution>
  ): void {
    const patterns = extractTokenPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const storageDist = distributions.get('storageMethod')!;
    const libraryDist = distributions.get('library')!;
    const refreshDist = distributions.get('usesRefreshTokens')!;

    const hasRefresh = /refreshToken|refresh_token/i.test(context.content);
    refreshDist.add(hasRefresh, context.file);

    for (const pattern of patterns) {
      if (pattern.storageMethod) {
        storageDist.add(pattern.storageMethod, context.file);
      }
      if (pattern.library) {
        libraryDist.add(pattern.library, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TokenHandlingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const tokenPatterns = extractTokenPatterns(context.content, context.file);
    if (tokenPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStorage = conventions.conventions.storageMethod?.value;
    const learnedLibrary = conventions.conventions.library?.value;

    // Check storage method consistency
    if (learnedStorage) {
      for (const pattern of tokenPatterns) {
        if (pattern.storageMethod && pattern.storageMethod !== learnedStorage) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'token storage', pattern.storageMethod, learnedStorage,
            `Using ${pattern.storageMethod} but project uses ${learnedStorage}`
          ));
        }
      }
    }

    // Check library consistency
    if (learnedLibrary) {
      for (const pattern of tokenPatterns) {
        if (pattern.library && pattern.library !== learnedLibrary) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'JWT library', pattern.library, learnedLibrary,
            `Using ${pattern.library} but project uses ${learnedLibrary}`
          ));
        }
      }
    }

    if (tokenPatterns.length > 0) {
      const first = tokenPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/token`,
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

export function createTokenHandlingLearningDetector(): TokenHandlingLearningDetector {
  return new TokenHandlingLearningDetector();
}
