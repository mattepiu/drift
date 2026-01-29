/**
 * Client Patterns Detector - LEARNING VERSION
 *
 * Learns API client patterns from the user's codebase:
 * - Which HTTP client library is used (fetch, axios, react-query, swr, etc.)
 * - Whether a wrapper/abstraction is used
 * - Error handling patterns
 * - Auth header patterns
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

/** Types of API client patterns detected */
export type ClientPatternType =
  | 'fetch-wrapper'
  | 'axios-instance'
  | 'react-query'
  | 'swr'
  | 'trpc'
  | 'apollo'
  | 'urql'
  | 'direct-fetch'
  | 'direct-axios';

/**
 * Conventions this detector learns
 */
export interface ClientConventions {
  [key: string]: unknown;
  /** Primary HTTP client library used */
  primaryClient: ClientPatternType;
  /** Whether project uses a wrapper/abstraction */
  usesWrapper: boolean;
  /** Whether project uses data fetching library (react-query, swr, etc.) */
  usesDataFetchingLib: boolean;
  /** Primary data fetching library if used */
  dataFetchingLib: 'react-query' | 'swr' | 'apollo' | 'urql' | 'trpc' | null;
}

interface ClientPatternInfo {
  type: ClientPatternType;
  line: number;
  column: number;
  matchedText: string;
}

// ============================================================================
// Detection Patterns
// ============================================================================

