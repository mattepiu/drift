/**
 * Error Codes Detector - LEARNING VERSION
 *
 * Learns error code patterns from the user's codebase:
 * - Error code naming conventions
 * - Error code enum/const patterns
 * - Error code structure
 *
 * Flags violations only when code deviates from the PROJECT'S established patterns.
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

/**
 * Error code definition style
 */
export type ErrorCodeStyle = 'enum' | 'const-object' | 'individual-consts' | 'string-literals';

/**
 * Error code naming convention
 */
export type ErrorCodeNaming = 'SCREAMING_SNAKE' | 'PascalCase' | 'camelCase' | 'kebab-case';

/**
 * Conventions this detector learns
 */
export interface ErrorCodeConventions {
  [key: string]: unknown;
  /** Error code definition style */
  codeStyle: ErrorCodeStyle;
  /** Error code naming convention */
  naming: ErrorCodeNaming;
  /** Error code prefix pattern */
  prefix: string | null;
  /** Whether error codes are required in error objects */
  requiresCodeInErrors: boolean;
}

/**
 * Error code pattern info extracted from code
 */
interface ErrorCodePatternInfo {
  style: ErrorCodeStyle;
  naming: ErrorCodeNaming;
  codeName: string;
  prefix: string | null;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect naming convention of a code
 */
function detectNaming(code: string): ErrorCodeNaming {
  if (/^[A-Z][A-Z0-9_]*$/.test(code)) {return 'SCREAMING_SNAKE';}
  if (/^[A-Z][a-zA-Z0-9]*$/.test(code)) {return 'PascalCase';}
  if (/^[a-z][a-zA-Z0-9]*$/.test(code)) {return 'camelCase';}
  if (/^[a-z][a-z0-9-]*$/.test(code)) {return 'kebab-case';}
  return 'SCREAMING_SNAKE';
}

/**
 * Extract prefix from error code
 */
function extractPrefix(code: string): string | null {
  const match = code.match(/^([A-Z]+_|[a-z]+-)/);
  return match?.[1] ?? null;
}

/**
 * Extract error code patterns from content
 */
function extractErrorCodePatterns(content: string, file: string): ErrorCodePatternInfo[] {
  const results: ErrorCodePatternInfo[] = [];

  // Enum definitions
  const enumPattern = /enum\s+(?:ErrorCode|ErrorCodes)\s*\{([^}]+)\}/gi;
  let match;
  while ((match = enumPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const enumBody = match[1] || '';

    // Extract enum members
    const memberPattern = /(\w+)\s*(?:=|,)/g;
    let memberMatch;
    while ((memberMatch = memberPattern.exec(enumBody)) !== null) {
      const codeName = memberMatch[1] || '';
      results.push({
        style: 'enum',
        naming: detectNaming(codeName),
        codeName,
        prefix: extractPrefix(codeName),
        line,
        column,
        file,
      });
    }
  }

  // Const object definitions
  const constObjPattern = /const\s+(?:ErrorCode|ErrorCodes|ERROR_CODES)\s*=\s*\{([^}]+)\}/gi;
  while ((match = constObjPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const objBody = match[1] || '';

    // Extract object keys
    const keyPattern = /(\w+)\s*:/g;
    let keyMatch;
    while ((keyMatch = keyPattern.exec(objBody)) !== null) {
      const codeName = keyMatch[1] || '';
      results.push({
        style: 'const-object',
        naming: detectNaming(codeName),
        codeName,
        prefix: extractPrefix(codeName),
        line,
        column,
        file,
      });
    }
  }

  // Individual const definitions
  const individualConstPattern = /const\s+([A-Z][A-Z0-9_]*(?:_ERROR|_CODE|ERROR))\s*=/gi;
  while ((match = individualConstPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    const codeName = match[1] || '';

    results.push({
      style: 'individual-consts',
      naming: detectNaming(codeName),
      codeName,
      prefix: extractPrefix(codeName),
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Error Codes Detector
// ============================================================================

export class ErrorCodesLearningDetector extends LearningDetector<ErrorCodeConventions> {
  readonly id = 'errors/error-codes';
  readonly category = 'errors' as const;
  readonly subcategory = 'error-codes';
  readonly name = 'Error Codes Detector (Learning)';
  readonly description = 'Learns error code patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof ErrorCodeConventions> {
    return ['codeStyle', 'naming', 'prefix', 'requiresCodeInErrors'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ErrorCodeConventions, ValueDistribution>
  ): void {
    const patterns = extractErrorCodePatterns(context.content, context.file);

    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('codeStyle')!;
    const namingDist = distributions.get('naming')!;
    const prefixDist = distributions.get('prefix')!;

    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
      namingDist.add(pattern.naming, context.file);
      if (pattern.prefix) {
        prefixDist.add(pattern.prefix, context.file);
      }
    }

    // Check if errors have codes
    const errorWithCodePattern = /(?:code|errorCode)\s*:/gi;
    const hasErrorCodes = errorWithCodePattern.test(context.content);
    const requiresCodeDist = distributions.get('requiresCodeInErrors')!;
    requiresCodeDist.add(hasErrorCodes, context.file);
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ErrorCodeConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const codePatterns = extractErrorCodePatterns(context.content, context.file);

    if (codePatterns.length === 0) {
      return this.createEmptyResult();
    }

    // Get learned conventions
    const learnedStyle = conventions.conventions.codeStyle?.value;
    const learnedNaming = conventions.conventions.naming?.value;
    const learnedPrefix = conventions.conventions.prefix?.value;

    // Check style consistency
    if (learnedStyle) {
      for (const pattern of codePatterns) {
        if (pattern.style !== learnedStyle) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'error code style',
            pattern.style,
            learnedStyle,
            `Using ${pattern.style} but project uses ${learnedStyle} for error codes`
          ));
        }
      }
    }

    // Check naming consistency
    if (learnedNaming) {
      for (const pattern of codePatterns) {
        if (pattern.naming !== learnedNaming) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'error code naming',
            pattern.naming,
            learnedNaming,
            `Error code '${pattern.codeName}' uses ${pattern.naming} but project uses ${learnedNaming}`
          ));
        }
      }
    }

    // Check prefix consistency
    if (learnedPrefix) {
      for (const pattern of codePatterns) {
        if (pattern.prefix && pattern.prefix !== learnedPrefix) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'error code prefix',
            pattern.prefix,
            learnedPrefix,
            `Error code '${pattern.codeName}' uses prefix '${pattern.prefix}' but project uses '${learnedPrefix}'`
          ));
        }
      }
    }

    // Create pattern matches
    if (codePatterns.length > 0) {
      const firstPattern = codePatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/error-codes`,
          location: {
            file: context.file,
            line: firstPattern.line,
            column: firstPattern.column,
          },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  // ============================================================================
  // Quick Fix
  // ============================================================================

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createErrorCodesLearningDetector(): ErrorCodesLearningDetector {
  return new ErrorCodesLearningDetector();
}
