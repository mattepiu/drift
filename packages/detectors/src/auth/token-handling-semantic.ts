/**
 * Token Handling Detector - SEMANTIC VERSION
 * 
 * Language-agnostic detector that finds token handling patterns.
 * 
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (auth/, middleware/, etc.)
 * - Surrounding code context (auth imports, security patterns)
 * - Semantic disambiguation (API tokens vs auth tokens)
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

// ============================================================================
// Context Validation Patterns
// ============================================================================

/** File paths that indicate auth-related code */
const AUTH_FILE_PATTERNS = [
  /auth/i, /login/i, /session/i, /middleware/i, /security/i,
  /guard/i, /protect/i, /jwt/i, /oauth/i, /identity/i,
  /user.*service/i, /account/i, /credential/i,
];

/** File paths that indicate NON-auth code (false positive sources) */
const NON_AUTH_FILE_PATTERNS = [
  /invoice/i, /billing/i, /payment/i, /cost/i, /pricing/i,
  /analytics/i, /metrics/i, /monitoring/i, /dashboard/i,
  /creative/i, /asset/i, /media/i, /image/i,
  /llm/i, /ai/i, /gemini/i, /openai/i, /anthropic/i,
  /demo/i, /landing/i, /marketing/i, /public/i,
];

/** Keywords in surrounding context that indicate auth usage */
const AUTH_CONTEXT_KEYWORDS = [
  'authorization', 'authenticate', 'login', 'logout', 'signin', 'signout',
  'verify', 'validate', 'decode', 'encode', 'secret', 'credential',
  'bearer', 'jwt', 'oauth', 'session', 'user', 'identity', 'permission',
];

/** Keywords that indicate NON-auth token usage (API tokens, LLM tokens, etc.) */
const NON_AUTH_CONTEXT_KEYWORDS = [
  'api_cost', 'token_count', 'token_usage', 'tokens_used', 'input_tokens',
  'output_tokens', 'total_tokens', 'gemini', 'openai', 'anthropic', 'llm',
  'completion', 'prompt', 'embedding', 'model', 'inference',
  'billing', 'cost', 'price', 'usage', 'metrics', 'analytics',
];

export class TokenHandlingSemanticDetector extends SemanticDetector {
  readonly id = 'auth/token-handling';
  readonly name = 'Token Handling Detector';
  readonly description = 'Learns token handling patterns from your codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'token-handling';

  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'css', 'scss', 'json', 'yaml', 'markdown'
  ];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
    });
  }

  protected getSemanticKeywords(): string[] {
    return [
      // High-confidence auth tokens (rarely false positives)
      'jwt', 'bearer', 'access_token', 'accessToken',
      'refresh_token', 'refreshToken', 'id_token', 'idToken', 
      'auth_token', 'authToken',
      // Medium-confidence (need context validation)
      'token', 'session', 'cookie', 'localStorage', 'sessionStorage',
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
    
    // High-confidence keywords always match (jwt, bearer, etc.)
    const highConfidenceKeywords = ['jwt', 'bearer', 'access_token', 'accessToken', 
      'refresh_token', 'refreshToken', 'id_token', 'idToken', 'auth_token', 'authToken'];
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }
    
    // For ambiguous keywords like "token", "session", apply context validation
    
    // Check for NON-auth context indicators (strong negative signal)
    for (const nonAuthKeyword of NON_AUTH_CONTEXT_KEYWORDS) {
      if (contextLower.includes(nonAuthKeyword) || lineLower.includes(nonAuthKeyword)) {
        return false;
      }
    }
    
    // Check file path for NON-auth patterns
    for (const pattern of NON_AUTH_FILE_PATTERNS) {
      if (pattern.test(file)) {
        // File is in a non-auth area - require strong auth context to match
        const hasAuthContext = AUTH_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (!hasAuthContext) {
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
    
    // Require positive auth context for ambiguous keywords
    if (authContextScore === 0 && nonAuthContextScore === 0) {
      // No clear context - check for common false positive patterns
      if (/tokens?\s*[:=]\s*\d+/i.test(lineContent)) {return false;} // token count
      if (/tokens?\s*[:=]\s*{/i.test(lineContent)) {return false;} // token object (likely metrics)
      if (/cost.*tokens?|tokens?.*cost/i.test(contextLower)) {return false;} // cost tracking
    }
    
    return authContextScore > nonAuthContextScore;
  }

  protected createPatternViolation(match: SemanticMatch, dominantPattern: UsagePattern): Violation {
    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity: 'warning',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent token handling: using '${match.contextType}' but project uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for token handling in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createTokenHandlingSemanticDetector(): TokenHandlingSemanticDetector {
  return new TokenHandlingSemanticDetector();
}
