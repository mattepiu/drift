/**
 * ASP.NET Core Resource-Based Authorization Detector - SEMANTIC VERSION
 *
 * Learns resource-based authorization patterns from your ASP.NET Core codebase:
 * - IAuthorizationService.AuthorizeAsync() usage
 * - Resource-based policy checks
 * - Ownership validation patterns
 * - Document/entity-level authorization
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (Controllers/, Services/, etc.)
 * - Surrounding code context (Authorization service imports)
 * - Semantic disambiguation (resource auth vs generic auth)
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

/** File paths that indicate resource authorization-related code */
const RESOURCE_AUTH_FILE_PATTERNS = [
  /controller/i, /controllers/i, /api\//i, /endpoints/i,
  /auth/i, /authorization/i, /security/i,
  /services/i, /handlers/i,
];

/** File paths that indicate NON-resource-auth code (false positive sources) */
const NON_RESOURCE_AUTH_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /tests\//i, /specs\//i,
  /mock/i, /fake/i, /stub/i,
  /migrations\//i, /\.designer\./i,
];

/** Keywords in surrounding context that indicate resource authorization usage */
const RESOURCE_AUTH_CONTEXT_KEYWORDS = [
  'microsoft.aspnetcore.authorization',
  'iauthorizationservice', 'authorizeasync',
  'authorizationresult', 'succeeded', 'failure',
  'user.findfirst', 'nameidentifier', 'userid',
  'ownerid', 'createdby', 'authorid', 'tenantid',
  'controllerbase', 'controller', 'apicontroller',
];

/** Keywords that indicate NON-resource-auth usage */
const NON_RESOURCE_AUTH_CONTEXT_KEYWORDS = [
  'test', 'mock', 'fake', 'stub',
  'xmlattribute', 'jsonproperty',
];

// ============================================================================
// Resource Authorization Semantic Detector
// ============================================================================

export class ResourceAuthorizationSemanticDetector extends SemanticDetector {
  readonly id = 'auth/aspnet-resource-authorization';
  readonly name = 'ASP.NET Resource Authorization Detector';
  readonly description = 'Learns resource-based authorization patterns from your ASP.NET Core codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'resource-auth';

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
   * Semantic keywords for resource authorization detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // Authorization service
      'IAuthorizationService', 'AuthorizeAsync', 'AuthorizationResult',
      
      // Result checking
      'Succeeded', 'Failure', 'AuthorizationFailure',
      
      // Ownership patterns
      'UserId', 'OwnerId', 'CreatedBy', 'AuthorId', 'TenantId',
      'NameIdentifier', 'FindFirst', 'FindFirstValue',
      
      // Resource-based patterns
      'User.Claims', 'User.Identity', 'IsAuthenticated',
      
      // Common ownership check patterns
      'GetUserId', 'CurrentUserId', 'GetCurrentUser',
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

    // High-confidence keywords - Authorization service types
    const highConfidenceKeywords = [
      'IAuthorizationService', 'AuthorizeAsync', 'AuthorizationResult',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    // Skip if in test files (unless strong resource auth context)
    for (const pattern of NON_RESOURCE_AUTH_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const hasResourceAuthContext = RESOURCE_AUTH_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (!hasResourceAuthContext) {
          return false;
        }
      }
    }

    // Skip if it's in a comment
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // Skip non-resource-auth patterns
    for (const nonResourceAuthKeyword of NON_RESOURCE_AUTH_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonResourceAuthKeyword)) {
        return false;
      }
    }

    // For ambiguous keywords like 'UserId', 'OwnerId', require auth context
    const ambiguousKeywords = ['UserId', 'OwnerId', 'CreatedBy', 'TenantId', 'Succeeded'];
    if (ambiguousKeywords.includes(keyword)) {
      const hasResourceAuthContext = RESOURCE_AUTH_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasResourceAuthContext) {
        // Check for ownership comparison pattern
        const ownershipPattern = /\.\s*(?:UserId|OwnerId|CreatedBy|AuthorId)\s*==|==\s*\w+\.\s*(?:UserId|OwnerId)/i;
        if (!ownershipPattern.test(lineContent)) {
          return false;
        }
      }
    }

    // Check file path for resource auth patterns (strong positive signal)
    for (const pattern of RESOURCE_AUTH_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context for resource auth keywords
    const resourceAuthContextScore = RESOURCE_AUTH_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
    const nonResourceAuthContextScore = NON_RESOURCE_AUTH_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;

    return resourceAuthContextScore > nonResourceAuthContextScore;
  }

  /**
   * Create violation for inconsistent resource authorization pattern
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
      message: `Inconsistent resource authorization pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for resource authorization in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createResourceAuthorizationSemanticDetector(): ResourceAuthorizationSemanticDetector {
  return new ResourceAuthorizationSemanticDetector();
}
