/**
 * Laravel API Patterns Detector - SEMANTIC VERSION
 *
 * Learns API patterns from your Laravel codebase:
 * - Controller patterns (resource, invokable, API)
 * - Route patterns (RESTful, API versioning)
 * - Response patterns (JSON, Resources, Collections)
 * - Request handling patterns
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

const API_FILE_PATTERNS = [
  /controllers\//i, /routes\//i, /resources\//i,
  /api\.php$/i, /requests\//i,
];

const API_CONTEXT_KEYWORDS = [
  'illuminate\\routing', 'illuminate\\http',
  'route::', 'response()', 'request()',
  'jsonresource', 'resourcecollection',
  'apiresource', 'controller',
];


export class LaravelAPISemanticDetector extends SemanticDetector {
  readonly id = 'api/laravel-api-semantic';
  readonly name = 'Laravel API Patterns Detector';
  readonly description = 'Learns API patterns from your Laravel codebase';
  readonly category = 'api' as const;
  readonly subcategory = 'laravel';

  override readonly supportedLanguages: Language[] = ['php'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: false,
    });
  }

  protected getSemanticKeywords(): string[] {
    return [
      // Controllers
      'Controller', 'ResourceController', 'ApiController',
      'index', 'show', 'store', 'update', 'destroy',
      '__invoke', 'callAction',
      
      // Routes
      'Route', 'get', 'post', 'put', 'patch', 'delete', 'options',
      'resource', 'apiResource', 'singleton',
      'prefix', 'middleware', 'name', 'group',
      'where', 'whereNumber', 'whereAlpha', 'whereUuid',
      
      // Responses
      'response', 'json', 'jsonResponse', 'download', 'file', 'redirect',
      'JsonResource', 'ResourceCollection', 'AnonymousResourceCollection',
      'toArray', 'with', 'additional', 'wrap',
      
      // Requests
      'Request', 'FormRequest', 'input', 'query', 'all', 'only', 'except',
      'validated', 'validate', 'rules', 'authorize',
      'has', 'filled', 'missing', 'whenHas', 'whenFilled',
      
      // API versioning
      'v1', 'v2', 'api', 'version',
      
      // Rate limiting
      'throttle', 'RateLimiter',
      
      // Sanctum/Passport
      'sanctum', 'passport', 'token', 'abilities',
    ];
  }

  protected getSemanticCategory(): string {
    return 'api';
  }


  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    const highConfidenceKeywords = [
      'Controller', 'Route', 'JsonResource', 'ResourceCollection',
      'FormRequest', 'apiResource', 'sanctum', 'passport',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    const ambiguousKeywords = ['get', 'post', 'put', 'delete', 'index', 'show', 'store', 'update'];
    if (ambiguousKeywords.includes(keyword.toLowerCase())) {
      const hasContext = API_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inApiFile = API_FILE_PATTERNS.some(p => p.test(file));
        if (!inApiFile) {return false;}
      }
    }

    return true;
  }

  protected createPatternViolation(
    match: SemanticMatch,
    dominantPattern: UsagePattern
  ): Violation {
    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity: 'warning',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent API pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for API patterns in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelAPISemanticDetector(): LaravelAPISemanticDetector {
  return new LaravelAPISemanticDetector();
}
