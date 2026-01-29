/**
 * Permission Checks Detector - LEARNING VERSION
 *
 * Learns permission check patterns from the user's codebase:
 * - Permission checking style
 * - Authorization patterns
 * - Policy patterns
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

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type PermissionStyle = 'function' | 'decorator' | 'middleware' | 'hook';

export interface PermissionChecksConventions {
  [key: string]: unknown;
  style: PermissionStyle;
  usesRoles: boolean;
  usesPermissions: boolean;
}

interface PermissionPatternInfo {
  style: PermissionStyle;
  name: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractPermissionPatterns(content: string, file: string): PermissionPatternInfo[] {
  const results: PermissionPatternInfo[] = [];

  // Function-based checks
  const funcPattern = /(?:can|has|check)(?:Permission|Access|Role|Ability)\s*\(/gi;
  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'function',
      name: match[0].replace(/\s*\($/, ''),
      line,
      column,
      file,
    });
  }

  // Decorator-based checks
  const decoratorPattern = /@(?:Roles|Permissions|RequirePermission|Authorize|Can)\s*\(/g;
  while ((match = decoratorPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'decorator',
      name: match[0],
      line,
      column,
      file,
    });
  }

  // Hook-based checks (React)
  const hookPattern = /use(?:Permission|Can|Ability|Authorize)\s*\(/g;
  while ((match = hookPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'hook',
      name: match[0].replace(/\s*\($/, ''),
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Permission Checks Detector
// ============================================================================

export class PermissionChecksLearningDetector extends LearningDetector<PermissionChecksConventions> {
  readonly id = 'auth/permission-checks';
  readonly category = 'auth' as const;
  readonly subcategory = 'permission-checks';
  readonly name = 'Permission Checks Detector (Learning)';
  readonly description = 'Learns permission check patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof PermissionChecksConventions> {
    return ['style', 'usesRoles', 'usesPermissions'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof PermissionChecksConventions, ValueDistribution>
  ): void {
    const patterns = extractPermissionPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('style')!;
    const rolesDist = distributions.get('usesRoles')!;
    const permsDist = distributions.get('usesPermissions')!;

    const hasRoles = /role/i.test(context.content);
    const hasPerms = /permission/i.test(context.content);

    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
    }

    rolesDist.add(hasRoles, context.file);
    permsDist.add(hasPerms, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<PermissionChecksConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const permPatterns = extractPermissionPatterns(context.content, context.file);
    if (permPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.style?.value;

    if (learnedStyle) {
      for (const pattern of permPatterns) {
        if (pattern.style !== learnedStyle) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'permission check style', pattern.style, learnedStyle,
            `Using ${pattern.style} but project uses ${learnedStyle}`
          ));
        }
      }
    }

    if (permPatterns.length > 0) {
      const first = permPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/permission`,
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

export function createPermissionChecksLearningDetector(): PermissionChecksLearningDetector {
  return new PermissionChecksLearningDetector();
}
