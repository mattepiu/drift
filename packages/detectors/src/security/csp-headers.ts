/**
 * CSP Headers Detector - Content Security Policy pattern detection
 *
 * Detects CSP patterns including:
 * - CSP header configuration
 * - CSP meta tags
 * - Helmet CSP middleware
 * - Nonce and hash usage
 * - Directive patterns
 *
 * @requirements 16.5 - CSP header patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type CSPHeaderPatternType =
  | 'csp-header'
  | 'csp-meta'
  | 'helmet-csp'
  | 'csp-nonce'
  | 'csp-hash'
  | 'csp-directive'
  | 'report-uri';

export type CSPViolationType =
  | 'unsafe-inline'
  | 'unsafe-eval'
  | 'wildcard-source'
  | 'missing-csp';

export interface CSPHeaderPatternInfo {
  type: CSPHeaderPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  directive?: string | undefined;
  context?: string | undefined;
}

export interface CSPViolationInfo {
  type: CSPViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface CSPHeaderAnalysis {
  patterns: CSPHeaderPatternInfo[];
  violations: CSPViolationInfo[];
  hasCSP: boolean;
  usesNonce: boolean;
  usesHash: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const CSP_HEADER_PATTERNS = [
  /Content-Security-Policy/gi,
  /contentSecurityPolicy/gi,
  /['"`]Content-Security-Policy['"`]\s*[=:]/gi,
  /res\.setHeader\s*\(\s*['"`]Content-Security-Policy['"`]/gi,
  /response\.headers\s*\[\s*['"`]Content-Security-Policy['"`]\s*\]/gi,
] as const;

export const CSP_META_PATTERNS = [
  /<meta[^>]*http-equiv\s*=\s*['"`]Content-Security-Policy['"`]/gi,
  /httpEquiv\s*[=:]\s*['"`]Content-Security-Policy['"`]/gi,
] as const;

export const HELMET_CSP_PATTERNS = [
  /helmet\.contentSecurityPolicy\s*\(/gi,
  /helmet\s*\(\s*\{[^}]*contentSecurityPolicy/gi,
  /contentSecurityPolicy\s*:\s*\{/gi,
  /import.*helmet/gi,
  /require\s*\(\s*['"`]helmet['"`]\s*\)/gi,
] as const;

export const CSP_NONCE_PATTERNS = [
  /nonce-[a-zA-Z0-9+/=]+/gi,
  /'nonce-/gi,
  /nonce\s*[=:]\s*['"`][^'"`]+['"`]/gi,
  /generateNonce\s*\(/gi,
  /cspNonce/gi,
] as const;

export const CSP_HASH_PATTERNS = [
  /sha256-[a-zA-Z0-9+/=]+/gi,
  /sha384-[a-zA-Z0-9+/=]+/gi,
  /sha512-[a-zA-Z0-9+/=]+/gi,
  /'sha256-/gi,
  /'sha384-/gi,
  /'sha512-/gi,
] as const;

export const CSP_DIRECTIVE_PATTERNS = [
  /default-src\s+/gi,
  /script-src\s+/gi,
  /style-src\s+/gi,
  /img-src\s+/gi,
  /font-src\s+/gi,
  /connect-src\s+/gi,
  /frame-src\s+/gi,
  /object-src\s+/gi,
  /media-src\s+/gi,
  /child-src\s+/gi,
  /worker-src\s+/gi,
  /frame-ancestors\s+/gi,
  /form-action\s+/gi,
  /base-uri\s+/gi,
  /upgrade-insecure-requests/gi,
  /block-all-mixed-content/gi,
] as const;

export const REPORT_URI_PATTERNS = [
  /report-uri\s+/gi,
  /report-to\s+/gi,
  /reportUri\s*[=:]/gi,
  /reportTo\s*[=:]/gi,
] as const;

export const UNSAFE_INLINE_PATTERNS = [
  /'unsafe-inline'/gi,
  /unsafe-inline/gi,
] as const;

export const UNSAFE_EVAL_PATTERNS = [
  /'unsafe-eval'/gi,
  /unsafe-eval/gi,
] as const;

export const WILDCARD_SOURCE_PATTERNS = [
  /\*\s*;/gi,
  /['"`]\*['"`]/gi,
  /src\s*[=:]\s*\*/gi,
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

