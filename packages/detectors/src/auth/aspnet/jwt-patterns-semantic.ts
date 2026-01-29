/**
 * ASP.NET Core JWT Patterns Detector - SEMANTIC VERSION
 *
 * Learns JWT authentication patterns from your ASP.NET Core codebase:
 * - JwtBearerDefaults.AuthenticationScheme
 * - Token validation parameters
 * - Claims extraction patterns
 * - Token generation patterns
 * - JWT configuration in Startup/Program
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (Auth/, Configuration/, etc.)
 * - Surrounding code context (JWT/Bearer imports)
 * - Semantic disambiguation (JWT auth vs generic token handling)
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

/** File paths that indicate JWT-related code */
const JWT_FILE_PATTERNS = [
  /auth/i, /jwt/i, /token/i, /bearer/i,
  /startup/i, /program/i, /configuration/i,
  /services/i, /handlers/i, /middleware/i,
];

/** File paths that indicate NON-JWT code (false positive sources) */
const NON_JWT_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /tests\//i, /specs\//i,
  /mock/i, /fake/i, /stub/i,
  /migrations\//i, /\.designer\./i,
];

/** Keywords in surrounding context that indicate JWT usage */
const JWT_CONTEXT_KEYWORDS = [
  'microsoft.aspnetcore.authentication.jwtbearer',
  'system.identitymodel.tokens.jwt',
  'microsoft.identitymodel.tokens',
  'jwtbearer', 'jwtbearerdefaults', 'jwtsecuritytoken',
  'tokenvalidationparameters', 'securitytoken',
  'signingcredentials', 'symmetricsecuritykey',
  'claimtypes', 'claimsprincipal', 'claims',
  'bearer', 'authorization', 'authenticate',
];

/** Keywords that indicate NON-JWT token usage */
const NON_JWT_CONTEXT_KEYWORDS = [
  'cancellationtoken', 'csrftoken', 'antiforgerytoken',
  'xmltoken', 'stringtoken', 'lexer',
  'test', 'mock', 'fake',
];

// ============================================================================
// JWT Patterns Semantic Detector
// ============================================================================

export class JwtPatternsSemanticDetector extends SemanticDetector {
  readonly id = 'auth/aspnet-jwt-patterns';
  readonly name = 'ASP.NET JWT Patterns Detector';
  readonly description = 'Learns JWT authentication patterns from your ASP.NET Core codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'jwt';

  // C# only - this is ASP.NET specific
  override readonly supportedLanguages: Language[] = ['csharp'];

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
   * Semantic keywords for JWT detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // JWT Bearer authentication
      'JwtBearer', 'JwtBearerDefaults', 'AddJwtBearer',
      'JwtSecurityToken', 'JwtSecurityTokenHandler',
      
      // Token validation
      'TokenValidationParameters', 'ValidateIssuer', 'ValidateAudience',
      'ValidateLifetime', 'ValidateIssuerSigningKey',
      'ValidIssuer', 'ValidAudience', 'IssuerSigningKey',
      'ClockSkew', 'RequireExpirationTime', 'RequireSignedTokens',
      
      // Security keys
      'SymmetricSecurityKey', 'RsaSecurityKey', 'X509SecurityKey',
      'SigningCredentials', 'SecurityKey', 'JsonWebKey',
      
      // Claims
      'ClaimTypes', 'ClaimsPrincipal', 'FindFirst', 'FindFirstValue',
      'User.Claims', 'GetClaim',
      
      // Token generation
      'WriteToken', 'CreateToken', 'SecurityTokenDescriptor',
      
      // Bearer scheme
      'Bearer', 'AuthenticationScheme',
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

    // High-confidence keywords - JWT-specific types
    const highConfidenceKeywords = [
      'JwtBearer', 'JwtBearerDefaults', 'AddJwtBearer',
      'JwtSecurityToken', 'JwtSecurityTokenHandler',
      'TokenValidationParameters', 'SymmetricSecurityKey',
      'SigningCredentials', 'SecurityTokenDescriptor',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    // Skip if in test files (unless strong JWT context)
    for (const pattern of NON_JWT_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const hasJwtContext = JWT_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (!hasJwtContext) {
          return false;
        }
      }
    }

    // Skip if it's in a comment
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // Skip non-JWT token types
    for (const nonJwtKeyword of NON_JWT_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonJwtKeyword)) {
        return false;
      }
    }

    // For ambiguous keywords like 'Bearer', 'Claims', require JWT context
    const ambiguousKeywords = ['Bearer', 'Claims', 'ClaimTypes', 'FindFirst', 'SecurityKey'];
    if (ambiguousKeywords.includes(keyword)) {
      const hasJwtContext = JWT_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasJwtContext) {
        // Check file path as fallback
        const inJwtFile = JWT_FILE_PATTERNS.some(p => p.test(file));
        if (!inJwtFile) {
          return false;
        }
      }
    }

    // Check file path for JWT patterns (strong positive signal)
    for (const pattern of JWT_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context for JWT keywords
    const jwtContextScore = JWT_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
    const nonJwtContextScore = NON_JWT_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;

    return jwtContextScore > nonJwtContextScore;
  }

  /**
   * Create violation for inconsistent JWT pattern
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
      message: `Inconsistent JWT pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for JWT authentication in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createJwtPatternsSemanticDetector(): JwtPatternsSemanticDetector {
  return new JwtPatternsSemanticDetector();
}
