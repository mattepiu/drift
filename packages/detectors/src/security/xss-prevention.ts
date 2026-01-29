/**
 * XSS Prevention Detector - Cross-Site Scripting prevention pattern detection
 *
 * Detects XSS prevention patterns including:
 * - HTML encoding/escaping
 * - Content sanitization (DOMPurify, sanitize-html)
 * - React's built-in XSS protection
 * - CSP nonce usage
 * - Dangerous patterns (innerHTML, dangerouslySetInnerHTML)
 *
 * @requirements 16.3 - XSS prevention patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type XSSPreventionPatternType =
  | 'html-escape'
  | 'dompurify-sanitize'
  | 'sanitize-html'
  | 'react-escape'
  | 'csp-nonce'
  | 'encode-uri'
  | 'text-content';

export type XSSViolationType =
  | 'dangerous-inner-html'
  | 'document-write'
  | 'eval-usage'
  | 'inner-html-assignment'
  | 'outer-html-assignment'
  | 'script-injection';

export interface XSSPreventionPatternInfo {
  type: XSSPreventionPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  library?: string | undefined;
  context?: string | undefined;
}

export interface XSSViolationInfo {
  type: XSSViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'high' | 'medium' | 'low';
}

export interface XSSPreventionAnalysis {
  patterns: XSSPreventionPatternInfo[];
  violations: XSSViolationInfo[];
  hasXSSPrevention: boolean;
  hasViolations: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const HTML_ESCAPE_PATTERNS = [
  // TypeScript/JavaScript patterns
  /escapeHtml\s*\(/gi,
  /htmlEscape\s*\(/gi,
  /encodeHTML\s*\(/gi,
  /htmlEncode\s*\(/gi,
  /escape\s*\(\s*['"`]html['"`]/gi,
  /he\.encode\s*\(/gi,
  /entities\.encode\s*\(/gi,
  /\.replace\s*\(\s*\/[<>&'"]/gi,
  // Python patterns - html.escape, markupsafe
  /html\.escape\s*\(/gi,
  /markupsafe\.escape\s*\(/gi,
  /Markup\s*\(/gi,
  /escape_html\s*\(/gi,
  /cgi\.escape\s*\(/gi,
] as const;

export const DOMPURIFY_PATTERNS = [
  /DOMPurify\.sanitize\s*\(/gi,
  /purify\.sanitize\s*\(/gi,
  /createDOMPurify\s*\(/gi,
  /import.*DOMPurify/gi,
  /require\s*\(\s*['"`]dompurify['"`]\s*\)/gi,
] as const;

export const SANITIZE_HTML_PATTERNS = [
  /sanitizeHtml\s*\(/gi,
  /sanitize-html/gi,
  /xss\s*\(/gi,
  /filterXSS\s*\(/gi,
  /import.*sanitize-html/gi,
  /import.*xss/gi,
] as const;

export const REACT_ESCAPE_PATTERNS = [
  /React\.createElement\s*\(/gi,
  /jsx\s*\(/gi,
  /\{[^}]+\}/g, // JSX expressions (auto-escaped)
  /createTextNode\s*\(/gi,
] as const;

export const CSP_NONCE_PATTERNS = [
  /nonce\s*[=:]\s*['"`][^'"`]+['"`]/gi,
  /nonce-[a-zA-Z0-9+/=]+/gi,
  /script-src[^;]*'nonce-/gi,
  /style-src[^;]*'nonce-/gi,
] as const;

export const ENCODE_URI_PATTERNS = [
  /encodeURIComponent\s*\(/gi,
  /encodeURI\s*\(/gi,
  /escape\s*\(/gi,
  /urlEncode\s*\(/gi,
] as const;

export const TEXT_CONTENT_PATTERNS = [
  /\.textContent\s*=/gi,
  /\.innerText\s*=/gi,
  /createTextNode\s*\(/gi,
] as const;

export const DANGEROUS_INNER_HTML_PATTERNS = [
  /dangerouslySetInnerHTML\s*=\s*\{\s*\{/gi,
  /dangerouslySetInnerHTML:\s*\{/gi,
] as const;

export const DOCUMENT_WRITE_PATTERNS = [
  /document\.write\s*\(/gi,
  /document\.writeln\s*\(/gi,
] as const;

export const EVAL_USAGE_PATTERNS = [
  // TypeScript/JavaScript patterns
  /\beval\s*\(/gi,
  /new\s+Function\s*\(/gi,
  /setTimeout\s*\(\s*['"`]/gi,
  /setInterval\s*\(\s*['"`]/gi,
  // Python patterns - exec, eval
  /\bexec\s*\(/gi,
  /\beval\s*\(/gi,
  /compile\s*\([^)]*,\s*['"`]\w+['"`]\s*,\s*['"`]exec['"`]/gi,
] as const;

export const INNER_HTML_ASSIGNMENT_PATTERNS = [
  /\.innerHTML\s*=/gi,
  /\.innerHTML\s*\+=/gi,
] as const;

export const OUTER_HTML_ASSIGNMENT_PATTERNS = [
  /\.outerHTML\s*=/gi,
] as const;

export const SCRIPT_INJECTION_PATTERNS = [
  /createElement\s*\(\s*['"`]script['"`]\s*\)/gi,
  /insertAdjacentHTML\s*\(/gi,
  /\.html\s*\(\s*[^)]+\)/gi,
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

export function detectHTMLEscape(
  content: string,
  filePath: string
): XSSPreventionPatternInfo[] {
  const results: XSSPreventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of HTML_ESCAPE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'html-escape',
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

export function detectDOMPurifySanitize(
  content: string,
  filePath: string
): XSSPreventionPatternInfo[] {
  const results: XSSPreventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DOMPURIFY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'dompurify-sanitize',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          library: 'dompurify',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectSanitizeHTML(
  content: string,
  filePath: string
): XSSPreventionPatternInfo[] {
  const results: XSSPreventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SANITIZE_HTML_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'sanitize-html',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          library: 'sanitize-html',
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
): XSSPreventionPatternInfo[] {
  const results: XSSPreventionPatternInfo[] = [];
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

export function detectEncodeURI(
  content: string,
  filePath: string
): XSSPreventionPatternInfo[] {
  const results: XSSPreventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ENCODE_URI_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'encode-uri',
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

export function detectTextContent(
  content: string,
  filePath: string
): XSSPreventionPatternInfo[] {
  const results: XSSPreventionPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TEXT_CONTENT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'text-content',
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

export function detectDangerousInnerHTMLViolations(
  content: string,
  filePath: string
): XSSViolationInfo[] {
  const results: XSSViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DANGEROUS_INNER_HTML_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'dangerous-inner-html',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'dangerouslySetInnerHTML usage - ensure content is sanitized',
          suggestedFix: 'Sanitize content with DOMPurify before using dangerouslySetInnerHTML',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectDocumentWriteViolations(
  content: string,
  filePath: string
): XSSViolationInfo[] {
  const results: XSSViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DOCUMENT_WRITE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'document-write',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'document.write usage - potential XSS vulnerability',
          suggestedFix: 'Use DOM manipulation methods instead of document.write',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectEvalViolations(
  content: string,
  filePath: string
): XSSViolationInfo[] {
  const results: XSSViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of EVAL_USAGE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'eval-usage',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'eval or Function constructor usage - potential code injection',
          suggestedFix: 'Avoid eval and use safer alternatives like JSON.parse',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectInnerHTMLViolations(
  content: string,
  filePath: string
): XSSViolationInfo[] {
  const results: XSSViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of INNER_HTML_ASSIGNMENT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'inner-html-assignment',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'innerHTML assignment - potential XSS if content is not sanitized',
          suggestedFix: 'Use textContent for text or sanitize HTML with DOMPurify',
          severity: 'medium',
        });
      }
    }
  }

  return results;
}

export function analyzeXSSPrevention(
  content: string,
  filePath: string
): XSSPreventionAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasXSSPrevention: false,
      hasViolations: false,
      confidence: 1.0,
    };
  }

  const patterns: XSSPreventionPatternInfo[] = [
    ...detectHTMLEscape(content, filePath),
    ...detectDOMPurifySanitize(content, filePath),
    ...detectSanitizeHTML(content, filePath),
    ...detectCSPNonce(content, filePath),
    ...detectEncodeURI(content, filePath),
    ...detectTextContent(content, filePath),
  ];

  const violations: XSSViolationInfo[] = [
    ...detectDangerousInnerHTMLViolations(content, filePath),
    ...detectDocumentWriteViolations(content, filePath),
    ...detectEvalViolations(content, filePath),
    ...detectInnerHTMLViolations(content, filePath),
  ];

  const hasXSSPrevention = patterns.length > 0;
  const hasViolations = violations.length > 0;

  const confidence = hasViolations ? 0.7 : hasXSSPrevention ? 0.95 : 0.8;

  return {
    patterns,
    violations,
    hasXSSPrevention,
    hasViolations,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class XSSPreventionDetector extends RegexDetector {
  readonly id = 'security/xss-prevention';
  readonly name = 'XSS Prevention Detector';
  readonly description =
    'Detects XSS prevention patterns and identifies potential vulnerabilities';
  readonly category: PatternCategory = 'security';
  readonly subcategory = 'xss-prevention';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeXSSPrevention(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    // Map severity: high -> error, medium -> warning, low -> info
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      file: v.file,
      line: v.line,
      column: v.column,
      type: v.type,
      value: v.matchedText,
      issue: v.issue,
      suggestedFix: v.suggestedFix,
      severity: v.severity === 'high' ? 'error' : v.severity === 'medium' ? 'warning' : 'info',
    }));

    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasXSSPrevention: analysis.hasXSSPrevention,
        hasViolations: analysis.hasViolations,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createXSSPreventionDetector(): XSSPreventionDetector {
  return new XSSPreventionDetector();
}
