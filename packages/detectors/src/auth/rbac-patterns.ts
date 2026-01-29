/**
 * RBAC Patterns Detector - Role-Based Access Control pattern detection
 *
 * Detects RBAC patterns including role definitions, role assignments,
 * and role-based authorization.
 *
 * @requirements 11.4 - RBAC patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

export type RbacPatternType = 'role-definition' | 'role-assignment' | 'role-check' | 'role-hierarchy';
export type RbacViolationType = 'missing-role-check' | 'inconsistent-roles';

export interface RbacPatternInfo {
  type: RbacPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  roleName?: string;
  context?: string;
}

export interface RbacViolationInfo {
  type: RbacViolationType;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  value: string;
  issue: string;
  suggestedFix?: string;
  lineContent: string;
}

export interface RbacAnalysis {
  patterns: RbacPatternInfo[];
  violations: RbacViolationInfo[];
  roles: string[];
  hasRoleHierarchy: boolean;
}

export const ROLE_DEFINITION_PATTERNS = [
  // TypeScript/JavaScript patterns
  /(?:enum|const)\s+(?:Role|Roles|UserRole)\s*[={]/gi,
  /roles?\s*:\s*\[\s*['"`](?:admin|user|moderator|editor|viewer)/gi,
  /(?:ADMIN|USER|MODERATOR|EDITOR|VIEWER)\s*[=:]/gi,
  /type\s+Role\s*=/gi,
  // Python patterns - Enum classes, role constants
  /class\s+(?:Role|Roles|UserRole)\s*\(\s*(?:str\s*,\s*)?Enum\s*\)/gi,
  /(?:ADMIN|USER|MODERATOR|EDITOR|VIEWER)\s*=\s*['"`]/gi,
  /ROLES?\s*=\s*\[/gi,
  /role_choices\s*=/gi,
] as const;

export const ROLE_ASSIGNMENT_PATTERNS = [
  // TypeScript/JavaScript patterns
  /user\.role\s*=\s*['"`]?\w+/gi,
  /setRole\s*\(/gi,
  /assignRole\s*\(/gi,
  /grantRole\s*\(/gi,
  /role\s*:\s*['"`](?:admin|user|moderator)/gi,
  // Python patterns - snake_case methods
  /user\.role\s*=\s*['"`]?\w+/gi,
  /set_role\s*\(/gi,
  /assign_role\s*\(/gi,
  /grant_role\s*\(/gi,
  /role\s*=\s*['"`](?:admin|user|moderator)/gi,
  /update_user_role\s*\(/gi,
] as const;

export const ROLE_CHECK_PATTERNS = [
  // TypeScript/JavaScript patterns
  /user\.role\s*===?\s*['"`]?\w+/gi,
  /hasRole\s*\(\s*['"`]\w+['"`]/gi,
  /isAdmin|isModerator|isEditor/gi,
  /role\s*===?\s*(?:Role\.)?\w+/gi,
  /roles?\.includes\s*\(/gi,
  // Python patterns - snake_case, equality checks
  /user\.role\s*==\s*['"`]?\w+/gi,
  /has_role\s*\(/gi,
  /is_admin|is_moderator|is_editor/gi,
  /role\s*==\s*(?:Role\.)?\w+/gi,
  /role\s+in\s+\[/gi,
  /check_role\s*\(/gi,
  /require_role\s*\(/gi,
] as const;

export const ROLE_HIERARCHY_PATTERNS = [
  /roleHierarchy/gi,
  /parentRole/gi,
  /inheritedRoles/gi,
  /roleInherits/gi,
] as const;

export const EXCLUDED_FILE_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /node_modules\//, /\.d\.ts$/, /_test\.py$/, /test_.*\.py$/, /conftest\.py$/];

export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(p => p.test(filePath));
}

function isInsideComment(content: string, index: number): boolean {
  const before = content.slice(0, index);
  const lastNewline = before.lastIndexOf('\n');
  const line = before.slice(lastNewline + 1);
  if (line.includes('//') && index - lastNewline - 1 > line.indexOf('//')) {return true;}
  return before.lastIndexOf('/*') > before.lastIndexOf('*/');
}

function getPosition(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

function detectPatterns(content: string, file: string, patterns: readonly RegExp[], type: RbacPatternType): RbacPatternInfo[] {
  const results: RbacPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({ type, file, line, column, matchedText: match[0], context: lines[line - 1] || '' });
    }
  }
  return results;
}

export function detectRoleDefinitions(content: string, file: string): RbacPatternInfo[] {
  return detectPatterns(content, file, ROLE_DEFINITION_PATTERNS, 'role-definition');
}

export function detectRoleChecks(content: string, file: string): RbacPatternInfo[] {
  return detectPatterns(content, file, ROLE_CHECK_PATTERNS, 'role-check');
}

export function detectRoleAssignments(content: string, file: string): RbacPatternInfo[] {
  return detectPatterns(content, file, ROLE_ASSIGNMENT_PATTERNS, 'role-assignment');
}

export function detectRoleHierarchy(content: string, file: string): RbacPatternInfo[] {
  return detectPatterns(content, file, ROLE_HIERARCHY_PATTERNS, 'role-hierarchy');
}

export function analyzeRbac(content: string, file: string): RbacAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], roles: [], hasRoleHierarchy: false };
  }
  
  const patterns: RbacPatternInfo[] = [
    ...detectRoleDefinitions(content, file),
    ...detectRoleAssignments(content, file),
    ...detectRoleChecks(content, file),
    ...detectRoleHierarchy(content, file),
  ];
  
  const roleMatches = content.match(/['"`](admin|user|moderator|editor|viewer|guest|owner|member)['"`]/gi) || [];
  const roles = [...new Set(roleMatches.map(r => r.replace(/['"`]/g, '').toLowerCase()))];
  const hasRoleHierarchy = patterns.some(p => p.type === 'role-hierarchy');
  
  return { patterns, violations: [], roles, hasRoleHierarchy };
}

// Aliases for backward compatibility
export type RBACPatternType = RbacPatternType;
export type RBACPatternInfo = RbacPatternInfo;
export type RBACAnalysis = RbacAnalysis;
export const analyzeRBACPatterns = analyzeRbac;

export class RbacPatternsDetector extends RegexDetector {
  readonly id = 'auth/rbac-patterns';
  readonly name = 'RBAC Patterns Detector';
  readonly description = 'Detects Role-Based Access Control patterns';
  readonly category = 'auth';
  readonly subcategory = 'rbac';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeRbac(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.patterns.length > 0 ? 0.85 : 1.0, {
      custom: {
        patterns: analysis.patterns,
        roles: analysis.roles,
        hasRoleHierarchy: analysis.hasRoleHierarchy,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

// Alias for backward compatibility
export const RBACPatternsDetector = RbacPatternsDetector;

export function createRbacPatternsDetector(): RbacPatternsDetector {
  return new RbacPatternsDetector();
}

// Alias for backward compatibility
export const createRBACPatternsDetector = createRbacPatternsDetector;
