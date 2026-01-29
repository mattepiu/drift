/**
 * ASP.NET Core Authorize Attribute Detector - SEMANTIC VERSION
 *
 * Learns authorization attribute patterns from your ASP.NET Core codebase:
 * - [Authorize] attribute usage
 * - [Authorize(Roles = "...")] role-based authorization
 * - [Authorize(Policy = "...")] policy-based authorization
 * - [AllowAnonymous] exceptions
 * - Authorization at controller vs action level
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (Controllers/, Services/, etc.)
 * - Surrounding code context (ASP.NET imports, controller patterns)
 * - Semantic disambiguation (attribute vs string usage)
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

/** File paths that indicate ASP.NET auth-related code */
const AUTH_FILE_PATTERNS = [
  /controller/i, /controllers/i, /api\//i, /endpoints/i,
  /auth/i, /authorization/i, /security/i, /middleware/i,
  /handlers/i, /filters/i,
];

/** File paths that indicate NON-auth code (false positive sources) */
const NON_AUTH_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /tests\//i, /specs\//i,
  /mock/i, /fake/i, /stub/i,
  /migrations\//i, /\.designer\./i,
];

/** Keywords in surrounding context that indicate ASP.NET auth usage */
const AUTH_CONTEXT_KEYWORDS = [
  'microsoft.aspnetcore.authorization', 'microsoft.aspnetcore.mvc',
  'controllerbase', 'controller', 'apicontroller',
  'httpget', 'httppost', 'httpput', 'httpdelete', 'httppatch',
  'actionresult', 'iactionresult', 'task<actionresult>',
  'user.', 'claims', 'identity', 'isauthenticated',
];

/** Keywords that indicate NON-auth attribute usage */
const NON_AUTH_CONTEXT_KEYWORDS = [
  'xmlattribute', 'jsonproperty', 'datamember',
  'obsolete', 'deprecated', 'description',
  'test', 'fact', 'theory', 'testmethod',
];

// ============================================================================
// Authorize Attribute Semantic Detector
// ============================================================================

export class AuthorizeAttributeSemanticDetector extends SemanticDetector {
  readonly id = 'auth/aspnet-authorize-attribute';
  readonly name = 'ASP.NET Authorize Attribute Detector';
  readonly description = 'Learns [Authorize] and [AllowAnonymous] attribute patterns from your ASP.NET Core codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'authorization';

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
   * Semantic keywords for ASP.NET authorization detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // High-confidence authorization keywords
      'Authorize', 'AllowAnonymous', 'AuthorizeAttribute', 'AllowAnonymousAttribute',
      
      // Authorization parameters
      'Roles', 'Policy', 'AuthenticationSchemes',
      
      // Related patterns
      'RequireAuthorization', 'RequireRole', 'RequireClaim',
      'ClaimsPrincipal', 'IsAuthenticated', 'IsInRole',
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

    // High-confidence keywords - attribute syntax
    if (/\[\s*Authorize/.test(lineContent) || /\[\s*AllowAnonymous/.test(lineContent)) {
      return true;
    }

    // Skip if in test files
    for (const pattern of NON_AUTH_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return false;
      }
    }

    // Skip if it's just a string literal (not an attribute)
    if (/["'].*Authorize.*["']/.test(lineContent) && !/\[/.test(lineContent)) {
      return false;
    }

    // Skip if it's in a comment
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // Check for NON-auth context indicators
    for (const nonAuthKeyword of NON_AUTH_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonAuthKeyword)) {
        return false;
      }
    }

    // Check file path for auth patterns (strong positive signal)
    for (const pattern of AUTH_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context for ASP.NET auth keywords
    const authContextScore = AUTH_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
    const nonAuthContextScore = NON_AUTH_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;

    // For ambiguous matches, require positive auth context
    if (authContextScore === 0 && !['Authorize', 'AllowAnonymous'].includes(keyword)) {
      return false;
    }

    return authContextScore > nonAuthContextScore;
  }

  /**
   * Create violation for inconsistent authorization pattern
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
      message: `Inconsistent authorization pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for authorization attributes in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createAuthorizeAttributeSemanticDetector(): AuthorizeAttributeSemanticDetector {
  return new AuthorizeAttributeSemanticDetector();
}
