/**
 * Pagination Detector - LEARNING VERSION
 *
 * Learns pagination patterns from the user's codebase:
 * - Pagination style (offset, cursor, page-based, keyset)
 * - Field naming conventions
 * - Whether pagination is required for list endpoints
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

export type PaginationType = 'offset' | 'cursor' | 'page-based' | 'keyset' | 'link-based' | 'none';

export interface PaginationConventions {
  [key: string]: unknown;
  /** Primary pagination style */
  paginationStyle: PaginationType;
  /** Whether list endpoints require pagination */
  requiresPagination: boolean;
  /** Whether total count is included */
  includesTotalCount: boolean;
  /** Whether hasMore/hasNext indicator is used */
  includesHasMore: boolean;
}

interface PaginationPatternInfo {
  type: PaginationType;
  line: number;
  column: number;
  matchedText: string;
  fields: string[];
  hasTotal: boolean;
  hasHasMore: boolean;
}

// ============================================================================
// Detection Patterns
// ============================================================================

const OFFSET_FIELDS = ['limit', 'offset', 'skip', 'take'];
const CURSOR_FIELDS = ['cursor', 'nextCursor', 'prevCursor', 'after', 'before', 'endCursor', 'startCursor'];
const PAGE_BASED_FIELDS = ['page', 'pageSize', 'pageNumber', 'totalPages', 'currentPage', 'perPage'];
const KEYSET_FIELDS = ['edges', 'nodes', 'pageInfo', 'hasNextPage', 'hasPreviousPage'];
const LINK_FIELDS = ['next', 'prev', 'first', 'last', 'self'];
const TOTAL_FIELDS = ['total', 'totalCount', 'count', 'totalItems'];
const HAS_MORE_FIELDS = ['hasMore', 'hasNext', 'hasPrev', 'hasNextPage', 'hasPreviousPage'];

