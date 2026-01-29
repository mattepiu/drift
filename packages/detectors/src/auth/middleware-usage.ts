/**
 * Middleware Usage Detector - Auth middleware pattern detection
 *
 * Detects auth middleware patterns including Express/Koa middleware, Next.js middleware,
 * route protection patterns, session validation, and JWT verification.
 *
 * Flags violations: Unprotected routes, inconsistent middleware usage, missing auth checks.
 *
 * @requirements 11.1 - Auth middleware patterns
 * @requirements 11.7 - Unprotected route detection
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

export type AuthMiddlewareType = 'express-middleware' | 'nextjs-middleware' | 'route-guard' | 'session-check' | 'api-key-check' | 'jwt-verify';
export type AuthMiddlewareViolationType = 'unprotected-route' | 'inconsistent-middleware' | 'missing-auth-check';

export interface AuthMiddlewarePatternInfo {
  type: AuthMiddlewareType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  middlewareName?: string;
  context?: string;
}

export interface AuthMiddlewareViolationInfo {
  type: AuthMiddlewareViolationType;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  value: string;
  issue: string;
  suggestedFix?: string;
  lineContent: string;
}

export interface AuthMiddlewareAnalysis {
  patterns: AuthMiddlewarePatternInfo[];
  violations: AuthMiddlewareViolationInfo[];
  hasAuthMiddleware: boolean;
  protectedRoutes: number;
  unprotectedRoutes: number;
}

// Constants (JavaScript/TypeScript + Python)
export const AUTH_MIDDLEWARE_PATTERNS = [
  // JavaScript/TypeScript
  /(?:requireAuth|isAuthenticated|authenticate|authMiddleware|withAuth|protected)\s*[,(]/gi,
  /middleware\s*:\s*\[?[^}\]]*(?:auth|protect|guard)/gi,
  /app\.use\s*\([^)]*(?:passport|session|jwt|auth)/gi,
  /router\.use\s*\([^)]*(?:auth|protect|verify)/gi,
  // Python FastAPI
  /Depends\s*\(\s*(?:get_current_user|verify_token|auth_required)/gi,
  /dependencies\s*=\s*\[[^\]]*(?:auth|verify|current_user)/gi,
  /@(?:requires_auth|login_required|authenticated)/gi,
] as const;

export const NEXTJS_MIDDLEWARE_PATTERNS = [
  /export\s+(?:default\s+)?function\s+middleware/gi,
  /NextResponse\.(?:redirect|rewrite)\s*\(/gi,
  /getServerSession\s*\(/gi,
  /getSession\s*\(/gi,
  /withAuth\s*\(/gi,
] as const;

export const JWT_PATTERNS = [
  // JavaScript/TypeScript
  /jwt\.verify\s*\(/gi,
  /jsonwebtoken/gi,
  /verifyToken\s*\(/gi,
  /decodeToken\s*\(/gi,
  /validateToken\s*\(/gi,
  // Python
  /jwt\.decode\s*\(/gi,
  /PyJWT/gi,
  /python-jose/gi,
  /verify_token\s*\(/gi,
  /decode_token\s*\(/gi,
] as const;

export const ROUTE_PATTERNS = [
  // JavaScript/TypeScript
  /app\.(get|post|put|patch|delete)\s*\(\s*['"`][^'"`]+['"`]/gi,
  /router\.(get|post|put|patch|delete)\s*\(\s*['"`][^'"`]+['"`]/gi,
  /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/gi,
  // Python FastAPI
  /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"][^'"]+['"]/gi,
] as const;

export const SENSITIVE_ROUTE_PATTERNS = [
  /\/api\/(?:admin|user|account|profile|settings|billing|payment)/i,
  /\/api\/v\d+\/(?:admin|user|account)/i,
  /\/dashboard/i,
  /\/admin/i,
] as const;

export const EXCLUDED_FILE_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /node_modules\//, /\.d\.ts$/];

export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(p => p.test(filePath));
}

function isInsideComment(content: string, index: number): boolean {
  const before = content.slice(0, index);
  const lastNewline = before.lastIndexOf('\n');
  const line = before.slice(lastNewline + 1);
  if (line.includes('//') && index - lastNewline - 1 > line.indexOf('//')) {return true;}
  return before.lastIndexOf('/*') > before.lastIndexOf('*/');
}

function getPosition(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

export function detectAuthMiddleware(content: string, file: string): AuthMiddlewarePatternInfo[] {
  const results: AuthMiddlewarePatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of AUTH_MIDDLEWARE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'express-middleware',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  
  for (const pattern of NEXTJS_MIDDLEWARE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'nextjs-middleware',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  
  for (const pattern of JWT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'jwt-verify',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  
  return results;
}

export function detectUnprotectedRoutes(content: string, file: string, hasAuth: boolean): AuthMiddlewareViolationInfo[] {
  const violations: AuthMiddlewareViolationInfo[] = [];
  const lines = content.split('\n');
  
  if (hasAuth) {return violations;}
  
  for (const routePattern of ROUTE_PATTERNS) {
    const regex = new RegExp(routePattern.source, routePattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      
      const isSensitive = SENSITIVE_ROUTE_PATTERNS.some(p => p.test(match![0]));
      if (isSensitive) {
        const { line, column } = getPosition(content, match.index);
        violations.push({
          type: 'unprotected-route',
          file, line, column,
          endLine: line,
          endColumn: column + match[0].length,
          value: match[0],
          issue: 'Sensitive route without visible auth middleware',
          suggestedFix: 'Add authentication middleware to protect this route',
          lineContent: lines[line - 1] || '',
        });
      }
    }
  }
  
  return violations;
}

export function analyzeAuthMiddleware(content: string, file: string): AuthMiddlewareAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], hasAuthMiddleware: false, protectedRoutes: 0, unprotectedRoutes: 0 };
  }
  
  const patterns = detectAuthMiddleware(content, file);
  const hasAuth = patterns.length > 0;
  const violations = detectUnprotectedRoutes(content, file, hasAuth);
  
  return {
    patterns,
    violations,
    hasAuthMiddleware: hasAuth,
    protectedRoutes: hasAuth ? patterns.length : 0,
    unprotectedRoutes: violations.length,
  };
}

export class AuthMiddlewareDetector extends RegexDetector {
  readonly id = 'auth/middleware-usage';
  readonly name = 'Auth Middleware Detector';
  readonly description = 'Detects auth middleware patterns and unprotected routes';
  readonly category = 'auth';
  readonly subcategory = 'middleware';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeAuthMiddleware(content, file);
    const confidence = analysis.hasAuthMiddleware ? 0.9 : 0.7;
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, confidence, {
      custom: {
        patterns: analysis.patterns,
        hasAuthMiddleware: analysis.hasAuthMiddleware,
        protectedRoutes: analysis.protectedRoutes,
        unprotectedRoutes: analysis.unprotectedRoutes,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createAuthMiddlewareDetector(): AuthMiddlewareDetector {
  return new AuthMiddlewareDetector();
}
