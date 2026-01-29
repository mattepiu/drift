/**
 * Spring Auth Patterns Detector - LEARNING VERSION
 *
 * Learns authentication/authorization patterns from the user's codebase:
 * - Security annotation preferences (@PreAuthorize vs @Secured)
 * - Role/authority naming conventions
 * - Method security patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import { SPRING_KEYWORD_GROUPS } from './keywords.js';
import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type SecurityAnnotationType = 'PreAuthorize' | 'Secured' | 'RolesAllowed';
export type RoleNamingStyle = 'ROLE_PREFIX' | 'NO_PREFIX' | 'AUTHORITY';

export interface SpringAuthConventions {
  [key: string]: unknown;
  /** Preferred security annotation type */
  securityAnnotation: SecurityAnnotationType;
  /** Role naming convention (ROLE_ADMIN vs ADMIN vs authority) */
  roleNamingStyle: RoleNamingStyle;
  /** Whether hasRole() or hasAuthority() is preferred */
  usesHasRole: boolean;
}

interface AuthPatternInfo {
  annotationType: SecurityAnnotationType | null;
  roleNaming: RoleNamingStyle | null;
  usesHasRole: boolean;
  usesHasAuthority: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractAuthPatterns(content: string, file: string): AuthPatternInfo[] {
  const results: AuthPatternInfo[] = [];
  
  const keywords = SPRING_KEYWORD_GROUPS.auth.keywords;
  const securityAnnotations: SecurityAnnotationType[] = ['PreAuthorize', 'Secured', 'RolesAllowed'];
  
  for (const keyword of keywords) {
    const pattern = new RegExp(`@?${keyword}\\b`, 'g');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip imports
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.slice(lineStart, content.indexOf('\n', match.index));
      if (lineContent.trim().startsWith('import ')) {continue;}
      
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      // Determine annotation type
      let annotationType: SecurityAnnotationType | null = null;
      for (const ann of securityAnnotations) {
        if (keyword === ann) {
          annotationType = ann;
          break;
        }
      }
      
      // Check for role naming style in the surrounding context
      const contextStart = Math.max(0, match.index - 50);
      const contextEnd = Math.min(content.length, match.index + 200);
      const context = content.slice(contextStart, contextEnd);
      
      let roleNaming: RoleNamingStyle | null = null;
      if (/ROLE_\w+/.test(context)) {
        roleNaming = 'ROLE_PREFIX';
      } else if (/hasAuthority\s*\(/.test(context)) {
        roleNaming = 'AUTHORITY';
      } else if (/hasRole\s*\(/.test(context) || /@Secured\s*\(\s*["']/.test(context)) {
        roleNaming = 'NO_PREFIX';
      }
      
      // Check for hasRole vs hasAuthority
      const usesHasRole = keyword === 'hasRole' || /hasRole\s*\(/.test(context);
      const usesHasAuthority = keyword === 'hasAuthority' || /hasAuthority\s*\(/.test(context);
      
      // Only add if we found something meaningful
      if (annotationType || usesHasRole || usesHasAuthority) {
        results.push({
          annotationType,
          roleNaming,
          usesHasRole,
          usesHasAuthority,
          line,
          column,
          file,
        });
      }
    }
  }
  
  return results;
}

// ============================================================================
// Learning Detector
// ============================================================================

export class SpringAuthLearningDetector extends LearningDetector<SpringAuthConventions> {
  readonly id = 'spring/auth-patterns-learning';
  readonly category = 'auth' as const;
  readonly subcategory = 'spring-auth';
  readonly name = 'Spring Auth Patterns Detector (Learning)';
  readonly description = 'Learns authentication/authorization patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringAuthConventions> {
    return ['securityAnnotation', 'roleNamingStyle', 'usesHasRole'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringAuthConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractAuthPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const annotationDist = distributions.get('securityAnnotation')!;
    const roleNamingDist = distributions.get('roleNamingStyle')!;
    const hasRoleDist = distributions.get('usesHasRole')!;

    for (const pattern of patterns) {
      // Track security annotation preference
      if (pattern.annotationType) {
        annotationDist.add(pattern.annotationType, context.file);
      }
      
      // Track role naming style
      if (pattern.roleNaming) {
        roleNamingDist.add(pattern.roleNaming, context.file);
      }
      
      // Track hasRole vs hasAuthority preference
      if (pattern.usesHasRole) {
        hasRoleDist.add(true, context.file);
      } else if (pattern.usesHasAuthority) {
        hasRoleDist.add(false, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringAuthConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractAuthPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedAnnotation = conventions.conventions.securityAnnotation?.value;
    const learnedRoleNaming = conventions.conventions.roleNamingStyle?.value;
    const learnedUsesHasRole = conventions.conventions.usesHasRole?.value;

    // Check for security annotation consistency
    if (learnedAnnotation) {
      for (const pattern of foundPatterns) {
        if (pattern.annotationType && pattern.annotationType !== learnedAnnotation) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'security annotation', `@${pattern.annotationType}`, `@${learnedAnnotation}`,
            `Using @${pattern.annotationType} but project prefers @${learnedAnnotation}`
          ));
        }
      }
    }

    // Check for role naming consistency
    if (learnedRoleNaming) {
      for (const pattern of foundPatterns) {
        if (pattern.roleNaming && pattern.roleNaming !== learnedRoleNaming) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'role naming', pattern.roleNaming, learnedRoleNaming,
            `Using ${pattern.roleNaming} style but project prefers ${learnedRoleNaming}`
          ));
        }
      }
    }

    // Check for hasRole vs hasAuthority consistency
    if (learnedUsesHasRole !== undefined) {
      for (const pattern of foundPatterns) {
        if (pattern.usesHasAuthority && learnedUsesHasRole === true) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'role check method', 'hasAuthority()', 'hasRole()',
            `Using hasAuthority() but project prefers hasRole()`
          ));
        } else if (pattern.usesHasRole && learnedUsesHasRole === false) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'role check method', 'hasRole()', 'hasAuthority()',
            `Using hasRole() but project prefers hasAuthority()`
          ));
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/auth`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createSpringAuthLearningDetector(): SpringAuthLearningDetector {
  return new SpringAuthLearningDetector();
}
