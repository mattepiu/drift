/**
 * ASP.NET Core Policy Handlers Detector - SEMANTIC VERSION
 *
 * Learns authorization policy patterns from your ASP.NET Core codebase:
 * - IAuthorizationHandler implementations
 * - AuthorizationHandler<T> base class usage
 * - IAuthorizationRequirement implementations
 * - Policy registration in AddAuthorization()
 * - Custom policy evaluation
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (Handlers/, Authorization/, etc.)
 * - Surrounding code context (ASP.NET Authorization imports)
 * - Semantic disambiguation (auth handlers vs generic handlers)
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

/** File paths that indicate policy handler-related code */
const POLICY_FILE_PATTERNS = [
  /handler/i, /authorization/i, /auth/i, /policy/i,
  /requirement/i, /security/i, /startup/i, /program/i,
  /configuration/i, /services/i,
];

/** File paths that indicate NON-policy code (false positive sources) */
const NON_POLICY_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /tests\//i, /specs\//i,
  /mock/i, /fake/i, /stub/i,
  /migrations\//i, /\.designer\./i,
  /exception/i, /error/i,
];

/** Keywords in surrounding context that indicate policy handler usage */
const POLICY_CONTEXT_KEYWORDS = [
  'microsoft.aspnetcore.authorization',
  'iauthorizationhandler', 'authorizationhandler',
  'iauthorizationrequirement', 'authorizationhandlercontext',
  'addauthorization', 'authorizationpolicybuilder',
  'requirerole', 'requireclaim', 'requireassertion',
  'requireauthenticateduser', 'addpolicy',
  'handleasync', 'handlerequirementasync',
  'context.succeed', 'context.fail',
];

/** Keywords that indicate NON-policy handler usage */
const NON_POLICY_CONTEXT_KEYWORDS = [
  'exceptionhandler', 'errorhandler', 'messagehandler',
  'eventhandler', 'requesthandler', 'commandhandler',
  'test', 'mock', 'fake', 'stub',
];

// ============================================================================
// Policy Handlers Semantic Detector
// ============================================================================

export class PolicyHandlersSemanticDetector extends SemanticDetector {
  readonly id = 'auth/aspnet-policy-handlers';
  readonly name = 'ASP.NET Policy Handlers Detector';
  readonly description = 'Learns authorization policy handler patterns from your ASP.NET Core codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'policy';

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
   * Semantic keywords for policy handler detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // Authorization handler interfaces and base classes
      'IAuthorizationHandler', 'AuthorizationHandler',
      'IAuthorizationRequirement', 'AuthorizationHandlerContext',
      
      // Policy registration
      'AddAuthorization', 'AuthorizationPolicyBuilder', 'AddPolicy',
      
      // Policy builder methods
      'RequireRole', 'RequireClaim', 'RequireAssertion',
      'RequireAuthenticatedUser', 'AddRequirements',
      
      // Handler implementation
      'HandleAsync', 'HandleRequirementAsync',
      'Succeed', 'Fail',
      
      // Authorization result
      'AuthorizationResult', 'AuthorizationFailure',
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

    // High-confidence keywords - Authorization-specific types
    const highConfidenceKeywords = [
      'IAuthorizationHandler', 'AuthorizationHandler',
      'IAuthorizationRequirement', 'AuthorizationHandlerContext',
      'AddAuthorization', 'AuthorizationPolicyBuilder',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    // Skip if in test files (unless strong policy context)
    for (const pattern of NON_POLICY_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const hasPolicyContext = POLICY_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (!hasPolicyContext) {
          return false;
        }
      }
    }

    // Skip if it's in a comment
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // Skip non-authorization handlers
    for (const nonPolicyKeyword of NON_POLICY_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonPolicyKeyword)) {
        return false;
      }
    }

    // For ambiguous keywords like 'HandleAsync', 'Succeed', require policy context
    const ambiguousKeywords = ['HandleAsync', 'Succeed', 'Fail', 'AddPolicy'];
    if (ambiguousKeywords.includes(keyword)) {
      const hasPolicyContext = POLICY_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasPolicyContext) {
        const inPolicyFile = POLICY_FILE_PATTERNS.some(p => p.test(file));
        if (!inPolicyFile) {
          return false;
        }
      }
    }

    // Check file path for policy patterns (strong positive signal)
    for (const pattern of POLICY_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context for policy keywords
    const policyContextScore = POLICY_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;
    const nonPolicyContextScore = NON_POLICY_CONTEXT_KEYWORDS.filter(k => contextLower.includes(k)).length;

    return policyContextScore > nonPolicyContextScore;
  }

  /**
   * Create violation for inconsistent policy handler pattern
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
      message: `Inconsistent policy handler pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for policy handlers in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createPolicyHandlersSemanticDetector(): PolicyHandlersSemanticDetector {
  return new PolicyHandlersSemanticDetector();
}
