/**
 * CSRF Protection Detector - Cross-Site Request Forgery protection pattern detection
 *
 * Detects CSRF protection patterns including:
 * - CSRF token generation and validation
 * - CSRF middleware (csurf, csrf)
 * - SameSite cookie attributes
 * - Double submit cookie pattern
 * - Origin/Referer header validation
 *
 * @requirements 16.4 - CSRF protection patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type CSRFProtectionPatternType =
  | 'csrf-token'
  | 'csrf-middleware'
  | 'same-site-cookie'
  | 'double-submit'
  | 'origin-validation'
  | 'referer-validation'
  | 'csrf-header';

export type CSRFViolationType =
  | 'missing-csrf-token'
  | 'insecure-cookie'
  | 'missing-same-site';

export interface CSRFProtectionPatternInfo {
  type: CSRFProtectionPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  context?: string | undefined;
}

export interface CSRFViolationInfo {
  type: CSRFViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface CSRFProtectionAnalysis {
  patterns: CSRFProtectionPatternInfo[];
  violations: CSRFViolationInfo[];
  hasCSRFProtection: boolean;
  hasSameSiteCookies: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const CSRF_TOKEN_PATTERNS = [
  // TypeScript/JavaScript patterns
  /csrfToken/gi,
  /csrf_token/gi,
  /xsrfToken/gi,
  /xsrf_token/gi,
  /_csrf/gi,
  /anti-csrf/gi,
  /generateCsrfToken\s*\(/gi,
  /validateCsrfToken\s*\(/gi,
  /verifyCsrfToken\s*\(/gi,
  // Python patterns - Django, Flask
  /csrf_protect/gi,
  /CSRFProtect/gi,
  /@csrf_exempt/gi,
  /csrf_token\s*\(/gi,
  /get_token\s*\(/gi,
  /CsrfViewMiddleware/gi,
] as const;

export const CSRF_MIDDLEWARE_PATTERNS = [
  /csurf\s*\(/gi,
  /csrf\s*\(/gi,
  /csrfProtection/gi,
  /lusca\.csrf\s*\(/gi,
  /helmet\.csrf\s*\(/gi,
  /import.*csurf/gi,
  /require\s*\(\s*['"`]csurf['"`]\s*\)/gi,
] as const;

export const SAME_SITE_COOKIE_PATTERNS = [
  /sameSite\s*[=:]\s*['"`](?:strict|lax|none)['"`]/gi,
  /SameSite\s*=\s*(?:Strict|Lax|None)/gi,
  /cookie\s*\(\s*\{[^}]*sameSite/gi,
  /cookieOptions\s*[=:]\s*\{[^}]*sameSite/gi,
] as const;

export const DOUBLE_SUBMIT_PATTERNS = [
  /doubleSubmit/gi,
  /double-submit/gi,
  /csrfCookie/gi,
  /csrf-cookie/gi,
] as const;

export const ORIGIN_VALIDATION_PATTERNS = [
  // TypeScript/JavaScript patterns
  /req\.headers\s*\[\s*['"`]origin['"`]\s*\]/gi,
  /request\.headers\.origin/gi,
  /validateOrigin\s*\(/gi,
  /checkOrigin\s*\(/gi,
  /allowedOrigins/gi,
  // Python patterns - FastAPI, Flask
  /request\.headers\.get\s*\(\s*['"`]origin['"`]/gi,
  /validate_origin\s*\(/gi,
  /check_origin\s*\(/gi,
  /allowed_origins/gi,
  /CORSMiddleware/gi,
] as const;

export const REFERER_VALIDATION_PATTERNS = [
  /req\.headers\s*\[\s*['"`]referer['"`]\s*\]/gi,
  /request\.headers\.referer/gi,
  /validateReferer\s*\(/gi,
  /checkReferer\s*\(/gi,
] as const;

export const CSRF_HEADER_PATTERNS = [
  /x-csrf-token/gi,
  /x-xsrf-token/gi,
  /x-requested-with/gi,
  /csrf-token/gi,
] as const;

export const INSECURE_COOKIE_PATTERNS = [
  /httpOnly\s*[=:]\s*false/gi,
  /secure\s*[=:]\s*false/gi,
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

export function detectCSRFTokens(
  content: string,
  filePath: string
): CSRFProtectionPatternInfo[] {
  const results: CSRFProtectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CSRF_TOKEN_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'csrf-token',
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

export function detectCSRFMiddleware(
  content: string,
  filePath: string
): CSRFProtectionPatternInfo[] {
  const results: CSRFProtectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CSRF_MIDDLEWARE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'csrf-middleware',
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

export function detectSameSiteCookies(
  content: string,
  filePath: string
): CSRFProtectionPatternInfo[] {
  const results: CSRFProtectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SAME_SITE_COOKIE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'same-site-cookie',
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

export function detectDoubleSubmit(
  content: string,
  filePath: string
): CSRFProtectionPatternInfo[] {
  const results: CSRFProtectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DOUBLE_SUBMIT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'double-submit',
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

export function detectOriginValidation(
  content: string,
  filePath: string
): CSRFProtectionPatternInfo[] {
  const results: CSRFProtectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ORIGIN_VALIDATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'origin-validation',
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

export function detectRefererValidation(
  content: string,
  filePath: string
): CSRFProtectionPatternInfo[] {
  const results: CSRFProtectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REFERER_VALIDATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'referer-validation',
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

export function detectCSRFHeaders(
  content: string,
  filePath: string
): CSRFProtectionPatternInfo[] {
  const results: CSRFProtectionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CSRF_HEADER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'csrf-header',
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

export function detectInsecureCookieViolations(
  content: string,
  filePath: string
): CSRFViolationInfo[] {
  const results: CSRFViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of INSECURE_COOKIE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'insecure-cookie',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Insecure cookie configuration detected',
          suggestedFix: 'Set httpOnly: true and secure: true for sensitive cookies',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeCSRFProtection(
  content: string,
  filePath: string
): CSRFProtectionAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasCSRFProtection: false,
      hasSameSiteCookies: false,
      confidence: 1.0,
    };
  }

  const patterns: CSRFProtectionPatternInfo[] = [
    ...detectCSRFTokens(content, filePath),
    ...detectCSRFMiddleware(content, filePath),
    ...detectSameSiteCookies(content, filePath),
    ...detectDoubleSubmit(content, filePath),
    ...detectOriginValidation(content, filePath),
    ...detectRefererValidation(content, filePath),
    ...detectCSRFHeaders(content, filePath),
  ];

  const violations = detectInsecureCookieViolations(content, filePath);

  const hasCSRFProtection = patterns.some(
    (p) => p.type === 'csrf-token' || p.type === 'csrf-middleware'
  );
  const hasSameSiteCookies = patterns.some((p) => p.type === 'same-site-cookie');

  const confidence = hasCSRFProtection ? 0.95 : hasSameSiteCookies ? 0.85 : 0.7;

  return {
    patterns,
    violations,
    hasCSRFProtection,
    hasSameSiteCookies,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class CSRFProtectionDetector extends RegexDetector {
  readonly id = 'security/csrf-protection';
  readonly name = 'CSRF Protection Detector';
  readonly description =
    'Detects CSRF protection patterns and identifies potential vulnerabilities';
  readonly category: PatternCategory = 'security';
  readonly subcategory = 'csrf-protection';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeCSRFProtection(context.content, context.file);

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
        hasCSRFProtection: analysis.hasCSRFProtection,
        hasSameSiteCookies: analysis.hasSameSiteCookies,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createCSRFProtectionDetector(): CSRFProtectionDetector {
  return new CSRFProtectionDetector();
}
