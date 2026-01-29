/**
 * Audit Logging Detector - LEARNING VERSION
 *
 * Learns audit logging patterns from the user's codebase:
 * - Audit event types
 * - Logging approach
 * - Field conventions
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

export type AuditMethod = 'decorator' | 'middleware' | 'manual' | 'library';
export type AuditStorage = 'database' | 'file' | 'external' | 'mixed';

export interface AuditLoggingConventions {
  [key: string]: unknown;
  auditMethod: AuditMethod;
  auditStorage: AuditStorage;
  includesUserId: boolean;
  includesTimestamp: boolean;
  includesIpAddress: boolean;
}

interface AuditInfo {
  method: AuditMethod;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const AUDIT_PATTERNS = {
  decorator: /@Audit|@AuditLog|@Logged/gi,
  middleware: /auditMiddleware|logAction|trackActivity/gi,
  manual: /auditLog\.|createAuditEntry|logAudit/gi,
  library: /import.*audit|winston-audit|pino-audit/gi,
};

function extractAuditPatterns(content: string, file: string): AuditInfo[] {
  const patterns: AuditInfo[] = [];
  
  for (const [method, regex] of Object.entries(AUDIT_PATTERNS)) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      patterns.push({ method: method as AuditMethod, line: lineNumber, column, file });
    }
  }
  
  return patterns;
}

// ============================================================================
// Learning Audit Logging Detector
// ============================================================================

export class AuditLoggingLearningDetector extends LearningDetector<AuditLoggingConventions> {
  readonly id = 'auth/audit-logging';
  readonly category = 'auth' as const;
  readonly subcategory = 'audit-logging';
  readonly name = 'Audit Logging Detector (Learning)';
  readonly description = 'Learns audit logging patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof AuditLoggingConventions> {
    return ['auditMethod', 'auditStorage', 'includesUserId', 'includesTimestamp', 'includesIpAddress'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof AuditLoggingConventions, ValueDistribution>
  ): void {
    const patterns = extractAuditPatterns(context.content, context.file);
    
    const methodDist = distributions.get('auditMethod')!;
    const userIdDist = distributions.get('includesUserId')!;
    const timestampDist = distributions.get('includesTimestamp')!;
    const ipDist = distributions.get('includesIpAddress')!;
    
    for (const pattern of patterns) {
      methodDist.add(pattern.method, context.file);
    }
    
    const hasUserId = /userId|user\.id|actorId/i.test(context.content);
    const hasTimestamp = /timestamp|createdAt|occurredAt/i.test(context.content);
    const hasIp = /ipAddress|ip:|clientIp/i.test(context.content);
    
    if (patterns.length > 0) {
      userIdDist.add(hasUserId, context.file);
      timestampDist.add(hasTimestamp, context.file);
      ipDist.add(hasIp, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<AuditLoggingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const auditPatterns = extractAuditPatterns(context.content, context.file);
    const learnedMethod = conventions.conventions.auditMethod?.value;
    
    for (const pattern of auditPatterns) {
      if (learnedMethod && pattern.method !== learnedMethod) {
        violations.push(this.createConventionViolation(
          pattern.file, pattern.line, pattern.column,
          'audit method', pattern.method, learnedMethod,
          `Using '${pattern.method}' but your project uses '${learnedMethod}'`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${pattern.method}`,
        location: { file: context.file, line: pattern.line, column: pattern.column },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createAuditLoggingLearningDetector(): AuditLoggingLearningDetector {
  return new AuditLoggingLearningDetector();
}
