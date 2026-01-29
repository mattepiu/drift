/**
 * RBAC Patterns Detector - SEMANTIC VERSION
 * 
 * Truly language-agnostic detector that finds role-based access control patterns
 * by looking for semantic concepts, not syntax.
 * 
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (auth/, middleware/, etc.)
 * - Surrounding code context (auth imports, security patterns)
 * - Semantic disambiguation (ARIA roles vs auth roles)
 * 
 * Works in ANY language: TypeScript, JavaScript, Python, Go, Rust, Java, etc.
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
  /guard/i, /protect/i, /permission/i, /rbac/i, /acl/i,
  /user.*service/i, /account/i, /admin/i,
];

/** File paths that indicate NON-auth code (false positive sources) */
const NON_AUTH_FILE_PATTERNS = [
  /component/i, /ui\//i, /widget/i, /button/i, /modal/i,
  /form/i, /input/i, /table/i, /list/i, /card/i,
  /accessibility/i, /a11y/i, /aria/i,
];

/** Keywords in surrounding context that indicate auth usage */
const AUTH_CONTEXT_KEYWORDS = [
  'authorization', 'authenticate', 'login', 'logout', 'signin', 'signout',
  'verify', 'validate', 'credential', 'permission', 'access_control',
  'user_role', 'check_role', 'require_role', 'has_permission', 'can_access',
  'middleware', 'guard', 'protect', 'secure', 'jwt', 'token',
];

/** Keywords that indicate NON-auth role usage (ARIA, UI, etc.) */
const NON_AUTH_CONTEXT_KEYWORDS = [
  'aria-role', 'role=', 'aria-', 'tabindex', 'focusable',
  'button', 'dialog', 'alert', 'menu', 'listbox', 'combobox',
  'presentation', 'img', 'link', 'navigation', 'banner',
  'contentinfo', 'main', 'complementary', 'region',
  'grid', 'row', 'cell', 'columnheader', 'rowheader',
];

// ============================================================================
// RBAC Semantic Detector
// ============================================================================

export class RBACSemanticDetector extends SemanticDetector {
  readonly id = 'auth/rbac-patterns';
  readonly name = 'RBAC Patterns Detector';
  readonly description = 'Learns role-based access control patterns from your codebase';
  readonly category = 'auth' as const;
  readonly subcategory = 'rbac-patterns';

  // All languages - semantic detection is language agnostic
  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'css', 'scss', 'json', 'yaml', 'markdown'
  ];

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
   * Semantic keywords for RBAC detection
   * These concepts exist in every language
   */
  protected getSemanticKeywords(): string[] {
    return [
      // High-confidence RBAC keywords (rarely false positives)
      'user_role', 'userRole', 'hasRole', 'has_role', 'checkRole', 'check_role',
      'requireRole', 'require_role', 'isAdmin', 'is_admin', 'canAccess', 'can_access',
      'permission', 'permissions', 'authorize', 'authorization', 'acl',
      
      // Medium-confidence (need context validation)
      'role', 'roles', 'admin', 'owner', 'member', 'guest', 'moderator',
      'access', 'perm',
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
    
    // Skip if it's just in a URL or path
    if (/https?:\/\/|\/api\/|\/v\d+\//.test(lineContent)) {
      return false;
    }
    
    // High-confidence keywords always match
    const highConfidenceKeywords = [
      'user_role', 'userRole', 'hasRole', 'has_role', 'checkRole', 'check_role',
      'requireRole', 'require_role', 'isAdmin', 'is_admin', 'canAccess', 'can_access',
      'permission', 'permissions', 'authorize', 'authorization', 'acl',
    ];
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }
    
    // For ambiguous keywords like "role", "admin", apply context validation
    
    // Check for ARIA/accessibility role usage (strong negative signal)
    if (/role\s*=\s*["']|aria-role|aria-/i.test(lineContent)) {
      return false;
    }
    
    // Check for NON-auth context indicators
    for (const nonAuthKeyword of NON_AUTH_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonAuthKeyword)) {
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
      if (/className=|class=/i.test(lineContent)) {return false;} // CSS class
      if (/style=/i.test(lineContent)) {return false;} // inline style
      if (/<\w+.*role/i.test(lineContent)) {return false;} // HTML element with role
    }
    
    return authContextScore > nonAuthContextScore;
  }

  /**
   * Create violation for inconsistent RBAC pattern
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
      message: `Inconsistent RBAC pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for RBAC in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
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

export function createRBACSemanticDetector(): RBACSemanticDetector {
  return new RBACSemanticDetector();
}
