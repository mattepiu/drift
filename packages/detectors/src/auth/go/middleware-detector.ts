/**
 * Go Auth Middleware Detector
 *
 * Detects Go authentication and authorization middleware patterns:
 * - JWT middleware
 * - Session middleware
 * - API key middleware
 * - OAuth middleware
 * - RBAC patterns
 *
 * @requirements Go Language Support - Phase 8
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface GoAuthMiddlewareInfo {
  type: 'jwt' | 'session' | 'apikey' | 'oauth' | 'basic' | 'custom';
  name: string;
  framework?: string;
  line: number;
  column: number;
}

export interface GoRbacPatternInfo {
  type: 'role-check' | 'permission-check' | 'policy';
  name: string;
  line: number;
  column: number;
}


// ============================================================================
// Go Auth Middleware Detector Class
// ============================================================================

export class GoAuthMiddlewareDetector extends RegexDetector {
  readonly id = 'auth/go/middleware';
  readonly category = 'auth' as const;
  readonly subcategory = 'middleware';
  readonly name = 'Go Auth Middleware Detector';
  readonly description = 'Detects Go authentication and authorization middleware patterns';
  readonly supportedLanguages: Language[] = ['go'];

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (!context.file.endsWith('.go')) {
      return this.createResult(patterns, violations, 1.0);
    }

    const jwtPatterns = this.detectJwtMiddleware(context.content, context.file);
    patterns.push(...jwtPatterns);

    const sessionPatterns = this.detectSessionMiddleware(context.content, context.file);
    patterns.push(...sessionPatterns);

    const apiKeyPatterns = this.detectApiKeyMiddleware(context.content, context.file);
    patterns.push(...apiKeyPatterns);

    const oauthPatterns = this.detectOAuthMiddleware(context.content, context.file);
    patterns.push(...oauthPatterns);

    const rbacPatterns = this.detectRbacPatterns(context.content, context.file);
    patterns.push(...rbacPatterns);

    const genericPatterns = this.detectGenericAuthMiddleware(context.content, context.file);
    patterns.push(...genericPatterns);

    return this.createResult(patterns, violations, this.calculateConfidence(patterns));
  }


  private detectJwtMiddleware(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    const jwtParsePattern = /jwt\.(Parse|ParseWithClaims)\s*\(/g;
    const parseMatches = this.matchLines(content, jwtParsePattern);
    for (const match of parseMatches) {
      patterns.push({
        patternId: `${this.id}/jwt-parse`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    const jwtMiddlewarePattern = /func\s+(\w*[Jj][Ww][Tt]\w*[Mm]iddleware\w*)\s*\(/g;
    const middlewareMatches = this.matchLines(content, jwtMiddlewarePattern);
    for (const match of middlewareMatches) {
      patterns.push({
        patternId: `${this.id}/jwt-middleware`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    const jwtImportPattern = /github\.com\/[\w-]+\/(echo-jwt|gin-jwt|jwt-go|golang-jwt)/g;
    const importMatches = this.matchLines(content, jwtImportPattern);
    for (const match of importMatches) {
      patterns.push({
        patternId: `${this.id}/jwt-library`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    return patterns;
  }

  private detectSessionMiddleware(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    const sessionPattern = /session\.(Get|Set|Save|Destroy)\s*\(/g;
    const matches = this.matchLines(content, sessionPattern);
    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/session`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    const sessionImportPattern = /github\.com\/gorilla\/sessions/g;
    const importMatches = this.matchLines(content, sessionImportPattern);
    for (const match of importMatches) {
      patterns.push({
        patternId: `${this.id}/session-library`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    return patterns;
  }


  private detectApiKeyMiddleware(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    const apiKeyPattern = /r\.Header\.Get\s*\(\s*"(X-API-Key|Authorization|Api-Key)"/gi;
    const matches = this.matchLines(content, apiKeyPattern);
    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/apikey`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.85,
        isOutlier: false,
      });
    }

    const ginApiKeyPattern = /c\.GetHeader\s*\(\s*"(X-API-Key|Authorization|Api-Key)"/gi;
    const ginMatches = this.matchLines(content, ginApiKeyPattern);
    for (const match of ginMatches) {
      patterns.push({
        patternId: `${this.id}/apikey`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.85,
        isOutlier: false,
      });
    }

    return patterns;
  }

  private detectOAuthMiddleware(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    const oauthImportPattern = /golang\.org\/x\/oauth2/g;
    const importMatches = this.matchLines(content, oauthImportPattern);
    for (const match of importMatches) {
      patterns.push({
        patternId: `${this.id}/oauth-library`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    const oauthPattern = /oauth2\.(Config|Token|Exchange|TokenSource)/g;
    const matches = this.matchLines(content, oauthPattern);
    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/oauth`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    return patterns;
  }


  private detectRbacPatterns(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    const rbacPattern = /\.(HasRole|HasPermission|CheckRole|CheckPermission|RequireRole|RequirePermission)\s*\(/g;
    const matches = this.matchLines(content, rbacPattern);
    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/rbac`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    const casbinPattern = /github\.com\/casbin\/casbin/g;
    const casbinMatches = this.matchLines(content, casbinPattern);
    for (const match of casbinMatches) {
      patterns.push({
        patternId: `${this.id}/rbac-library`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    const enforcePattern = /(\w+)\.Enforce\s*\(/g;
    const enforceMatches = this.matchLines(content, enforcePattern);
    for (const match of enforceMatches) {
      patterns.push({
        patternId: `${this.id}/rbac-enforce`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.85,
        isOutlier: false,
      });
    }

    return patterns;
  }

  private detectGenericAuthMiddleware(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    const authMiddlewarePattern = /func\s+(\w*[Aa]uth\w*[Mm]iddleware\w*)\s*\(/g;
    const matches = this.matchLines(content, authMiddlewarePattern);
    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/generic`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.85,
        isOutlier: false,
      });
    }

    const requireAuthPattern = /func\s+(\w*[Rr]equire[Aa]uth\w*)\s*\(/g;
    const requireMatches = this.matchLines(content, requireAuthPattern);
    for (const match of requireMatches) {
      patterns.push({
        patternId: `${this.id}/require-auth`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.85,
        isOutlier: false,
      });
    }

    return patterns;
  }

  private calculateConfidence(patterns: PatternMatch[]): number {
    if (patterns.length === 0) {return 1.0;}
    return patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
  }
}

export function createGoAuthMiddlewareDetector(): GoAuthMiddlewareDetector {
  return new GoAuthMiddlewareDetector();
}
