/**
 * Error Format Detector - LEARNING VERSION
 *
 * Learns error response format patterns from the user's codebase:
 * - Error format style (standard, problem-details, json-api, graphql, simple)
 * - Error code naming convention (SCREAMING_SNAKE, camelCase, kebab-case)
 * - Required error fields
 * - Custom error class patterns
 *
 * Flags violations only when code deviates from the PROJECT'S established patterns.
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

export type ErrorFormat =
  | 'standard'        // { error: { message, code, details } }
  | 'problem-details' // RFC 7807
  | 'json-api'        // { errors: [...] }
  | 'graphql'         // { errors: [{ message, locations, path }] }
  | 'simple'          // { error: string } or { message: string }
  | 'custom';

export type ErrorCodeConvention =
  | 'screaming_snake'  // ERROR_NOT_FOUND
  | 'camelCase'        // errorNotFound
  | 'kebab'            // error-not-found
  | 'dotted'           // error.not.found
  | 'prefixed';        // ERR_NOT_FOUND

export interface ErrorConventions {
  [key: string]: unknown;
  /** Primary error format used */
  errorFormat: ErrorFormat;
  /** Error code naming convention */
  errorCodeConvention: ErrorCodeConvention;
  /** Whether custom error classes are used */
  usesCustomErrorClasses: boolean;
  /** Whether error codes are required */
  requiresErrorCode: boolean;
}

interface ErrorPatternInfo {
  format: ErrorFormat;
  line: number;
  column: number;
  matchedText: string;
  fields: string[];
  errorCode?: string | undefined;
  errorClass?: string | undefined;
}

// ============================================================================
// Detection Patterns
// ============================================================================

