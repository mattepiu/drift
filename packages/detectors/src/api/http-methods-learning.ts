/**
 * HTTP Methods Detector - LEARNING VERSION
 *
 * Learns HTTP method usage patterns from the user's codebase:
 * - Which HTTP methods are used for which operations
 * - Whether project follows strict REST conventions
 * - Method preferences for updates (PUT vs PATCH)
 * - Search/query method preferences (GET vs POST)
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

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type OperationType = 'read' | 'create' | 'update' | 'delete' | 'search' | 'unknown';

export interface HttpMethodConventions {
  [key: string]: unknown;
  /** Method used for read operations */
  readMethod: HttpMethod;
  /** Method used for create operations */
  createMethod: HttpMethod;
  /** Method used for update operations */
  updateMethod: HttpMethod;
  /** Method used for delete operations */
  deleteMethod: HttpMethod;
  /** Method used for search/query operations */
  searchMethod: HttpMethod;
}

interface MethodUsageInfo {
  method: HttpMethod;
  operationType: OperationType;
  line: number;
  column: number;
  matchedText: string;
  routePath?: string | undefined;
}

// ============================================================================
// Detection Patterns
// ============================================================================

const EXPRESS_PATTERNS = [
  /(?:router|app|server)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
];

const NEXTJS_PATTERN = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/gi;

const FETCH_PATTERNS = [
  /fetch\s*\([^,]+,\s*\{[^}]*method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]/gi,
];

const AXIOS_PATTERNS = [
  /axios\.(get|post|put|patch|delete|head|options)\s*\(/gi,
];

// Keywords for operation type inference
const READ_KEYWORDS = ['get', 'fetch', 'find', 'list', 'load', 'retrieve', 'show', 'view'];
const CREATE_KEYWORDS = ['create', 'add', 'insert', 'new', 'post', 'submit'];
const UPDATE_KEYWORDS = ['update', 'edit', 'modify', 'change', 'patch', 'put', 'save'];
const DELETE_KEYWORDS = ['delete', 'remove', 'destroy', 'clear'];
const SEARCH_KEYWORDS = ['search', 'query', 'filter', 'find'];

// ============================================================================
// Helper Functions
// ============================================================================

function getPosition(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

function normalizeMethod(method: string): HttpMethod {
  return method.toUpperCase() as HttpMethod;
}

function inferOperationType(context: string, routePath?: string): OperationType {
  const lower = (context + ' ' + (routePath || '')).toLowerCase();

  // Check in order of specificity
  for (const kw of SEARCH_KEYWORDS) {
    if (lower.includes(kw)) {return 'search';}
  }
  for (const kw of DELETE_KEYWORDS) {
    if (lower.includes(kw)) {return 'delete';}
  }
  for (const kw of CREATE_KEYWORDS) {
    if (lower.includes(kw)) {return 'create';}
  }
  for (const kw of UPDATE_KEYWORDS) {
    if (lower.includes(kw)) {return 'update';}
  }
  for (const kw of READ_KEYWORDS) {
    if (lower.includes(kw)) {return 'read';}
  }

  return 'unknown';
}

function extractMethodUsages(content: string, file: string): MethodUsageInfo[] {
  const results: MethodUsageInfo[] = [];
  const lines = content.split('\n');

  // Express/Fastify patterns
  for (const pattern of EXPRESS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      const method = normalizeMethod(match[1] || 'GET');
      const routePath = match[2];
      const lineContent = lines[line - 1] || '';

      results.push({
        method,
        operationType: inferOperationType(lineContent, routePath),
        line,
        column,
        matchedText: match[0],
        routePath,
      });
    }
  }

  // Next.js App Router
  if (file.includes('/app/') || file.includes('\\app\\')) {
    const regex = new RegExp(NEXTJS_PATTERN.source, NEXTJS_PATTERN.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      const method = normalizeMethod(match[1] || 'GET');
      const lineContent = lines[line - 1] || '';

      results.push({
        method,
        operationType: inferOperationType(lineContent),
        line,
        column,
        matchedText: match[0],
      });
    }
  }

  // Fetch API
  for (const pattern of FETCH_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      const method = normalizeMethod(match[1] || 'GET');
      const lineContent = lines[line - 1] || '';

      results.push({
        method,
        operationType: inferOperationType(lineContent),
        line,
        column,
        matchedText: match[0],
      });
    }
  }

  // Axios
  for (const pattern of AXIOS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      const method = normalizeMethod(match[1] || 'GET');
      const lineContent = lines[line - 1] || '';

      results.push({
        method,
        operationType: inferOperationType(lineContent),
        line,
        column,
        matchedText: match[0],
      });
    }
  }

  return results;
}