export function detectCSPHeaders(
  content: string,
  filePath: string
): CSPHeaderPatternInfo[] {
  const results: CSPHeaderPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CSP_HEADER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'csp-header',
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

export function detectCSPMeta(
  content: string,
  filePath: string
): CSPHeaderPatternInfo[] {
  const results: CSPHeaderPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CSP_META_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'csp-meta',
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

export function detectHelmetCSP(
  content: string,
  filePath: string
): CSPHeaderPatternInfo[] {
  const results: CSPHeaderPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of HELMET_CSP_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'helmet-csp',
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

export function detectCSPNonce(
  content: string,
  filePath: string
): CSPHeaderPatternInfo[] {
  const results: CSPHeaderPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CSP_NONCE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'csp-nonce',
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

export function detectCSPHash(
  content: string,
  filePath: string
): CSPHeaderPatternInfo[] {
  const results: CSPHeaderPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CSP_HASH_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'csp-hash',
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

export function detectCSPDirectives(
  content: string,
  filePath: string
): CSPHeaderPatternInfo[] {
  const results: CSPHeaderPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CSP_DIRECTIVE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'csp-directive',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          directive: match[0].trim(),
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectReportURI(
  content: string,
  filePath: string
): CSPHeaderPatternInfo[] {
  const results: CSPHeaderPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REPORT_URI_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'report-uri',
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

export function detectUnsafeInlineViolations(
  content: string,
  filePath: string
): CSPViolationInfo[] {
  const results: CSPViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of UNSAFE_INLINE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'unsafe-inline',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'unsafe-inline in CSP weakens XSS protection',
          suggestedFix: 'Use nonces or hashes instead of unsafe-inline',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function detectUnsafeEvalViolations(
  content: string,
  filePath: string
): CSPViolationInfo[] {
  const results: CSPViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of UNSAFE_EVAL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'unsafe-eval',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'unsafe-eval in CSP allows eval() and similar functions',
          suggestedFix: 'Remove unsafe-eval and refactor code to avoid eval',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectWildcardSourceViolations(
  content: string,
  filePath: string
): CSPViolationInfo[] {
  const results: CSPViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of WILDCARD_SOURCE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'wildcard-source',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Wildcard source in CSP allows loading from any origin',
          suggestedFix: 'Specify explicit allowed origins instead of wildcard',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeCSPHeaders(
  content: string,
  filePath: string
): CSPHeaderAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasCSP: false,
      usesNonce: false,
      usesHash: false,
      confidence: 1.0,
    };
  }

  const patterns: CSPHeaderPatternInfo[] = [
    ...detectCSPHeaders(content, filePath),
    ...detectCSPMeta(content, filePath),
    ...detectHelmetCSP(content, filePath),
    ...detectCSPNonce(content, filePath),
    ...detectCSPHash(content, filePath),
    ...detectCSPDirectives(content, filePath),
    ...detectReportURI(content, filePath),
  ];

  const violations: CSPViolationInfo[] = [
    ...detectUnsafeInlineViolations(content, filePath),
    ...detectUnsafeEvalViolations(content, filePath),
    ...detectWildcardSourceViolations(content, filePath),
  ];

  const hasCSP = patterns.some(
    (p) => p.type === 'csp-header' || p.type === 'csp-meta' || p.type === 'helmet-csp'
  );
  const usesNonce = patterns.some((p) => p.type === 'csp-nonce');
  const usesHash = patterns.some((p) => p.type === 'csp-hash');

  const confidence = hasCSP ? (usesNonce || usesHash ? 0.95 : 0.85) : 0.7;

  return {
    patterns,
    violations,
    hasCSP,
    usesNonce,
    usesHash,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class CSPHeadersDetector extends RegexDetector {
  readonly id = 'security/csp-headers';
  readonly name = 'CSP Headers Detector';
  readonly description =
    'Detects Content Security Policy patterns and identifies potential weaknesses';
  readonly category: PatternCategory = 'security';
  readonly subcategory = 'csp-headers';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeCSPHeaders(context.content, context.file);

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
        hasCSP: analysis.hasCSP,
        usesNonce: analysis.usesNonce,
        usesHash: analysis.usesHash,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createCSPHeadersDetector(): CSPHeadersDetector {
  return new CSPHeadersDetector();
}
