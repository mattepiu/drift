/**
 * RBAC Patterns Detector - LEARNING VERSION
 *
 * Learns role-based access control patterns from the user's codebase:
 * - Role definition style
 * - Permission check approach
 * - Role hierarchy patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type RoleDefinitionStyle = 'enum' | 'const' | 'database' | 'config';
export type PermissionCheckStyle = 'decorator' | 'middleware' | 'inline' | 'guard';

export interface RBACConventions {
  [key: string]: unknown;
  roleDefinitionStyle: RoleDefinitionStyle;
  permissionCheckStyle: PermissionCheckStyle;
  usesHierarchy: boolean;
  roleNamingCase: 'upper' | 'lower' | 'pascal';
}

interface RBACInfo {
  style: RoleDefinitionStyle;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const ROLE_PATTERNS = {
  enum: /enum\s+(?:Role|UserRole|Roles)\s*\{/gi,
  const: /(?:const|let)\s+(?:ROLES|Role|roles)\s*=\s*(?:\{|\[)/gi,
  database: /role.*findMany|roles.*table|RoleModel/gi,
  config: /roles\.(?:json|yaml|yml)|config\.roles/gi,
};

const CHECK_PATTERNS = {
  decorator: /@(?:Roles|RequireRole|Authorize)\s*\(/gi,
  middleware: /requireRole\s*\(|checkRole\s*\(|roleMiddleware/gi,
  inline: /user\.role\s*===|hasRole\s*\(/gi,
  guard: /RoleGuard|AuthGuard|CanActivate/gi,
};

function extractRBACPatterns(content: string, file: string): RBACInfo[] {
  const patterns: RBACInfo[] = [];
  
  for (const [style, regex] of Object.entries(ROLE_PATTERNS)) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      patterns.push({ style: style as RoleDefinitionStyle, line: lineNumber, column, file });
    }
  }
  
  return patterns;
}

function detectCheckStyle(content: string): PermissionCheckStyle | null {
  for (const [style, regex] of Object.entries(CHECK_PATTERNS)) {
    if (regex.test(content)) {return style as PermissionCheckStyle;}
  }
  return null;
}

// ============================================================================
// Learning RBAC Patterns Detector
// ============================================================================

export class RBACPatternsLearningDetector extends LearningDetector<RBACConventions> {
  readonly id = 'auth/rbac-patterns';
  readonly category = 'auth' as const;
  readonly subcategory = 'rbac-patterns';
  readonly name = 'RBAC Patterns Detector (Learning)';
  readonly description = 'Learns RBAC patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof RBACConventions> {
    return ['roleDefinitionStyle', 'permissionCheckStyle', 'usesHierarchy', 'roleNamingCase'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof RBACConventions, ValueDistribution>
  ): void {
    const patterns = extractRBACPatterns(context.content, context.file);
    const checkStyle = detectCheckStyle(context.content);
    
    const styleDist = distributions.get('roleDefinitionStyle')!;
    const checkDist = distributions.get('permissionCheckStyle')!;
    const hierarchyDist = distributions.get('usesHierarchy')!;
    
    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
    }
    
    if (checkStyle) {checkDist.add(checkStyle, context.file);}
    
    const usesHierarchy = /roleHierarchy|parentRole|inherits|extends.*Role/i.test(context.content);
    if (patterns.length > 0) {
      hierarchyDist.add(usesHierarchy, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<RBACConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const rbacPatterns = extractRBACPatterns(context.content, context.file);
    const learnedStyle = conventions.conventions.roleDefinitionStyle?.value;
    const learnedCheck = conventions.conventions.permissionCheckStyle?.value;
    const currentCheck = detectCheckStyle(context.content);
    
    for (const pattern of rbacPatterns) {
      if (learnedStyle && pattern.style !== learnedStyle) {
        violations.push(this.createConventionViolation(
          pattern.file, pattern.line, pattern.column,
          'role definition style', pattern.style, learnedStyle,
          `Using '${pattern.style}' but your project uses '${learnedStyle}'`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${pattern.style}`,
        location: { file: context.file, line: pattern.line, column: pattern.column },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    if (learnedCheck && currentCheck && currentCheck !== learnedCheck) {
      const firstPattern = rbacPatterns[0];
      if (firstPattern) {
        violations.push(this.createConventionViolation(
          firstPattern.file, firstPattern.line, firstPattern.column,
          'permission check style', currentCheck, learnedCheck,
          `Using '${currentCheck}' but your project uses '${learnedCheck}'`
        ));
      }
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createRBACPatternsLearningDetector(): RBACPatternsLearningDetector {
  return new RBACPatternsLearningDetector();
}
