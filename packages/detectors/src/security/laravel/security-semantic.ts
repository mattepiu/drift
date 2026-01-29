/**
 * Laravel Security Patterns Detector - SEMANTIC VERSION
 *
 * Learns security patterns from your Laravel codebase:
 * - CSRF protection patterns
 * - Mass assignment protection ($fillable, $guarded)
 * - XSS prevention (escaping, sanitization)
 * - Input validation patterns
 * - Authentication guards
 * - Rate limiting
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

const SECURITY_FILE_PATTERNS = [
  /middleware\//i, /requests\//i, /policies\//i,
  /controllers\//i, /models\//i, /kernel\.php$/i,
  /verifycsr/i, /throttle/i,
];

const SECURITY_CONTEXT_KEYWORDS = [
  'illuminate\\foundation\\http\\middleware',
  'illuminate\\http\\request',
  'csrf', 'verifycsr', 'xss', 'sanitize',
  '$fillable', '$guarded', '$hidden',
  'validate', 'validated', 'rules',
  'throttle', 'ratelimit',
  'encrypt', 'decrypt', 'hash',
];

// ============================================================================
// Laravel Security Semantic Detector
// ============================================================================

export class LaravelSecuritySemanticDetector extends SemanticDetector {
  readonly id = 'security/laravel-security-semantic';
  readonly name = 'Laravel Security Patterns Detector';
  readonly description = 'Learns security patterns from your Laravel codebase';
  readonly category = 'security' as const;
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
      // CSRF protection
      'csrf', 'VerifyCsrfToken', 'csrf_token', 'csrf_field',
      '@csrf', '_token',
      
      // Mass assignment
      'fillable', 'guarded', 'hidden', 'visible',
      'forceFill', 'fill',
      
      // XSS prevention
      'escape', 'e(', 'htmlspecialchars', 'htmlentities',
      'strip_tags', 'clean', 'purify', 'sanitize',
      
      // Input validation
      'validate', 'validated', 'rules', 'messages', 'attributes',
      'FormRequest', 'authorize', 'prepareForValidation',
      'required', 'string', 'email', 'numeric', 'integer',
      'min', 'max', 'between', 'in', 'exists', 'unique',
      'confirmed', 'password', 'current_password',
      
      // Rate limiting
      'throttle', 'RateLimiter', 'RateLimiting',
      'perMinute', 'perHour', 'perDay',
      'tooManyAttempts', 'hit', 'clear',
      
      // Encryption/Hashing
      'encrypt', 'decrypt', 'Crypt',
      'Hash', 'bcrypt', 'argon', 'argon2id',
      'make', 'check', 'needsRehash',
      
      // Authentication guards
      'guard', 'guards', 'provider', 'providers',
      'attempt', 'login', 'logout', 'check',
      
      // Authorization
      'authorize', 'can', 'cannot', 'allows', 'denies',
      'Policy', 'Gate',
      
      // Security headers
      'header', 'headers', 'Content-Security-Policy',
      'X-Frame-Options', 'X-XSS-Protection',
    ];
  }

  protected getSemanticCategory(): string {
    return 'security';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    // High-confidence keywords
    const highConfidenceKeywords = [
      'csrf', 'VerifyCsrfToken', 'fillable', 'guarded',
      'FormRequest', 'throttle', 'RateLimiter',
      'encrypt', 'decrypt', 'Hash', 'bcrypt',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    // Skip comments
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // For ambiguous keywords, require security context
    const ambiguousKeywords = ['validate', 'rules', 'authorize', 'check', 'make', 'guard'];
    if (ambiguousKeywords.includes(keyword.toLowerCase())) {
      const hasContext = SECURITY_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inSecurityFile = SECURITY_FILE_PATTERNS.some(p => p.test(file));
        if (!inSecurityFile) {return false;}
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
      message: `Inconsistent security pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for security in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelSecuritySemanticDetector(): LaravelSecuritySemanticDetector {
  return new LaravelSecuritySemanticDetector();
}
