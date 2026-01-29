/**
 * Response Envelope Detector - LEARNING VERSION
 *
 * Learns response envelope patterns from the user's codebase:
 * - Envelope format (standard, json-api, hal, graphql, custom)
 * - Required fields (data, error, success, meta)
 * - Whether envelope wrapping is required
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

export type ResponseEnvelopeFormat = 'standard' | 'json-api' | 'hal' | 'graphql' | 'custom' | 'direct';

export interface EnvelopeConventions {
  [key: string]: unknown;
  /** Primary envelope format */
  envelopeFormat: ResponseEnvelopeFormat;
  /** Whether responses use envelope wrapping */
  usesEnvelope: boolean;
  /** Whether data field is required */
  requiresDataField: boolean;
  /** Whether success indicator is used */
  usesSuccessIndicator: boolean;
  /** Whether meta field is used */
  usesMetaField: boolean;
}

interface EnvelopePatternInfo {
  format: ResponseEnvelopeFormat;
  line: number;
  column: number;
  matchedText: string;
  fields: string[];
  hasData: boolean;
  hasError: boolean;
  hasSuccess: boolean;
  hasMeta: boolean;
}

// ============================================================================
// Detection Patterns
// ============================================================================

const STANDARD_DATA_FIELDS = ['data', 'result', 'results', 'payload', 'body'];
const STANDARD_ERROR_FIELDS = ['error', 'errors', 'err', 'errorMessage'];
const STANDARD_SUCCESS_FIELDS = ['success', 'ok', 'status', 'isSuccess', 'succeeded'];
const STANDARD_META_FIELDS = ['meta', 'metadata', '_meta', 'info'];

const JSON_API_FIELDS = ['data', 'errors', 'meta', 'links', 'included', 'jsonapi'];
// HAL and GraphQL fields used in format detection
const HAL_INDICATOR_FIELDS = ['_links', '_embedded'];
const GRAPHQL_INDICATOR_FIELDS = ['data', 'errors', 'extensions'];

const RESPONSE_PATTERNS = [
  /Response\.json\s*\(\s*\{([^}]+)\}/gi,
  /NextResponse\.json\s*\(\s*\{([^}]+)\}/gi,
  /res\.json\s*\(\s*\{([^}]+)\}/gi,
  /res\.send\s*\(\s*\{([^}]+)\}/gi,
  /res\.status\s*\([^)]+\)\s*\.json\s*\(\s*\{([^}]+)\}/gi,
  /return\s+\{([^}]+)\}/gi,
];

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

function detectEnvelopeFormat(fields: string[]): ResponseEnvelopeFormat {
  const lowerFields = fields.map(f => f.toLowerCase());

  // Check HAL format
  if (HAL_INDICATOR_FIELDS.some(f => lowerFields.includes(f.toLowerCase()))) {
    return 'hal';
  }

  // Check JSON:API format
  const jsonApiMatches = JSON_API_FIELDS.filter(f => lowerFields.includes(f.toLowerCase()));
  if (jsonApiMatches.length >= 2 && (lowerFields.includes('links') || lowerFields.includes('included') || lowerFields.includes('jsonapi'))) {
    return 'json-api';
  }

  // Check GraphQL format
  if (GRAPHQL_INDICATOR_FIELDS.every(f => lowerFields.includes(f.toLowerCase()))) {
    return 'graphql';
  }

  // Check standard envelope
  const hasData = STANDARD_DATA_FIELDS.some(f => lowerFields.includes(f.toLowerCase()));
  const hasError = STANDARD_ERROR_FIELDS.some(f => lowerFields.includes(f.toLowerCase()));
  const hasSuccess = STANDARD_SUCCESS_FIELDS.some(f => lowerFields.includes(f.toLowerCase()));
  const hasMeta = STANDARD_META_FIELDS.some(f => lowerFields.includes(f.toLowerCase()));

  if (hasData || hasError || hasSuccess || hasMeta) {
    return 'standard';
  }

  if (fields.length >= 2) {
    return 'custom';
  }

  return 'direct';
}

