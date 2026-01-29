/**
 * Laravel Auth Patterns Detector - SEMANTIC VERSION
 *
 * Learns authentication and authorization patterns from your Laravel codebase:
 * - Gate definitions and checks
 * - Policy classes and methods
 * - Middleware usage patterns
 * - Auth facade usage
 * - Authorization helpers ($this->authorize, can(), cannot())
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (Policies/, Middleware/, etc.)
 * - Surrounding code context (Laravel auth imports)
 * - Semantic disambiguation (auth vs generic checks)
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

// ============================================================================
// Context Validation Patterns
// ============================================================================

/** File paths that indicate Laravel auth-related code */
const AUTH_FILE_PATTERNS = [
  /policies\//i, /middleware\//i, /providers\//i,
  /auth/i, /guards\//i, /gates\//i,
  /kernel\.php$/i, /authserviceprovider/i,
];

/** File paths that indicate NON-auth code */
const NON_AUTH_FILE_PATTERNS = [
  /migrations\//i, /database\//i, /factories\//i,
  /views\//i, /resources\//i, /public\//i,
  /\.blade\.php$/i,
];

/** Keywords in surrounding context that indicate Laravel auth usage */
const AUTH_CONTEXT_KEYWORDS = [
  'illuminate\\support\\facades\\gate',
  'illuminate\\support\\facades\\auth',
  'illuminate\\auth\\access',
  'illuminate\\contracts\\auth',
  'handlesauthorization',
  'authserviceprovider',
  'gate::define', 'gate::before', 'gate::after',
  'gate::allows', 'gate::denies', 'gate::check',
  '$this->authorize', 'can(', 'cannot(',
  'middleware(', 'auth:',
];

/** Keywords that indicate NON-auth usage */
const NON_AUTH_CONTEXT_KEYWORDS = [
  'test', 'mock', 'fake', 'stub',
  'migration', 'seeder', 'factory',
];

// ============================================================================
// Laravel Auth Semantic Detector
// ============================================================================

export class LaravelAuthSemanticDetector extends SemanticDetector {
  readonly id = 'auth/laravel-auth-semantic';
  readonly name = 'Laravel Auth Patterns Detector';
  readonly description = 'Learns authentication and authorization patterns from your Laravel codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'laravel';

  // PHP only - this is Laravel specific
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

  /**
   * Semantic keywords for Laravel auth detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // Gate patterns
      'Gate', 'define', 'allows', 'denies', 'check', 'any', 'none',
      'before', 'after', 'forUser',
      
      // Policy patterns
      'Policy', 'authorize', 'authorizeResource', 'authorizeForUser',
      'can', 'cannot', 'canAny', 'HandlesAuthorization',
      
      // Middleware patterns
      'middleware', 'auth', 'guest', 'verified', 'password.confirm',
      'can:', 'ability:', 'role:',
      
      // Auth facade
      'Auth', 'user', 'check', 'guest', 'id', 'attempt', 'login', 'logout',
      'guard', 'viaRemember', 'once', 'onceUsingId',
      
      // Sanctum/Passport
      'sanctum', 'passport', 'token', 'abilities', 'tokenCan',
      'createToken', 'currentAccessToken',
    ];
  }

  protected getSemanticCategory(): string {
    return 'auth';
  }

  /**
   * Context-aware filtering to eliminate false positives
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();
    const lineLower = lineContent.toLowerCase();

    // High-confidence keywords - Laravel auth-specific
    const highConfidenceKeywords = [
      'Gate', 'Policy', 'HandlesAuthorization', 'authorizeResource',
      'sanctum', 'passport', 'tokenCan', 'createToken',
      'AuthServiceProvider', 'middleware',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      // Still check for false positives
      if (keyword === 'Gate' && !lineLower.includes('gate::') && !lineLower.includes('use ')) {
        return false;
      }
      return true;
    }

    // Skip if in non-auth files (unless strong auth context)
    for (const pattern of NON_AUTH_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const hasAuthContext = AUTH_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (!hasAuthContext) {
          return false;
        }
      }
    }

    // Skip if it's in a comment
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent) || /^\s*#/.test(lineContent)) {
      return false;
    }

    // Skip non-auth context
    for (const nonAuthKeyword of NON_AUTH_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonAuthKeyword)) {
        return false;
      }
    }

    // For ambiguous keywords like 'can', 'check', 'user', require auth context
    const ambiguousKeywords = ['can', 'cannot', 'check', 'user', 'guest', 'auth', 'login', 'logout'];
    if (ambiguousKeywords.includes(keyword.toLowerCase())) {
      const hasAuthContext = AUTH_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasAuthContext) {
        // Check file path as fallback
        const inAuthFile = AUTH_FILE_PATTERNS.some(p => p.test(file));
        if (!inAuthFile) {
          return false;
        }
      }
    }

    // Check file path for auth patterns (strong positive signal)
    for (const pattern of AUTH_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context for auth keywords
    const authContextScore = AUTH_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
    const nonAuthContextScore = NON_AUTH_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;

    return authContextScore > nonAuthContextScore;
  }

  /**
   * Create violation for inconsistent auth pattern
   */
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
      message: `Inconsistent Laravel auth pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for authentication/authorization in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelAuthSemanticDetector(): LaravelAuthSemanticDetector {
  return new LaravelAuthSemanticDetector();
}
