/**
 * ASP.NET Core Identity Patterns Detector - SEMANTIC VERSION
 *
 * Learns ASP.NET Identity usage patterns from your codebase:
 * - UserManager<T> usage
 * - SignInManager<T> usage
 * - RoleManager<T> usage
 * - IdentityUser extensions
 * - Password hashing patterns
 * - User/role store patterns
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (Services/, Identity/, etc.)
 * - Surrounding code context (ASP.NET Identity imports)
 * - Semantic disambiguation (Identity framework vs generic identity)
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

/** File paths that indicate ASP.NET Identity-related code */
const IDENTITY_FILE_PATTERNS = [
  /identity/i, /auth/i, /account/i, /user/i,
  /services/i, /managers/i, /stores/i,
  /startup/i, /program/i, /configuration/i,
];

/** File paths that indicate NON-identity code (false positive sources) */
const NON_IDENTITY_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /tests\//i, /specs\//i,
  /mock/i, /fake/i, /stub/i,
  /migrations\//i, /\.designer\./i,
  /dto/i, /viewmodel/i, /model(?!s?\/).*\.cs$/i,
];

/** Keywords in surrounding context that indicate ASP.NET Identity usage */
const IDENTITY_CONTEXT_KEYWORDS = [
  'microsoft.aspnetcore.identity', 'microsoft.extensions.identity',
  'identityuser', 'identityrole', 'identitydbcontext',
  'usermanager', 'signinmanager', 'rolemanager',
  'ipasswordhasher', 'iuserstore', 'irolestore',
  'createasync', 'deleteasync', 'findbynameasync', 'findbyidasync',
  'passwordsigninasync', 'signinasync', 'signoutasync',
  'addtoroleasync', 'isroleasync', 'getrolesasync',
];

/** Keywords that indicate NON-identity usage */
const NON_IDENTITY_CONTEXT_KEYWORDS = [
  'test', 'mock', 'fake', 'stub',
  'xmlattribute', 'jsonproperty',
  'entityframework', 'dbset<',
];

// ============================================================================
// Identity Patterns Semantic Detector
// ============================================================================

export class IdentityPatternsSemanticDetector extends SemanticDetector {
  readonly id = 'auth/aspnet-identity-patterns';
  readonly name = 'ASP.NET Identity Patterns Detector';
  readonly description = 'Learns ASP.NET Core Identity usage patterns (UserManager, SignInManager, etc.) from your codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'identity';

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
   * Semantic keywords for ASP.NET Identity detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // Core Identity managers
      'UserManager', 'SignInManager', 'RoleManager',
      
      // Identity base classes
      'IdentityUser', 'IdentityRole', 'IdentityDbContext',
      
      // Identity interfaces
      'IPasswordHasher', 'IUserStore', 'IRoleStore',
      'IUserClaimStore', 'IUserRoleStore', 'IUserLoginStore',
      
      // Common UserManager methods
      'CreateAsync', 'DeleteAsync', 'UpdateAsync',
      'FindByIdAsync', 'FindByNameAsync', 'FindByEmailAsync',
      'AddToRoleAsync', 'RemoveFromRoleAsync', 'GetRolesAsync', 'IsInRoleAsync',
      'AddClaimAsync', 'RemoveClaimAsync', 'GetClaimsAsync',
      'GeneratePasswordResetTokenAsync', 'ResetPasswordAsync', 'ChangePasswordAsync',
      
      // Common SignInManager methods
      'PasswordSignInAsync', 'SignInAsync', 'SignOutAsync',
      'RefreshSignInAsync', 'ExternalLoginSignInAsync', 'TwoFactorSignInAsync',
      'CanSignInAsync', 'IsSignedIn',
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

    // High-confidence keywords - Identity manager types
    const highConfidenceKeywords = [
      'UserManager', 'SignInManager', 'RoleManager',
      'IdentityUser', 'IdentityRole', 'IdentityDbContext',
      'IPasswordHasher', 'IUserStore', 'IRoleStore',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      // Verify it's actually the type, not just a substring
      const typePattern = new RegExp(`\\b${keyword}\\s*[<(]|:\\s*${keyword}|new\\s+${keyword}`, 'i');
      if (typePattern.test(lineContent)) {
        return true;
      }
    }

    // Skip if in test files
    for (const pattern of NON_IDENTITY_FILE_PATTERNS) {
      if (pattern.test(file)) {
        // Allow if there's strong identity context
        const hasIdentityContext = IDENTITY_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (!hasIdentityContext) {
          return false;
        }
      }
    }

    // Skip if it's in a comment
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // Check for NON-identity context indicators
    for (const nonIdentityKeyword of NON_IDENTITY_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonIdentityKeyword) && !lineLower.includes('identity')) {
        return false;
      }
    }

    // Check file path for identity patterns (strong positive signal)
    for (const pattern of IDENTITY_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context for ASP.NET Identity keywords
    const identityContextScore = IDENTITY_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
    const nonIdentityContextScore = NON_IDENTITY_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;

    return identityContextScore > nonIdentityContextScore;
  }

  /**
   * Create violation for inconsistent Identity pattern
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
      message: `Inconsistent Identity pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for ASP.NET Identity in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createIdentityPatternsSemanticDetector(): IdentityPatternsSemanticDetector {
  return new IdentityPatternsSemanticDetector();
}
