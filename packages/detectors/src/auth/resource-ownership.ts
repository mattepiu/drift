/**
 * Resource Ownership Detector - Ownership pattern detection
 *
 * Detects resource ownership patterns including:
 * - User ID checks on resources
 * - Owner field validation
 * - Tenant/organization scoping
 * - Resource access control patterns
 * - Ownership transfer patterns
 *
 * Flags violations:
 * - Missing ownership checks on sensitive operations
 * - Direct resource access without ownership validation
 * - Inconsistent ownership patterns
 *
 * @requirements 11.5 - Resource ownership patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type OwnershipPatternType =
  | 'user-id-check'      // userId === resource.userId
  | 'owner-field'        // resource.ownerId, resource.owner
  | 'tenant-scope'       // tenantId, organizationId scoping
  | 'created-by'         // createdBy field checks
  | 'ownership-query'    // WHERE userId = ? patterns
  | 'ownership-transfer'; // Transfer ownership patterns

export type OwnershipViolationType =
  | 'missing-ownership-check'    // No ownership validation
  | 'direct-resource-access'     // Accessing without owner check
  | 'inconsistent-ownership';    // Mixed ownership patterns

export interface OwnershipPatternInfo {
  type: OwnershipPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  ownerField?: string;
  context?: string;
}

export interface OwnershipViolationInfo {
  type: OwnershipViolationType;
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

export interface OwnershipAnalysis {
  patterns: OwnershipPatternInfo[];
  violations: OwnershipViolationInfo[];
  hasOwnershipChecks: boolean;
  dominantPattern: OwnershipPatternType | null;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const USER_ID_CHECK_PATTERNS = [
  // TypeScript/JavaScript patterns
  /userId\s*===?\s*(?:resource|item|record|data)\.\s*userId/gi,
  /(?:resource|item|record|data)\.userId\s*===?\s*userId/gi,
  /user\.id\s*===?\s*(?:resource|item)\.(?:userId|ownerId|createdBy)/gi,
  /req\.user\.id\s*===?\s*\w+\.(?:userId|ownerId)/gi,
  /session\.userId\s*===?\s*\w+\.(?:userId|ownerId)/gi,
  // Python patterns - snake_case, equality checks
  /user_id\s*==\s*(?:resource|item|record|data)\.user_id/gi,
  /(?:resource|item|record|data)\.user_id\s*==\s*user_id/gi,
  /current_user\.id\s*==\s*\w+\.(?:user_id|owner_id|created_by)/gi,
  /request\.user\.id\s*==\s*\w+\.(?:user_id|owner_id)/gi,
] as const;

export const OWNER_FIELD_PATTERNS = [
  // TypeScript/JavaScript patterns
  /\.ownerId\b/gi,
  /\.owner\s*[=:]/gi,
  /ownerId\s*[=:]/gi,
  /ownerUserId/gi,
  /resourceOwner/gi,
  // Python patterns - snake_case
  /\.owner_id\b/gi,
  /owner_id\s*=/gi,
  /owner_user_id/gi,
  /resource_owner/gi,
  /owned_by/gi,
] as const;

export const TENANT_SCOPE_PATTERNS = [
  // TypeScript/JavaScript patterns
  /tenantId\s*[=:]/gi,
  /organizationId\s*[=:]/gi,
  /orgId\s*[=:]/gi,
  /\.tenantId\b/gi,
  /\.organizationId\b/gi,
  /workspaceId\s*[=:]/gi,
  // Python patterns - snake_case
  /tenant_id\s*=/gi,
  /organization_id\s*=/gi,
  /org_id\s*=/gi,
  /\.tenant_id\b/gi,
  /\.organization_id\b/gi,
  /workspace_id\s*=/gi,
  /account_id\s*=/gi,
] as const;

export const CREATED_BY_PATTERNS = [
  /createdBy\s*[=:]/gi,
  /\.createdBy\b/gi,
  /authorId\s*[=:]/gi,
  /\.authorId\b/gi,
] as const;

export const OWNERSHIP_QUERY_PATTERNS = [
  // TypeScript/JavaScript patterns
  /WHERE\s+(?:user_?id|owner_?id|tenant_?id)\s*=/gi,
  /\.where\s*\(\s*['"`]?(?:userId|ownerId|tenantId)['"`]?\s*,/gi,
  /\.eq\s*\(\s*['"`](?:user_id|owner_id|tenant_id)['"`]/gi,
  /findBy(?:User|Owner|Tenant)Id/gi,
  // Python patterns - SQLAlchemy, Django ORM, Supabase
  /\.filter\s*\(\s*\w+\.user_id\s*==/gi,
  /\.filter\s*\(\s*\w+\.owner_id\s*==/gi,
  /\.filter_by\s*\(\s*user_id\s*=/gi,
  /\.filter_by\s*\(\s*owner_id\s*=/gi,
  /objects\.filter\s*\(\s*user_id\s*=/gi,
  /objects\.filter\s*\(\s*owner\s*=/gi,
  /\.select\s*\(\s*\)\s*\.eq\s*\(\s*['"`]user_id['"`]/gi,
] as const;

export const OWNERSHIP_TRANSFER_PATTERNS = [
  /transferOwnership/gi,
  /changeOwner/gi,
  /setOwner/gi,
  /updateOwner/gi,
] as const;

export const SENSITIVE_OPERATION_PATTERNS = [
  /\.delete\s*\(/gi,
  /\.update\s*\(/gi,
  /\.remove\s*\(/gi,
  /\.destroy\s*\(/gi,
  /DELETE\s+FROM/gi,
  /UPDATE\s+\w+\s+SET/gi,
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

export function detectUserIdChecks(content: string, file: string): OwnershipPatternInfo[] {
  const results: OwnershipPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of USER_ID_CHECK_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'user-id-check',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectOwnerFields(content: string, file: string): OwnershipPatternInfo[] {
  const results: OwnershipPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of OWNER_FIELD_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'owner-field',
        file, line, column,
        matchedText: match[0],
        ownerField: match[0].replace(/[.:=\s]/g, ''),
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectTenantScoping(content: string, file: string): OwnershipPatternInfo[] {
  const results: OwnershipPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of TENANT_SCOPE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'tenant-scope',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectCreatedByPatterns(content: string, file: string): OwnershipPatternInfo[] {
  const results: OwnershipPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of CREATED_BY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'created-by',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectOwnershipQueries(content: string, file: string): OwnershipPatternInfo[] {
  const results: OwnershipPatternInfo[] = [];
  const lines = content.split('\n');
  
  for (const pattern of OWNERSHIP_QUERY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {continue;}
      const { line, column } = getPosition(content, match.index);
      results.push({
        type: 'ownership-query',
        file, line, column,
        matchedText: match[0],
        context: lines[line - 1] || '',
      });
    }
  }
  return results;
}

export function detectMissingOwnershipViolations(
  patterns: OwnershipPatternInfo[],
  content: string,
  file: string
): OwnershipViolationInfo[] {
  const violations: OwnershipViolationInfo[] = [];
  const lines = content.split('\n');
  const hasOwnershipChecks = patterns.length > 0;
  
  // Only check files that look like they handle resources
  if (!file.includes('service') && !file.includes('repository') && !file.includes('controller')) {
    return violations;
  }
  
  if (!hasOwnershipChecks) {
    for (const pattern of SENSITIVE_OPERATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        if (isInsideComment(content, match.index)) {continue;}
        const { line, column } = getPosition(content, match.index);
        violations.push({
          type: 'missing-ownership-check',
          file, line, column,
          endLine: line,
          endColumn: column + match[0].length,
          value: match[0],
          issue: 'Sensitive operation without visible ownership check',
          suggestedFix: 'Add ownership validation before modifying resources',
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

export function analyzeOwnership(content: string, file: string): OwnershipAnalysis {
  if (shouldExcludeFile(file)) {
    return { patterns: [], violations: [], hasOwnershipChecks: false, dominantPattern: null, confidence: 1.0 };
  }
  
  const userIdChecks = detectUserIdChecks(content, file);
  const ownerFields = detectOwnerFields(content, file);
  const tenantScoping = detectTenantScoping(content, file);
  const createdBy = detectCreatedByPatterns(content, file);
  const ownershipQueries = detectOwnershipQueries(content, file);
  
  const allPatterns = [...userIdChecks, ...ownerFields, ...tenantScoping, ...createdBy, ...ownershipQueries];
  const violations = detectMissingOwnershipViolations(allPatterns, content, file);
  
  // Determine dominant pattern
  const typeCounts: Record<string, number> = {};
  for (const p of allPatterns) {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
  }
  
  let dominantPattern: OwnershipPatternType | null = null;
  let maxCount = 0;
  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantPattern = type as OwnershipPatternType;
    }
  }
  
  const confidence = allPatterns.length > 0 ? Math.max(0.5, 1 - violations.length * 0.1) : 1.0;
  
  return {
    patterns: allPatterns,
    violations,
    hasOwnershipChecks: allPatterns.length > 0,
    dominantPattern,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class ResourceOwnershipDetector extends RegexDetector {
  readonly id = 'auth/resource-ownership';
  readonly name = 'Resource Ownership Detector';
  readonly description = 'Detects resource ownership patterns and missing ownership checks';
  readonly category = 'auth';
  readonly subcategory = 'ownership';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];
  
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    if (shouldExcludeFile(file)) {return this.createEmptyResult();}
    
    const analysis = analyzeOwnership(content, file);
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(analysis.violations);
    
    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        hasOwnershipChecks: analysis.hasOwnershipChecks,
        dominantPattern: analysis.dominantPattern,
      },
    });
  }
  
  generateQuickFix(): null {
    return null;
  }
}

export function createResourceOwnershipDetector(): ResourceOwnershipDetector {
  return new ResourceOwnershipDetector();
}
