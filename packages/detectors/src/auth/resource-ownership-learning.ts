/**
 * Resource Ownership Detector - LEARNING VERSION
 *
 * Learns resource ownership patterns from the user's codebase:
 * - Ownership field naming
 * - Ownership check approach
 * - Multi-tenancy patterns
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

export type OwnershipField = 'userId' | 'ownerId' | 'createdBy' | 'authorId' | 'custom';
export type OwnershipCheckStyle = 'query-filter' | 'middleware' | 'inline' | 'policy';

export interface ResourceOwnershipConventions {
  [key: string]: unknown;
  ownershipField: OwnershipField;
  checkStyle: OwnershipCheckStyle;
  usesTenantId: boolean;
  tenantField: string | null;
}

interface OwnershipInfo {
  field: OwnershipField;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const OWNERSHIP_PATTERNS: Array<{ pattern: RegExp; field: OwnershipField }> = [
  { pattern: /userId\s*[:=]/gi, field: 'userId' },
  { pattern: /ownerId\s*[:=]/gi, field: 'ownerId' },
  { pattern: /createdBy\s*[:=]/gi, field: 'createdBy' },
  { pattern: /authorId\s*[:=]/gi, field: 'authorId' },
];

const CHECK_PATTERNS = {
  queryFilter: /where.*userId|findMany.*userId|filter.*owner/gi,
  middleware: /ownershipMiddleware|checkOwnership|verifyOwner/gi,
  inline: /\.userId\s*===|\.ownerId\s*===|isOwner\s*\(/gi,
  policy: /OwnershipPolicy|canAccess|authorize/gi,
};

function extractOwnershipPatterns(content: string, file: string): OwnershipInfo[] {
  const patterns: OwnershipInfo[] = [];
  
  for (const { pattern, field } of OWNERSHIP_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      patterns.push({ field, line: lineNumber, column, file });
    }
  }
  
  return patterns;
}

function detectCheckStyle(content: string): OwnershipCheckStyle | null {
  for (const [style, regex] of Object.entries(CHECK_PATTERNS)) {
    if (regex.test(content)) {
      return style.replace(/([A-Z])/g, '-$1').toLowerCase() as OwnershipCheckStyle;
    }
  }
  return null;
}

// ============================================================================
// Learning Resource Ownership Detector
// ============================================================================

export class ResourceOwnershipLearningDetector extends LearningDetector<ResourceOwnershipConventions> {
  readonly id = 'auth/resource-ownership';
  readonly category = 'auth' as const;
  readonly subcategory = 'resource-ownership';
  readonly name = 'Resource Ownership Detector (Learning)';
  readonly description = 'Learns resource ownership patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ResourceOwnershipConventions> {
    return ['ownershipField', 'checkStyle', 'usesTenantId', 'tenantField'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ResourceOwnershipConventions, ValueDistribution>
  ): void {
    const patterns = extractOwnershipPatterns(context.content, context.file);
    const checkStyle = detectCheckStyle(context.content);
    
    const fieldDist = distributions.get('ownershipField')!;
    const checkDist = distributions.get('checkStyle')!;
    const tenantDist = distributions.get('usesTenantId')!;
    
    for (const pattern of patterns) {
      fieldDist.add(pattern.field, context.file);
    }
    
    if (checkStyle) {checkDist.add(checkStyle, context.file);}
    
    const usesTenant = /tenantId|organizationId|orgId/i.test(context.content);
    if (patterns.length > 0) {
      tenantDist.add(usesTenant, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ResourceOwnershipConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const ownershipPatterns = extractOwnershipPatterns(context.content, context.file);
    const learnedField = conventions.conventions.ownershipField?.value;
    
    for (const pattern of ownershipPatterns) {
      if (learnedField && pattern.field !== learnedField) {
        violations.push(this.createConventionViolation(
          pattern.file, pattern.line, pattern.column,
          'ownership field', pattern.field, learnedField,
          `Using '${pattern.field}' but your project uses '${learnedField}'`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${pattern.field}`,
        location: { file: context.file, line: pattern.line, column: pattern.column },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createResourceOwnershipLearningDetector(): ResourceOwnershipLearningDetector {
  return new ResourceOwnershipLearningDetector();
}