const FETCH_WRAPPER_PATTERNS = [
  /(?:export\s+)?(?:const|function)\s+(\w*(?:fetch|api|client|http)\w*)\s*[=:]/gi,
  /class\s+(\w*(?:Api|Client|Http|Fetch)\w*)\s*(?:extends|implements|\{)/gi,
  /createClient\s*\(/gi,
  /createApiClient\s*\(/gi,
];

const AXIOS_INSTANCE_PATTERNS = [
  /axios\.create\s*\(/gi,
  /(?:const|let|var)\s+(\w+)\s*=\s*axios\.create/gi,
];

const REACT_QUERY_PATTERNS = [
  /useQuery\s*[<(]/gi,
  /useMutation\s*[<(]/gi,
  /useInfiniteQuery\s*[<(]/gi,
  /QueryClient\s*\(/gi,
];

const SWR_PATTERNS = [
  /useSWR\s*[<(]/gi,
  /useSWRMutation\s*[<(]/gi,
];

const TRPC_PATTERNS = [
  /trpc\.\w+\.(query|mutation|useQuery|useMutation)/gi,
  /createTRPCClient/gi,
  /createTRPCReact/gi,
];

const APOLLO_PATTERNS = [
  /useQuery\s*\(\s*gql/gi,
  /useMutation\s*\(\s*gql/gi,
  /ApolloClient\s*\(/gi,
];

const URQL_PATTERNS = [
  /useQuery\s*\(\s*\{[^}]*query:/gi,
  /createClient\s*\(\s*\{[^}]*url:/gi,
];

const DIRECT_FETCH_PATTERNS = [
  /(?<!\.)\bfetch\s*\(\s*['"`]/gi,
  /window\.fetch\s*\(/gi,
];

const DIRECT_AXIOS_PATTERNS = [
  /axios\.(get|post|put|patch|delete|request)\s*\(/gi,
  /axios\s*\(\s*\{/gi,
];

// ============================================================================
// Helper Functions
// ============================================================================

function getPosition(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

function detectPatterns(content: string, patterns: RegExp[], type: ClientPatternType): ClientPatternInfo[] {
  const results: ClientPatternInfo[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const { line, column } = getPosition(content, match.index);
      results.push({ type, line, column, matchedText: match[0] });
    }
  }
  return results;
}

function extractAllPatterns(content: string): ClientPatternInfo[] {
  return [
    ...detectPatterns(content, FETCH_WRAPPER_PATTERNS, 'fetch-wrapper'),
    ...detectPatterns(content, AXIOS_INSTANCE_PATTERNS, 'axios-instance'),
    ...detectPatterns(content, REACT_QUERY_PATTERNS, 'react-query'),
    ...detectPatterns(content, SWR_PATTERNS, 'swr'),
    ...detectPatterns(content, TRPC_PATTERNS, 'trpc'),
    ...detectPatterns(content, APOLLO_PATTERNS, 'apollo'),
    ...detectPatterns(content, URQL_PATTERNS, 'urql'),
    ...detectPatterns(content, DIRECT_FETCH_PATTERNS, 'direct-fetch'),
    ...detectPatterns(content, DIRECT_AXIOS_PATTERNS, 'direct-axios'),
  ];
}

const DATA_FETCHING_LIBS: ClientPatternType[] = ['react-query', 'swr', 'apollo', 'urql', 'trpc'];

// ============================================================================
// Learning Client Patterns Detector
// ============================================================================

export class ClientPatternsLearningDetector extends LearningDetector<ClientConventions> {
  readonly id = 'api/client-patterns';
  readonly category = 'api' as const;
  readonly subcategory = 'client';
  readonly name = 'Client Patterns Detector (Learning)';
  readonly description = 'Learns API client patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ClientConventions> {
    return ['primaryClient', 'usesWrapper', 'usesDataFetchingLib', 'dataFetchingLib'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ClientConventions, ValueDistribution>
  ): void {
    const patterns = extractAllPatterns(context.content);
    if (patterns.length === 0) {return;}

    const clientDist = distributions.get('primaryClient')!;
    const wrapperDist = distributions.get('usesWrapper')!;
    const dataFetchDist = distributions.get('usesDataFetchingLib')!;
    const dataFetchLibDist = distributions.get('dataFetchingLib')!;

    let hasWrapper = false;
    let hasDataFetchingLib = false;

    for (const pattern of patterns) {
      // Track primary client type
      if (pattern.type === 'fetch-wrapper' || pattern.type === 'axios-instance') {
        clientDist.add(pattern.type, context.file);
        hasWrapper = true;
      } else if (pattern.type === 'direct-fetch') {
        clientDist.add('direct-fetch', context.file);
      } else if (pattern.type === 'direct-axios') {
        clientDist.add('direct-axios', context.file);
      }

      // Track data fetching libraries
      if (DATA_FETCHING_LIBS.includes(pattern.type)) {
        hasDataFetchingLib = true;
        dataFetchLibDist.add(pattern.type, context.file);
      }
    }

    wrapperDist.add(hasWrapper, context.file);
    dataFetchDist.add(hasDataFetchingLib, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ClientConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const detectedPatterns = extractAllPatterns(context.content);
    if (detectedPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedUsesWrapper = conventions.conventions.usesWrapper?.value;
    const learnedDataFetchLib = conventions.conventions.dataFetchingLib?.value;

    for (const pattern of detectedPatterns) {
      // If project uses wrappers, flag direct calls
      if (learnedUsesWrapper === true) {
        if (pattern.type === 'direct-fetch' || pattern.type === 'direct-axios') {
          violations.push(this.createConventionViolation(
            context.file,
            pattern.line,
            pattern.column,
            'API client usage',
            pattern.type,
            'wrapper/abstraction',
            `Direct ${pattern.type === 'direct-fetch' ? 'fetch' : 'axios'} call detected. Your project uses API client wrappers.`
          ));
        }
      }

      // If project uses a specific data fetching library, flag mixing
      if (learnedDataFetchLib && DATA_FETCHING_LIBS.includes(pattern.type)) {
        if (pattern.type !== learnedDataFetchLib) {
          violations.push(this.createConventionViolation(
            context.file,
            pattern.line,
            pattern.column,
            'data fetching library',
            pattern.type,
            learnedDataFetchLib,
            `Using ${pattern.type} but your project primarily uses ${learnedDataFetchLib}.`
          ));
        }
      }
    }

    // Create pattern match for detected client usage
    if (detectedPatterns.length > 0) {
      const first = detectedPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/client-usage`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null; // Client pattern fixes require more context
  }
}

export function createClientPatternsLearningDetector(): ClientPatternsLearningDetector {
  return new ClientPatternsLearningDetector();
}
