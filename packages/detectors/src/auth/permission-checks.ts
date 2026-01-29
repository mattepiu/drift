/**
 * Permission Checks Detector - Permission pattern detection
 *
 * Detects permission checking patterns including role checks, capability checks,
 * and authorization guards.
 *
 * @requirements 11.3 - Permission check patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

export type PermissionPatternType = 'role-check' | 'capability-check' | 'permission-guard' | 'access-control';
export type PermissionViolationType = 'missing-permission-check' | 'inconsistent-permissions';

export interface PermissionPatternInfo {
  type: PermissionPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  context?: string;
}

export interface PermissionViolationInfo {
  type: PermissionViolationType;
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

export interface PermissionAnalysis {
  patterns: PermissionPatternInfo[];
  violations: PermissionViolationInfo[];
  hasPermissionChecks: boolean;
}

export const PERMISSION_CHECK_PATTERNS = [
  /(?:hasPermission|checkPermission|canAccess|isAllowed)\s*\(/gi,
  /(?:hasRole|checkRole|isAdmin|isModerator)\s*\(/gi,
  /user\.(?:role|permissions|capabilities)\s*(?:\.|\.includes|\.has)/gi,
] as const;

export const AUTHORIZATION_PATTERNS = [
  /(?:authorize|guard|protect)\s*\(\s*['"`]\w+['"`]/gi,
  /\.can\s*\(\s*['"`]\w+['"`]/gi,
  /ability\.(?:can|cannot)\s*\(/gi,
] as const;

export const GUARD_PATTERNS = [
  /permissions\.(?:check|has|includes)\s*\(/gi,
  /@(?:Authorize|RequirePermission|Guard)\s*\(/gi,
  /usePermission\s*\(/gi,
] as const;

export const POLICY_PATTERNS = [
  /policy\.(?:check|allows|denies)\s*\(/gi,
  /defineAbility/gi,
  /createPolicy/gi,
] as const;

export const EXCLUDED_FILE_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /node_modules\//, /\.d\.ts$/];

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

export function detectPermissionChecks(content: string, file: string): PermissionPatternInfo[] {
  const results: PermissionPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of PERMISSION_CHECK_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: match[0].toLowerCase().includes('role') ? 'role-check' : 'permission-guard',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectAuthorizationPatterns(content: string, file: string): PermissionPatternInfo[] {
  const results: PermissionPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of AUTHORIZATION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'access-control',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectGuardPatterns(content: string, file: string): PermissionPatternInfo[] {
  const results: PermissionPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of GUARD_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'permission-guard',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectPolicyPatterns(content: string, file: string): PermissionPatternInfo[] {
  const results: PermissionPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of POLICY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'access-control',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function analyzePermissions(content: string, file: string): PermissionAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], hasPermissionChecks: false };
  }
  
  const patterns: PermissionPatternInfo[] = [
    ...detectPermissionChecks(content, file),
    ...detectAuthorizationPatterns(content, file),
    ...detectGuardPatterns(content, file),
    ...detectPolicyPatterns(content, file),
  ];
  
  return { patterns, violations: [], hasPermissionChecks: patterns.length > 0 };
}

export class PermissionChecksDetector extends RegexDetector {
  readonly id = 'auth/permission-checks';
  readonly name = 'Permission Checks Detector';
  readonly description = 'Detects permission checking patterns';
  readonly category = 'auth';
  readonly subcategory = 'permissions';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzePermissions(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.hasPermissionChecks ? 0.85 : 1.0, {
      custom: {
        patterns: analysis.patterns,
        hasPermissionChecks: analysis.hasPermissionChecks,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createPermissionChecksDetector(): PermissionChecksDetector {
  return new PermissionChecksDetector();
}
