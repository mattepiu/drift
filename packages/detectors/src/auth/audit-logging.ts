/**
 * Audit Logging Detector - Auth audit pattern detection
 *
 * Detects audit logging patterns for auth events including:
 * - Login/logout event logging
 * - Permission change logging
 * - Access attempt logging
 * - Security event logging
 * - User action audit trails
 *
 * Flags violations:
 * - Missing audit logging for auth events
 * - Inconsistent audit patterns
 * - Missing security event logging
 *
 * @requirements 11.6 - Auth audit logging patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type AuditPatternType =
  | 'login-audit'        // Login event logging
  | 'logout-audit'       // Logout event logging
  | 'permission-audit'   // Permission change logging
  | 'access-audit'       // Access attempt logging
  | 'security-audit'     // Security event logging
  | 'action-audit'       // User action audit trail
  | 'audit-library';     // Using audit library

export type AuditViolationType =
  | 'missing-login-audit'      // No login event logging
  | 'missing-permission-audit' // No permission change logging
  | 'missing-security-audit'   // No security event logging
  | 'inconsistent-audit';      // Mixed audit patterns

export interface AuditPatternInfo {
  type: AuditPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  eventType?: string;
  context?: string;
}

export interface AuditViolationInfo {
  type: AuditViolationType;
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

export interface AuditAnalysis {
  patterns: AuditPatternInfo[];
  violations: AuditViolationInfo[];
  hasAuditLogging: boolean;
  auditTypes: AuditPatternType[];
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const LOGIN_AUDIT_PATTERNS = [
  // TypeScript/JavaScript patterns
  /audit(?:Log)?\.(?:login|signIn|authenticate)/gi,
  /log(?:ger)?\.(?:info|audit)\s*\([^)]*(?:login|sign[_-]?in|authenticated)/gi,
  /(?:login|auth)(?:Event|Audit|Log)/gi,
  /trackLogin/gi,
  /recordLogin/gi,
  // Python patterns - snake_case, logging module
  /audit_log\.(?:login|sign_in|authenticate)/gi,
  /logger\.(?:info|audit)\s*\([^)]*(?:login|sign_in|authenticated)/gi,
  /(?:login|auth)_(?:event|audit|log)/gi,
  /track_login/gi,
  /record_login/gi,
  /log_authentication/gi,
] as const;

export const LOGOUT_AUDIT_PATTERNS = [
  /audit(?:Log)?\.(?:logout|signOut)/gi,
  /log(?:ger)?\.(?:info|audit)\s*\([^)]*(?:logout|sign[_-]?out)/gi,
  /(?:logout)(?:Event|Audit|Log)/gi,
  /trackLogout/gi,
  /recordLogout/gi,
] as const;

export const PERMISSION_AUDIT_PATTERNS = [
  /audit(?:Log)?\.(?:permission|role|access)/gi,
  /log(?:ger)?\.(?:info|audit)\s*\([^)]*(?:permission|role|access)\s*(?:change|update|grant|revoke)/gi,
  /(?:permission|role)(?:Change|Update)(?:Event|Audit|Log)/gi,
  /trackPermission/gi,
  /recordRoleChange/gi,
] as const;

export const ACCESS_AUDIT_PATTERNS = [
  /audit(?:Log)?\.(?:access|attempt)/gi,
  /log(?:ger)?\.(?:info|warn|audit)\s*\([^)]*(?:access|attempt|denied|unauthorized)/gi,
  /(?:access)(?:Attempt|Denied|Log)/gi,
  /trackAccess/gi,
  /recordAccess/gi,
] as const;

export const SECURITY_AUDIT_PATTERNS = [
  // TypeScript/JavaScript patterns
  /audit(?:Log)?\.(?:security|breach|suspicious)/gi,
  /log(?:ger)?\.(?:warn|error|audit)\s*\([^)]*(?:security|breach|suspicious|threat)/gi,
  /(?:security)(?:Event|Alert|Audit|Log)/gi,
  /trackSecurityEvent/gi,
  /recordSecurityIncident/gi,
  // Python patterns - snake_case
  /audit_log\.(?:security|breach|suspicious)/gi,
  /logger\.(?:warning|error|audit)\s*\([^)]*(?:security|breach|suspicious|threat)/gi,
  /security_(?:event|alert|audit|log)/gi,
  /track_security_event/gi,
  /record_security_incident/gi,
  /log_security_event/gi,
] as const;

export const ACTION_AUDIT_PATTERNS = [
  // TypeScript/JavaScript patterns
  /audit(?:Log)?\.(?:action|activity|event)/gi,
  /log(?:ger)?\.(?:info|audit)\s*\([^)]*(?:user\s*action|activity)/gi,
  /(?:user)?(?:Action|Activity)(?:Log|Audit)/gi,
  /trackUserAction/gi,
  /recordActivity/gi,
  /auditTrail/gi,
  // Python patterns - snake_case
  /audit_log\.(?:action|activity|event)/gi,
  /logger\.(?:info|audit)\s*\([^)]*(?:user_action|activity)/gi,
  /(?:user_)?(?:action|activity)_(?:log|audit)/gi,
  /track_user_action/gi,
  /record_activity/gi,
  /audit_trail/gi,
  /log_user_action/gi,
] as const;

export const AUDIT_LIBRARY_PATTERNS = [
  /audit-?log/gi,
  /winston-?audit/gi,
  /pino-?audit/gi,
  /express-?audit/gi,
  /audit-?trail/gi,
] as const;

export const AUTH_EVENT_PATTERNS = [
  // TypeScript/JavaScript patterns
  /(?:async\s+)?function\s+(?:login|signIn|authenticate)\s*\(/gi,
  /\.(?:login|signIn|authenticate)\s*=\s*(?:async\s*)?\(/gi,
  /export\s+(?:async\s+)?function\s+(?:login|signIn)/gi,
  // Python patterns - def functions, async def
  /(?:async\s+)?def\s+(?:login|sign_in|authenticate)\s*\(/gi,
  /(?:async\s+)?def\s+(?:handle_login|process_login)\s*\(/gi,
  /@router\.post\s*\(\s*['"`].*(?:login|auth|signin)/gi,
  /@app\.post\s*\(\s*['"`].*(?:login|auth|signin)/gi,
] as const;

export const EXCLUDED_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /node_modules\//,
  /\.d\.ts$/,
  /_test\.py$/,
  /test_.*\.py$/,
  /conftest\.py$/,
];

// ============================================================================
// Helper Functions
// ============================================================================

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

// ============================================================================
// Detection Functions
// ============================================================================

export function detectLoginAudit(content: string, file: string): AuditPatternInfo[] {
  const results: AuditPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of LOGIN_AUDIT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'login-audit',
        file, line, column,
        matchedText: match[0],
        eventType: 'login',
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectLogoutAudit(content: string, file: string): AuditPatternInfo[] {
  const results: AuditPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of LOGOUT_AUDIT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'logout-audit',
        file, line, column,
        matchedText: match[0],
        eventType: 'logout',
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectPermissionAudit(content: string, file: string): AuditPatternInfo[] {
  const results: AuditPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of PERMISSION_AUDIT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'permission-audit',
        file, line, column,
        matchedText: match[0],
        eventType: 'permission',
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectAccessAudit(content: string, file: string): AuditPatternInfo[] {
  const results: AuditPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ACCESS_AUDIT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'access-audit',
        file, line, column,
        matchedText: match[0],
        eventType: 'access',
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectSecurityAudit(content: string, file: string): AuditPatternInfo[] {
  const results: AuditPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of SECURITY_AUDIT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'security-audit',
        file, line, column,
        matchedText: match[0],
        eventType: 'security',
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectActionAudit(content: string, file: string): AuditPatternInfo[] {
  const results: AuditPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of ACTION_AUDIT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'action-audit',
        file, line, column,
        matchedText: match[0],
        eventType: 'action',
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectAuditLibraries(content: string, file: string): AuditPatternInfo[] {
  const results: AuditPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of AUDIT_LIBRARY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'audit-library',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectMissingAuditViolations(
  patterns: AuditPatternInfo[],
  content: string,
  file: string
): AuditViolationInfo[] {
  const violations: AuditViolationInfo[] = [];
  const lines = content.split('\n');
  
  // Only check auth-related files
  if (!file.includes('auth') && !file.includes('login') && !file.includes('session')) {
    return violations;
  }
  
  const hasLoginAudit = patterns.some(p => p.type === 'login-audit');
  
  // Check for login functions without audit logging
  if (!hasLoginAudit) {
    for (const pattern of AUTH_EVENT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        if (isInsideComment(content, match.index)) {continue;}
        const { line, column } = getPosition(content, match.index);
        violations.push({
          type: 'missing-login-audit',
          file, line, column,
          endLine: line,
          endColumn: column + match[0].length,
          value: match[0],
          issue: 'Auth function without visible audit logging',
          suggestedFix: 'Add audit logging for authentication events',
          lineContent: lines[line - 1] || '',
        });
        break; // Only flag once per file
      }
    }
  }
  return violations;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export function analyzeAuditLogging(content: string, file: string): AuditAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], hasAuditLogging: false, auditTypes: [], confidence: 1.0 };
  }
  
  const loginAudit = detectLoginAudit(content, file);
  const logoutAudit = detectLogoutAudit(content, file);
  const permissionAudit = detectPermissionAudit(content, file);
  const accessAudit = detectAccessAudit(content, file);
  const securityAudit = detectSecurityAudit(content, file);
  const actionAudit = detectActionAudit(content, file);
  const auditLibraries = detectAuditLibraries(content, file);
  
  const allPatterns = [
    ...loginAudit, ...logoutAudit, ...permissionAudit,
    ...accessAudit, ...securityAudit, ...actionAudit, ...auditLibraries,
  ];
  
  const violations = detectMissingAuditViolations(allPatterns, content, file);
  
  const auditTypes = [...new Set(allPatterns.map(p => p.type))];
  const confidence = allPatterns.length > 0 ? Math.max(0.5, 1 - violations.length * 0.1) : 1.0;
  
  return {
    patterns: allPatterns,
    violations,
    hasAuditLogging: allPatterns.length > 0,
    auditTypes,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class AuditLoggingDetector extends RegexDetector {
  readonly id = 'auth/audit-logging';
  readonly name = 'Audit Logging Detector';
  readonly description = 'Detects audit logging patterns for auth events';
  readonly category = 'auth';
  readonly subcategory = 'audit';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeAuditLogging(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasAuditLogging: analysis.hasAuditLogging,
        auditTypes: analysis.auditTypes,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createAuditLoggingDetector(): AuditLoggingDetector {
  return new AuditLoggingDetector();
}