function extractEnvelopePatterns(content: string): EnvelopePatternInfo[] {
  const results: EnvelopePatternInfo[] = [];

  for (const pattern of RESPONSE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      const objectContent = match[1] || '';
      const fields = extractFieldNames(objectContent);

      if (fields.length === 0) {continue;}

      const format = detectEnvelopeFormat(fields);
      const lowerFields = fields.map(f => f.toLowerCase());

      results.push({
        format,
        line,
        column,
        matchedText: match[0],
        fields,
        hasData: STANDARD_DATA_FIELDS.some(f => lowerFields.includes(f.toLowerCase())),
        hasError: STANDARD_ERROR_FIELDS.some(f => lowerFields.includes(f.toLowerCase())),
        hasSuccess: STANDARD_SUCCESS_FIELDS.some(f => lowerFields.includes(f.toLowerCase())),
        hasMeta: STANDARD_META_FIELDS.some(f => lowerFields.includes(f.toLowerCase())),
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Response Envelope Detector
// ============================================================================

export class ResponseEnvelopeLearningDetector extends LearningDetector<EnvelopeConventions> {
  readonly id = 'api/response-envelope';
  readonly category = 'api' as const;
  readonly subcategory = 'response';
  readonly name = 'Response Envelope Detector (Learning)';
  readonly description = 'Learns response envelope patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof EnvelopeConventions> {
    return ['envelopeFormat', 'usesEnvelope', 'requiresDataField', 'usesSuccessIndicator', 'usesMetaField'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof EnvelopeConventions, ValueDistribution>
  ): void {
    const patterns = extractEnvelopePatterns(context.content);
    if (patterns.length === 0) {return;}

    const formatDist = distributions.get('envelopeFormat')!;
    const envelopeDist = distributions.get('usesEnvelope')!;
    const dataDist = distributions.get('requiresDataField')!;
    const successDist = distributions.get('usesSuccessIndicator')!;
    const metaDist = distributions.get('usesMetaField')!;

    for (const pattern of patterns) {
      if (pattern.format !== 'direct') {
        formatDist.add(pattern.format, context.file);
        envelopeDist.add(true, context.file);
      } else {
        envelopeDist.add(false, context.file);
      }

      dataDist.add(pattern.hasData, context.file);
      successDist.add(pattern.hasSuccess, context.file);
      metaDist.add(pattern.hasMeta, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<EnvelopeConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const envelopePatterns = extractEnvelopePatterns(context.content);
    if (envelopePatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedFormat = conventions.conventions.envelopeFormat?.value;
    const learnedUsesEnvelope = conventions.conventions.usesEnvelope?.value;
    const learnedRequiresData = conventions.conventions.requiresDataField?.value;
    const learnedUsesSuccess = conventions.conventions.usesSuccessIndicator?.value;

    for (const pattern of envelopePatterns) {
      // Check format consistency
      if (learnedFormat && pattern.format !== 'direct' && pattern.format !== learnedFormat) {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'response envelope format',
          pattern.format,
          learnedFormat,
          `Response uses ${pattern.format} format but your project uses ${learnedFormat}.`
        ));
      }

      // Check if envelope is required but missing
      if (learnedUsesEnvelope === true && pattern.format === 'direct') {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'response envelope',
          'direct response',
          'envelope wrapper',
          `Response is not wrapped in envelope. Your project uses envelope wrappers.`
        ));
      }

      // Check for missing data field
      if (learnedRequiresData === true && !pattern.hasData && !pattern.hasError) {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'data field',
          'missing',
          'present',
          `Response envelope is missing data field. Your project typically includes it.`
        ));
      }

      // Check for missing success indicator
      if (learnedUsesSuccess === true && !pattern.hasSuccess && pattern.format === 'standard') {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'success indicator',
          'missing',
          'present',
          `Response envelope is missing success indicator. Your project typically includes it.`
        ));
      }
    }

    // Create pattern match
    if (envelopePatterns.length > 0) {
      const first = envelopePatterns[0]!;
      patterns.push({
        patternId: `${this.id}/envelope`,
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

export function createResponseEnvelopeLearningDetector(): ResponseEnvelopeLearningDetector {
  return new ResponseEnvelopeLearningDetector();
}