const PAGINATION_PATTERNS = [
  /\{\s*(?:page|limit|offset|cursor|total|hasMore|nextCursor|pageSize|totalPages)\s*:/gi,
  /pagination\s*:\s*\{/gi,
  /pageInfo\s*:\s*\{/gi,
  /meta\s*:\s*\{[^}]*(?:total|page|limit|cursor)/gi,
];

const LIST_ENDPOINT_PATTERNS = [
  /\.findAll\s*\(/gi,
  /\.findMany\s*\(/gi,
  /\.list\s*\(/gi,
  /\.getAll\s*\(/gi,
  /data\s*:\s*\[/gi,
  /items\s*:\s*\[/gi,
  /results\s*:\s*\[/gi,
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

function detectPaginationType(fields: string[]): PaginationType {
  const lowerFields = fields.map(f => f.toLowerCase());

  // Check keyset (GraphQL connections) first - most specific
  if (KEYSET_FIELDS.some(f => lowerFields.includes(f.toLowerCase()))) {
    return 'keyset';
  }

  // Check cursor pagination
  if (CURSOR_FIELDS.some(f => lowerFields.includes(f.toLowerCase()))) {
    return 'cursor';
  }

  // Check link-based
  const linkMatches = LINK_FIELDS.filter(f => lowerFields.includes(f.toLowerCase()));
  if (linkMatches.length >= 2) {
    return 'link-based';
  }

  // Check page-based (pageSize, totalPages)
  if (PAGE_BASED_FIELDS.filter(f => f !== 'page').some(f => lowerFields.includes(f.toLowerCase()))) {
    return 'page-based';
  }

  // Check offset (limit, offset)
  if (OFFSET_FIELDS.some(f => lowerFields.includes(f.toLowerCase()))) {
    return 'offset';
  }

  // Check if just 'page' is present
  if (lowerFields.includes('page')) {
    return 'page-based';
  }

  return 'none';
}

function extractPaginationPatterns(content: string): PaginationPatternInfo[] {
  const results: PaginationPatternInfo[] = [];

  for (const pattern of PAGINATION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);

      // Find the full object
      const startIndex = match.index;
      let braceCount = 0;
      let endIndex = startIndex;
      for (let i = startIndex; i < content.length && i < startIndex + 500; i++) {
        if (content[i] === '{') {braceCount++;}
        if (content[i] === '}') {
          braceCount--;
          if (braceCount === 0) { endIndex = i + 1; break; }
        }
      }

      const objectContent = content.slice(startIndex, endIndex);
      const fields = extractFieldNames(objectContent);
      const type = detectPaginationType(fields);

      if (type !== 'none') {
        const lowerFields = fields.map(f => f.toLowerCase());
        results.push({
          type,
          line,
          column,
          matchedText: match[0],
          fields,
          hasTotal: TOTAL_FIELDS.some(f => lowerFields.includes(f.toLowerCase())),
          hasHasMore: HAS_MORE_FIELDS.some(f => lowerFields.includes(f.toLowerCase())),
        });
      }
    }
  }

  return results;
}

function hasListEndpoints(content: string): boolean {
  return LIST_ENDPOINT_PATTERNS.some(p => p.test(content));
}

// ============================================================================
// Learning Pagination Detector
// ============================================================================

export class PaginationLearningDetector extends LearningDetector<PaginationConventions> {
  readonly id = 'api/pagination';
  readonly category = 'api' as const;
  readonly subcategory = 'pagination';
  readonly name = 'Pagination Detector (Learning)';
  readonly description = 'Learns pagination patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof PaginationConventions> {
    return ['paginationStyle', 'requiresPagination', 'includesTotalCount', 'includesHasMore'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof PaginationConventions, ValueDistribution>
  ): void {
    const patterns = extractPaginationPatterns(context.content);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('paginationStyle')!;
    const requiresDist = distributions.get('requiresPagination')!;
    const totalDist = distributions.get('includesTotalCount')!;
    const hasMoreDist = distributions.get('includesHasMore')!;

    for (const pattern of patterns) {
      styleDist.add(pattern.type, context.file);
      totalDist.add(pattern.hasTotal, context.file);
      hasMoreDist.add(pattern.hasHasMore, context.file);
    }

    // Track if list endpoints have pagination
    const hasList = hasListEndpoints(context.content);
    if (hasList) {
      requiresDist.add(patterns.length > 0, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<PaginationConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const paginationPatterns = extractPaginationPatterns(context.content);
    const learnedStyle = conventions.conventions.paginationStyle?.value;
    const learnedRequires = conventions.conventions.requiresPagination?.value;
    const learnedTotal = conventions.conventions.includesTotalCount?.value;
    const learnedHasMore = conventions.conventions.includesHasMore?.value;

    // Check for style consistency
    for (const pattern of paginationPatterns) {
      if (learnedStyle && pattern.type !== learnedStyle) {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'pagination style',
          pattern.type,
          learnedStyle,
          `Using ${pattern.type} pagination but your project uses ${learnedStyle}.`
        ));
      }

      // Check for missing total count
      if (learnedTotal === true && !pattern.hasTotal && pattern.type === 'offset') {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'total count',
          'missing',
          'present',
          `Pagination is missing total count. Your project typically includes it.`
        ));
      }

      // Check for missing hasMore
      if (learnedHasMore === true && !pattern.hasHasMore && pattern.type === 'cursor') {
        violations.push(this.createConventionViolation(
          context.file,
          pattern.line,
          pattern.column,
          'hasMore indicator',
          'missing',
          'present',
          `Cursor pagination is missing hasMore indicator. Your project typically includes it.`
        ));
      }
    }

    // Check for missing pagination on list endpoints
    if (learnedRequires === true && hasListEndpoints(context.content) && paginationPatterns.length === 0) {
      // Find the first list endpoint to report
      for (const pattern of LIST_ENDPOINT_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        const match = regex.exec(context.content);
        if (match) {
          const { line, column } = getPosition(context.content, match.index);
          violations.push(this.createConventionViolation(
            context.file,
            line,
            column,
            'pagination',
            'missing',
            'present',
            `List endpoint without pagination. Your project typically paginates list responses.`
          ));
          break;
        }
      }
    }

    // Create pattern match
    if (paginationPatterns.length > 0) {
      const first = paginationPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/pagination`,
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

export function createPaginationLearningDetector(): PaginationLearningDetector {
  return new PaginationLearningDetector();
}
