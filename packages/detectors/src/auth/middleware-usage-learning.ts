/**
 * Auth Middleware Usage Detector - LEARNING VERSION
 *
 * Learns auth middleware patterns from the user's codebase:
 * - Middleware naming conventions
 * - Guard patterns
 * - Decorator usage
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

export type AuthMiddlewareStyle = 'middleware' | 'guard' | 'decorator' | 'hoc';

export interface AuthMiddlewareConventions {
  [key: string]: unknown;
  style: AuthMiddlewareStyle;
  namingPattern: string | null;
  usesDecorators: boolean;
}

interface AuthMiddlewareInfo {
  style: AuthMiddlewareStyle;
  name: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractAuthMiddlewarePatterns(content: string, file: string): AuthMiddlewareInfo[] {
  const results: AuthMiddlewareInfo[] = [];

  // Middleware patterns
  const middlewarePattern = /(?:auth|authenticate|requireAuth|isAuthenticated|checkAuth)\s*(?:Middleware|Guard)?\s*[=:]/gi;
  let match;
  while ((match = middlewarePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'middleware',
      name: match[0].replace(/\s*[=:]/, ''),
      line,
      column,
      file,
    });
  }

  // Guard patterns (NestJS style)
  const guardPattern = /@UseGuards\s*\(|AuthGuard|JwtAuthGuard|RolesGuard/g;
  while ((match = guardPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'guard',
      name: match[0],
      line,
      column,
      file,
    });
  }

  // Decorator patterns
  const decoratorPattern = /@(?:Authenticated|RequireAuth|Auth|Protected)\s*\(/g;
  while ((match = decoratorPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'decorator',
      name: match[0],
      line,
      column,
      file,
    });
  }

  // HOC patterns (React)
  const hocPattern = /withAuth|withAuthentication|requireAuthentication/g;
  while ((match = hocPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'hoc',
      name: match[0],
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Auth Middleware Detector
// ============================================================================

export class AuthMiddlewareLearningDetector extends LearningDetector<AuthMiddlewareConventions> {
  readonly id = 'auth/middleware-usage';
  readonly category = 'auth' as const;
  readonly subcategory = 'middleware-usage';
  readonly name = 'Auth Middleware Detector (Learning)';
  readonly description = 'Learns auth middleware patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof AuthMiddlewareConventions> {
    return ['style', 'namingPattern', 'usesDecorators'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof AuthMiddlewareConventions, ValueDistribution>
  ): void {
    const patterns = extractAuthMiddlewarePatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('style')!;
    const decoratorDist = distributions.get('usesDecorators')!;

    let hasDecorators = false;

    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
      if (pattern.style === 'decorator' || pattern.style === 'guard') {
        hasDecorators = true;
      }
    }

    decoratorDist.add(hasDecorators, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<AuthMiddlewareConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const authPatterns = extractAuthMiddlewarePatterns(context.content, context.file);
    if (authPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.style?.value;

    // Check style consistency
    if (learnedStyle) {
      for (const pattern of authPatterns) {
        if (pattern.style !== learnedStyle) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'auth middleware style', pattern.style, learnedStyle,
            `Using ${pattern.style} but project uses ${learnedStyle}`
          ));
        }
      }
    }

    if (authPatterns.length > 0) {
      const first = authPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/auth-middleware`,
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

export function createAuthMiddlewareLearningDetector(): AuthMiddlewareLearningDetector {
  return new AuthMiddlewareLearningDetector();
}
