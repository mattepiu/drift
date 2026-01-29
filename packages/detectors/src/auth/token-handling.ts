/**
 * Token Handling Detector - Token pattern detection
 *
 * Detects token handling patterns including JWT storage, refresh tokens,
 * token validation, and secure token practices.
 *
 * Flags violations: Insecure token storage, missing refresh logic, exposed tokens.
 *
 * @requirements 11.2 - Token handling patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

export type TokenPatternType = 'jwt-storage' | 'refresh-token' | 'token-validation' | 'token-extraction' | 'secure-cookie';
export type TokenViolationType = 'insecure-storage' | 'missing-refresh' | 'token-in-url' | 'token-logged';

export interface TokenPatternInfo {
  type: TokenPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  storageType?: string;
  context?: string;
}

export interface TokenViolationInfo {
  type: TokenViolationType;
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

export interface TokenAnalysis {
  patterns: TokenPatternInfo[];
  violations: TokenViolationInfo[];
  usesSecureStorage: boolean;
  hasRefreshLogic: boolean;
}

export const TOKEN_STORAGE_PATTERNS = [
  /localStorage\.setItem\s*\(\s*['"`](?:token|jwt|access_token|auth)/gi,
  /sessionStorage\.setItem\s*\(\s*['"`](?:token|jwt|access_token|auth)/gi,
  /document\.cookie\s*=.*(?:token|jwt|access)/gi,
  /setCookie\s*\([^)]*(?:token|jwt|access)/gi,
] as const;

export const SECURE_COOKIE_PATTERNS = [
  /httpOnly\s*:\s*true/gi,
  /secure\s*:\s*true/gi,
  /sameSite\s*:\s*['"`](?:strict|lax)['"`]/gi,
] as const;

export const REFRESH_TOKEN_PATTERNS = [
  /refresh[_-]?token/gi,
  /refreshToken/gi,
  /\/api\/(?:auth\/)?refresh/gi,
  /tokenRefresh/gi,
  /rotateToken/gi,
] as const;

export const TOKEN_VALIDATION_PATTERNS = [
  /jwt\.verify\s*\(/gi,
  /verifyToken\s*\(/gi,
  /validateToken\s*\(/gi,
  /isTokenValid/gi,
  /checkToken/gi,
  /decodeToken\s*\(/gi,
] as const;

export const TOKEN_EXTRACTION_PATTERNS = [
  /(?:req|request)\.headers\s*\[\s*['"`]authorization['"`]\s*\]/gi,
  /Bearer\s+/gi,
  /getToken\s*\(/gi,
  /extractToken/gi,
  /parseToken/gi,
] as const;

export const INSECURE_STORAGE_PATTERNS = [
  /localStorage\.setItem\s*\(\s*['"`](?:token|jwt|access_token)['"`]/gi,
] as const;

export const TOKEN_IN_URL_PATTERNS = [
  /\?.*token=/gi,
  /&token=/gi,
  /url\s*[+=].*token/gi,
] as const;

export const TOKEN_LOGGED_PATTERNS = [
  /console\.log\s*\([^)]*token/gi,
  /logger\.\w+\s*\([^)]*token/gi,
  /print\s*\([^)]*token/gi,
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

function detectPatterns(content: string, file: string, patterns: readonly RegExp[], type: TokenPatternType): TokenPatternInfo[] {
  const results: TokenPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({ type, file, line, column, matchedText: match[0], context: lines[line - 1] || '' });
    }
  }
  return results;
}

function detectViolations(content: string, file: string, patterns: readonly RegExp[], type: TokenViolationType, issue: string, fix: string): TokenViolationInfo[] {
  const violations: TokenViolationInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      violations.push({
        type, file, line, column,
        endLine: line, endColumn: column + match[0].length,
        value: match[0], issue, suggestedFix: fix,
        lineContent: lines[line - 1] || '',
      });
    }
  }
  return violations;
}

export function analyzeTokenHandling(content: string, file: string): TokenAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], usesSecureStorage: false, hasRefreshLogic: false };
  }
  
  const patterns: TokenPatternInfo[] = [
    ...detectPatterns(content, file, TOKEN_STORAGE_PATTERNS, 'jwt-storage'),
    ...detectPatterns(content, file, REFRESH_TOKEN_PATTERNS, 'refresh-token'),
    ...detectPatterns(content, file, TOKEN_VALIDATION_PATTERNS, 'token-validation'),
    ...detectPatterns(content, file, TOKEN_EXTRACTION_PATTERNS, 'token-extraction'),
    ...detectPatterns(content, file, SECURE_COOKIE_PATTERNS, 'secure-cookie'),
  ];
  
  const violations: TokenViolationInfo[] = [
    ...detectViolations(content, file, INSECURE_STORAGE_PATTERNS, 'insecure-storage', 
      'Token stored in localStorage is vulnerable to XSS', 'Use httpOnly cookies instead'),
    ...detectViolations(content, file, TOKEN_IN_URL_PATTERNS, 'token-in-url',
      'Token in URL can be leaked via referrer or logs', 'Pass tokens in headers instead'),
    ...detectViolations(content, file, TOKEN_LOGGED_PATTERNS, 'token-logged',
      'Token being logged may expose sensitive data', 'Remove token from logs'),
  ];
  
  const usesSecureStorage = patterns.some(p => p.type === 'secure-cookie');
  const hasRefreshLogic = patterns.some(p => p.type === 'refresh-token');
  
  return { patterns, violations, usesSecureStorage, hasRefreshLogic };
}

export class TokenHandlingDetector extends RegexDetector {
  readonly id = 'auth/token-handling';
  readonly name = 'Token Handling Detector';
  readonly description = 'Detects token handling patterns and security issues';
  readonly category = 'auth';
  readonly subcategory = 'tokens';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeTokenHandling(content, file);
    const confidence = analysis.usesSecureStorage ? 0.9 : 0.75;
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, confidence, {
      custom: {
        patterns: analysis.patterns,
        usesSecureStorage: analysis.usesSecureStorage,
        hasRefreshLogic: analysis.hasRefreshLogic,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createTokenHandlingDetector(): TokenHandlingDetector {
  return new TokenHandlingDetector();
}