// ============================================================================
// Learning HTTP Methods Detector
// ============================================================================

export class HttpMethodsLearningDetector extends LearningDetector<HttpMethodConventions> {
  readonly id = 'api/http-methods';
  readonly category = 'api' as const;
  readonly subcategory = 'http-methods';
  readonly name = 'HTTP Methods Detector (Learning)';
  readonly description = 'Learns HTTP method patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof HttpMethodConventions> {
    return ['readMethod', 'createMethod', 'updateMethod', 'deleteMethod', 'searchMethod'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof HttpMethodConventions, ValueDistribution>
  ): void {
    const usages = extractMethodUsages(context.content, context.file);
    if (usages.length === 0) {return;}

    const readDist = distributions.get('readMethod')!;
    const createDist = distributions.get('createMethod')!;
    const updateDist = distributions.get('updateMethod')!;
    const deleteDist = distributions.get('deleteMethod')!;
    const searchDist = distributions.get('searchMethod')!;

    for (const usage of usages) {
      switch (usage.operationType) {
        case 'read':
          readDist.add(usage.method, context.file);
          break;
        case 'create':
          createDist.add(usage.method, context.file);
          break;
        case 'update':
          updateDist.add(usage.method, context.file);
          break;
        case 'delete':
          deleteDist.add(usage.method, context.file);
          break;
        case 'search':
          searchDist.add(usage.method, context.file);
          break;
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<HttpMethodConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const usages = extractMethodUsages(context.content, context.file);
    if (usages.length === 0) {
      return this.createEmptyResult();
    }

    const learnedRead = conventions.conventions.readMethod?.value;
    const learnedCreate = conventions.conventions.createMethod?.value;
    const learnedUpdate = conventions.conventions.updateMethod?.value;
    const learnedDelete = conventions.conventions.deleteMethod?.value;
    const learnedSearch = conventions.conventions.searchMethod?.value;

    for (const usage of usages) {
      let expectedMethod: HttpMethod | undefined;
      let operationName: string | undefined;

      switch (usage.operationType) {
        case 'read':
          expectedMethod = learnedRead;
          operationName = 'read';
          break;
        case 'create':
          expectedMethod = learnedCreate;
          operationName = 'create';
          break;
        case 'update':
          expectedMethod = learnedUpdate;
          operationName = 'update';
          break;
        case 'delete':
          expectedMethod = learnedDelete;
          operationName = 'delete';
          break;
        case 'search':
          expectedMethod = learnedSearch;
          operationName = 'search';
          break;
      }

      if (expectedMethod && usage.method !== expectedMethod && usage.operationType !== 'unknown') {
        violations.push(this.createConventionViolation(
          context.file,
          usage.line,
          usage.column,
          `HTTP method for ${operationName}`,
          usage.method,
          expectedMethod,
          `Using ${usage.method} for ${operationName} operation but your project uses ${expectedMethod}.`
        ));
      }
    }

    // Create pattern match
    if (usages.length > 0) {
      const first = usages[0]!;
      patterns.push({
        patternId: `${this.id}/method-usage`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(violation: Violation): QuickFix | null {
    if (!violation.expected) {return null;}

    return {
      title: `Change to ${violation.expected}`,
      kind: 'quickfix',
      edit: {
        changes: {
          [violation.file]: [{
            range: violation.range,
            newText: violation.expected,
          }],
        },
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Replace '${violation.actual}' with '${violation.expected}'`,
    };
  }
}

export function createHttpMethodsLearningDetector(): HttpMethodsLearningDetector {
  return new HttpMethodsLearningDetector();
}
