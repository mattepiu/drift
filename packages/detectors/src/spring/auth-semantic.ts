/**
 * Spring Auth Patterns Semantic Detector
 * 
 * Language-agnostic detector that finds Spring Security patterns
 * by looking for semantic concepts like @PreAuthorize, @Secured, hasRole, etc.
 * 
 * NO HARDCODED RULES - learns what's normal from frequency.
 */

import { SPRING_KEYWORD_GROUPS } from './keywords.js';
import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

/** File paths that indicate auth-related code */
const AUTH_FILE_PATTERNS = [
  /auth/i, /login/i, /session/i, /security/i,
  /guard/i, /protect/i, /permission/i, /rbac/i, /acl/i,
  /user.*service/i, /account/i, /admin/i, /controller/i,
];

export class SpringAuthSemanticDetector extends SemanticDetector {
  readonly id = 'spring/auth-patterns';
  readonly name = 'Spring Auth Patterns Detector';
  readonly description = 'Learns authentication and authorization patterns from Spring codebases';
  readonly category = 'auth' as const;
  readonly subcategory = 'spring-auth';

  override readonly supportedLanguages: Language[] = ['java'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: true, // Include strings for SpEL expressions like "hasRole('ADMIN')"
    });
  }

  protected getSemanticKeywords(): string[] {
    return [...SPRING_KEYWORD_GROUPS.auth.keywords];
  }

  protected getSemanticCategory(): string {
    return 'auth';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, keyword } = match;
    
    // Skip if it's just in a URL or path
    if (/https?:\/\/|\/api\/|\/v\d+\//.test(lineContent)) {
      return false;
    }
    
    // Skip if it's in an import statement
    if (/^\s*import\s+/.test(lineContent)) {
      return false;
    }
    
    // High-confidence keywords always match
    const highConfidenceKeywords = [
      'PreAuthorize', 'PostAuthorize', 'Secured', 'RolesAllowed',
      'hasRole', 'hasAuthority', 'hasPermission', 'hasAnyRole',
      'SecurityContext', 'SecurityContextHolder', 'Authentication',
      'EnableWebSecurity', 'EnableMethodSecurity', 'SecurityFilterChain',
    ];
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }
    
    // For ambiguous keywords, check file path context
    for (const pattern of AUTH_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
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
      message: `Auth pattern differs from codebase norm: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your codebase uses '${dominantPattern.contextType}' for auth patterns in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is different from the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: false,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  override generateQuickFix(_violation: Violation): null {
    return null;
  }
}

export function createSpringAuthSemanticDetector(): SpringAuthSemanticDetector {
  return new SpringAuthSemanticDetector();
}
