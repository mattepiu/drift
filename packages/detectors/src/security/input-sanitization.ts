/**
 * Input Sanitization Detector - Input sanitization pattern detection
 *
 * Detects input sanitization patterns including:
 * - HTML sanitization (DOMPurify, sanitize-html)
 * - Input validation libraries (validator.js, joi, zod)
 * - Escape functions for different contexts
 * - Custom sanitization functions
 * - Missing sanitization violations
 *
 * @requirements 16.1 - Input sanitization patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type InputSanitizationPatternType =
  | 'dompurify-sanitize'
  | 'sanitize-html-lib'
  | 'validator-js'
  | 'escape-html'
  | 'escape-sql'
  | 'escape-regex'
  | 'custom-sanitize'
  | 'trim-normalize';

export type InputSanitizationViolationType =
  | 'unsanitized-input'
  | 'raw-user-input'
  | 'missing-validation';

export interface InputSanitizationPatternInfo {
  type: InputSanitizationPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  library?: string | undefined;
  context?: string | undefined;
}

export interface InputSanitizationViolationInfo {
  type: InputSanitizationViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
}

export interface InputSanitizationAnalysis {
  patterns: InputSanitizationPatternInfo[];
  violations: InputSanitizationViolationInfo[];
  hasSanitization: boolean;
  sanitizationLibraries: string[];
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

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
  /import.*sanitize-html/gi,
  /filterXSS\s*\(/gi,
] as const;

export const VALIDATOR_JS_PATTERNS = [
  // TypeScript/JavaScript patterns
  /validator\.escape\s*\(/gi,
  /validator\.trim\s*\(/gi,
  /validator\.stripLow\s*\(/gi,
  /validator\.whitelist\s*\(/gi,
  /validator\.blacklist\s*\(/gi,
  /validator\.normalizeEmail\s*\(/gi,
  /validator\.isEmail\s*\(/gi,
  /validator\.isURL\s*\(/gi,
  /validator\.isAlphanumeric\s*\(/gi,
  // Python patterns - pydantic, cerberus, marshmallow
  /EmailStr\b/gi,
  /HttpUrl\b/gi,
  /validator\s*\(/gi,
  /@validator\s*\(/gi,
  /field_validator\s*\(/gi,
  /Schema\s*\(\s*\{/gi,
  /fields\.\w+\s*\(/gi,
] as const;

export const ESCAPE_HTML_PATTERNS = [
  /escapeHtml\s*\(/gi,
  /htmlEscape\s*\(/gi,
  /escape\s*\(\s*['"`]html['"`]/gi,
  /encodeHTML\s*\(/gi,
  /htmlEncode\s*\(/gi,
  /\.replace\s*\(\s*\/[<>&'"]/gi,
] as const;

export const ESCAPE_SQL_PATTERNS = [
  /escapeSql\s*\(/gi,
  /sqlEscape\s*\(/gi,
  /mysql\.escape\s*\(/gi,
  /pg\.escapeLiteral\s*\(/gi,
  /escapeIdentifier\s*\(/gi,
] as const;

export const ESCAPE_REGEX_PATTERNS = [
  /escapeRegExp\s*\(/gi,
  /escapeRegex\s*\(/gi,
  /RegExp\.escape\s*\(/gi,
  /\.replace\s*\(\s*\/\[\.\*\+\?\^\$\{\}\(\)\|\[\]\\\\]/gi,
] as const;

export const CUSTOM_SANITIZE_PATTERNS = [
  // TypeScript/JavaScript patterns
  /sanitize\w*\s*\(/gi,
  /clean\w*Input\s*\(/gi,
  /filterInput\s*\(/gi,
  /validateAndSanitize\s*\(/gi,
  /scrub\s*\(/gi,
  /purge\s*\(/gi,
  // Python patterns - snake_case
  /sanitize_\w*\s*\(/gi,
  /clean_\w*input\s*\(/gi,
  /filter_input\s*\(/gi,
  /validate_and_sanitize\s*\(/gi,
  /bleach\.clean\s*\(/gi,
  /markupsafe\.escape\s*\(/gi,
  /html\.escape\s*\(/gi,
] as const;

export const TRIM_NORMALIZE_PATTERNS = [
  /\.trim\s*\(\s*\)/gi,
  /\.normalize\s*\(/gi,
  /\.toLowerCase\s*\(\s*\)/gi,
  /\.toUpperCase\s*\(\s*\)/gi,
  /normalizeWhitespace\s*\(/gi,
] as const;

export const UNSANITIZED_INPUT_PATTERNS = [
  /req\.body\.\w+\s*(?!\s*\?\s*\.|\s*&&|\s*\|\|)/gi,
  /req\.query\.\w+\s*(?!\s*\?\s*\.|\s*&&|\s*\|\|)/gi,
  /req\.params\.\w+\s*(?!\s*\?\s*\.|\s*&&|\s*\|\|)/gi,
  /event\.body/gi,
] as const;

export const RAW_USER_INPUT_PATTERNS = [
  /innerHTML\s*=\s*(?:req|request|body|query|params)/gi,
  /document\.write\s*\(\s*(?:req|request|body|query|params)/gi,
  /eval\s*\(\s*(?:req|request|body|query|params)/gi,
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

export function detectDOMPurifySanitization(
  content: string,
  filePath: string
): InputSanitizationPatternInfo[] {
  const results: InputSanitizationPatternInfo[] = [];
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

export function detectSanitizeHtmlLib(
  content: string,
  filePath: string
): InputSanitizationPatternInfo[] {
  const results: InputSanitizationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SANITIZE_HTML_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'sanitize-html-lib',
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

export function detectValidatorJS(
  content: string,
  filePath: string
): InputSanitizationPatternInfo[] {
  const results: InputSanitizationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of VALIDATOR_JS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'validator-js',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          library: 'validator',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectEscapeHTML(
  content: string,
  filePath: string
): InputSanitizationPatternInfo[] {
  const results: InputSanitizationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ESCAPE_HTML_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'escape-html',
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

export function detectEscapeSQL(
  content: string,
  filePath: string
): InputSanitizationPatternInfo[] {
  const results: InputSanitizationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ESCAPE_SQL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'escape-sql',
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

export function detectCustomSanitization(
  content: string,
  filePath: string
): InputSanitizationPatternInfo[] {
  const results: InputSanitizationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CUSTOM_SANITIZE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'custom-sanitize',
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

export function detectTrimNormalize(
  content: string,
  filePath: string
): InputSanitizationPatternInfo[] {
  const results: InputSanitizationPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TRIM_NORMALIZE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'trim-normalize',
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

export function detectUnsanitizedInputViolations(
  content: string,
  filePath: string
): InputSanitizationViolationInfo[] {
  const results: InputSanitizationViolationInfo[] = [];
  const lines = content.split('\n');

  // Check for raw user input patterns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of RAW_USER_INPUT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'raw-user-input',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Raw user input used in dangerous context without sanitization',
          suggestedFix: 'Sanitize input using DOMPurify or similar library before use',
        });
      }
    }
  }

  return results;
}

export function analyzeInputSanitization(
  content: string,
  filePath: string
): InputSanitizationAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasSanitization: false,
      sanitizationLibraries: [],
      confidence: 1.0,
    };
  }

  const patterns: InputSanitizationPatternInfo[] = [
    ...detectDOMPurifySanitization(content, filePath),
    ...detectSanitizeHtmlLib(content, filePath),
    ...detectValidatorJS(content, filePath),
    ...detectEscapeHTML(content, filePath),
    ...detectEscapeSQL(content, filePath),
    ...detectCustomSanitization(content, filePath),
    ...detectTrimNormalize(content, filePath),
  ];

  const violations = detectUnsanitizedInputViolations(content, filePath);

  // Extract unique libraries
  const libraries = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.library) {
      libraries.add(pattern.library);
    }
  }

  const hasSanitization = patterns.length > 0;
  const confidence = violations.length > 0 ? 0.85 : hasSanitization ? 0.95 : 0.7;

  return {
    patterns,
    violations,
    hasSanitization,
    sanitizationLibraries: [...libraries],
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class InputSanitizationDetector extends RegexDetector {
  readonly id = 'security/input-sanitization';
  readonly name = 'Input Sanitization Detector';
  readonly description =
    'Detects input sanitization patterns and identifies potential unsanitized input vulnerabilities';
  readonly category: PatternCategory = 'security';
  readonly subcategory = 'input-sanitization';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeInputSanitization(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      file: v.file,
      line: v.line,
      column: v.column,
      value: v.matchedText,
      issue: v.issue,
      suggestedFix: v.suggestedFix,
      severity: 'warning',
    }));

    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasSanitization: analysis.hasSanitization,
        sanitizationLibraries: analysis.sanitizationLibraries,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createInputSanitizationDetector(): InputSanitizationDetector {
  return new InputSanitizationDetector();
}