const ERROR_RESPONSE_PATTERNS = [
  /\{\s*error\s*:\s*\{([^}]+)\}\s*\}/gi,
  /\{\s*errors\s*:\s*\[([^\]]+)\]\s*\}/gi,
  /\{\s*error\s*:\s*["'`]([^"'`]+)["'`]\s*\}/gi,
  /\{\s*message\s*:\s*["'`]([^"'`]+)["'`]\s*,?\s*(?:code|status)/gi,
];

const ERROR_CLASS_PATTERNS = [
  /class\s+(\w*Error)\s+extends\s+(?:Error|AppError|BaseError|HttpError|CustomError)/g,
  /class\s+(\w*Exception)\s+extends/g,
];

const ERROR_CODE_PATTERNS: Record<ErrorCodeConvention, RegExp> = {
  screaming_snake: /^[A-Z][A-Z0-9_]*$/,
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  kebab: /^[a-z][a-z0-9-]*$/,
  dotted: /^[a-z][a-z0-9.]*$/,
  prefixed: /^(ERR_|ERROR_|E_)[A-Z0-9_]+$/,
};

const PROBLEM_DETAILS_FIELDS = ['type', 'title', 'status', 'detail', 'instance'];
const JSON_API_FIELDS = ['status', 'title', 'detail', 'source', 'code', 'meta'];
const GRAPHQL_FIELDS = ['message', 'locations', 'path', 'extensions'];
const STANDARD_MESSAGE_FIELDS = ['message', 'msg', 'errorMessage', 'description'];
const STANDARD_CODE_FIELDS = ['code', 'errorCode', 'error_code', 'statusCode'];

// ============================================================================
// Helper Functions
// ============================================================================

function getPosition(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

function extractFieldNames(objectContent: string): string[] {
  const fields: string[] = [];
  const fieldPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g;
  let match;
  while ((match = fieldPattern.exec(objectContent)) !== null) {
    if (match[1]) {fields.push(match[1]);}
  }
  return fields;
}

function detectErrorFormat(fields: string[]): ErrorFormat {
  const lowerFields = fields.map(f => f.toLowerCase());

  // Check for Problem Details (RFC 7807)
  const problemMatches = PROBLEM_DETAILS_FIELDS.filter(f => lowerFields.includes(f));
  if (problemMatches.length >= 3) {return 'problem-details';}

  // Check for JSON:API
  const jsonApiMatches = JSON_API_FIELDS.filter(f => lowerFields.includes(f));
  if (jsonApiMatches.length >= 3 && (lowerFields.includes('source') || lowerFields.includes('meta'))) {
    return 'json-api';
  }

  // Check for GraphQL
  const graphqlMatches = GRAPHQL_FIELDS.filter(f => lowerFields.includes(f));
  if (graphqlMatches.length >= 2 && (lowerFields.includes('locations') || lowerFields.includes('path'))) {
    return 'graphql';
  }

  // Check for standard format
  const hasMessage = STANDARD_MESSAGE_FIELDS.some(f => lowerFields.includes(f.toLowerCase()));
  const hasCode = STANDARD_CODE_FIELDS.some(f => lowerFields.includes(f.toLowerCase()));
  if (hasMessage && hasCode) {return 'standard';}
  if (hasMessage && fields.length <= 2) {return 'simple';}
  if (fields.length >= 2) {return 'custom';}

  return 'simple';
}

function detectCodeConvention(code: string): ErrorCodeConvention | null {
  for (const [convention, pattern] of Object.entries(ERROR_CODE_PATTERNS)) {
    if (pattern.test(code)) {return convention as ErrorCodeConvention;}
  }
  return null;
}

function extractErrorPatterns(content: string, _file: string): ErrorPatternInfo[] {
  const results: ErrorPatternInfo[] = [];

  // Detect error objects
  for (const pattern of ERROR_RESPONSE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      const objectContent = match[1] || match[0];
      const fields = extractFieldNames(objectContent);
      const format = detectErrorFormat(fields);
      const codeMatch = objectContent.match(/code\s*:\s*["'`]([^"'`]+)["'`]/i);

      results.push({
        format,
        line,
        column,
        matchedText: match[0],
        fields,
        errorCode: codeMatch?.[1],
      });
    }
  }

  // Detect error classes
  for (const pattern of ERROR_CLASS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      results.push({
        format: 'standard',
        line,
        column,
        matchedText: match[0],
        fields: [],
        errorClass: match[1],
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Error Format Detector
// ============================================================================

export class ErrorFormatLearningDetector extends LearningDetector<ErrorConventions> {
  readonly id = 'api/error-format';
  readonly category = 'api' as const;
  readonly subcategory = 'errors';
  readonly name = 'Error Format Detector (Learning)';
  readonly description = 'Learns error response format patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ErrorConventions> {
    return ['errorFormat', 'errorCodeConvention', 'usesCustomErrorClasses', 'requiresErrorCode'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ErrorConventions, ValueDistribution>
  ): void {
    const patterns = extractErrorPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const formatDist = distributions.get('errorFormat')!;
    const codeDist = distributions.get('errorCodeConvention')!;
    const classDist = distributions.get('usesCustomErrorClasses')!;
    const requiresCodeDist = distributions.get('requiresErrorCode')!;

    let hasCustomClass = false;
    let hasErrorCode = false;

    for (const pattern of patterns) {
      // Track error format
      if (pattern.format !== 'simple') {
        formatDist.add(pattern.format, context.file);
      }

      // Track error code convention
      if (pattern.errorCode) {
        hasErrorCode = true;
        const convention = detectCodeConvention(pattern.errorCode);
        if (convention) {
          codeDist.add(convention, context.file);
        }
      }

      // Track custom error classes
      if (pattern.errorClass && pattern.errorClass !== 'Error') {
        hasCustomClass = true;
      }
    }

    classDist.add(hasCustomClass, context.file);
    requiresCodeDist.add(hasErrorCode, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ErrorConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const errorPatterns = extractErrorPatterns(context.content, context.file);
    if (errorPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedFormat = conventions.conventions.errorFormat?.value;
    const learnedCodeConvention = conventions.conventions.errorCodeConvention?.value;
    const learnedRequiresCode = conventions.conventions.requiresErrorCode?.value;

    for (const pattern of errorPatterns) {
      // Check format consistency
      if (learnedFormat && pattern.format !== 'simple' && pattern.format !== learnedFormat) {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'error format',
          pattern.format,
          learnedFormat,
          `Error uses ${pattern.format} format but your project uses ${learnedFormat}.`
        ));
      }

      // Check error code convention
      if (pattern.errorCode && learnedCodeConvention) {
        const actualConvention = detectCodeConvention(pattern.errorCode);
        if (actualConvention && actualConvention !== learnedCodeConvention) {
          violations.push(this.createConventionViolation(
            context.file,
            pattern.line,
            pattern.column,
            'error code naming',
            actualConvention,
            learnedCodeConvention,
            `Error code '${pattern.errorCode}' uses ${actualConvention} but your project uses ${learnedCodeConvention}.`
          ));
        }
      }

      // Check if error code is required but missing
      if (learnedRequiresCode === true && !pattern.errorCode && pattern.format !== 'simple') {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'error code',
          'missing',
          'present',
          `Error object is missing a code field. Your project typically includes error codes.`
        ));
      }
    }

    // Create pattern match
    if (errorPatterns.length > 0) {
      const first = errorPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/error-format`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null; // Error format fixes require more context
  }
}

export function createErrorFormatLearningDetector(): ErrorFormatLearningDetector {
  return new ErrorFormatLearningDetector();
}
