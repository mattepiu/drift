/**
 * Input Validation Semantic Detector for ASP.NET Core
 *
 * Learns input validation patterns from the codebase:
 * - DataAnnotations ([Required], [StringLength], etc.)
 * - FluentValidation validators
 * - Custom validation attributes
 * - Model state checking
 *
 * Uses semantic learning to understand how validation is implemented
 * and detect inconsistencies.
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

// ============================================================================
// Context Validation Patterns
// ============================================================================

/** File paths that typically contain validation code */
const VALIDATION_FILE_PATTERNS = [
  /model/i, /dto/i, /request/i, /command/i, /query/i,
  /validator/i, /validation/i, /controller/i, /handler/i,
  /viewmodel/i, /input/i,
];

/** Keywords in surrounding context that indicate validation usage */
const VALIDATION_CONTEXT_KEYWORDS = [
  'required', 'stringlength', 'maxlength', 'minlength', 'range',
  'regularexpression', 'emailaddress', 'phone', 'url', 'creditcard',
  'compare', 'datatype', 'validationattribute', 'modelstate',
  'abstractvalidator', 'rulefor', 'notempty', 'notnull', 'must',
  'ivalidator', 'fluentvalidation', 'validate',
];

/** Data annotation attributes */
const DATA_ANNOTATIONS = [
  'Required', 'StringLength', 'MaxLength', 'MinLength', 'Range',
  'RegularExpression', 'EmailAddress', 'Phone', 'Url', 'CreditCard',
  'Compare', 'DataType', 'EnumDataType', 'FileExtensions',
  'CustomValidation', 'Display', 'DisplayFormat',
];

// ============================================================================
// Input Validation Semantic Detector
// ============================================================================

export class InputValidationSemanticDetector extends SemanticDetector {
  readonly id = 'security/aspnet-input-validation';
  readonly name = 'ASP.NET Input Validation Detector';
  readonly description = 'Learns input validation patterns in ASP.NET Core';
  readonly category = 'security' as const;
  readonly subcategory = 'validation';

  // C# specific
  override readonly supportedLanguages: Language[] = ['csharp'];

  constructor() {
    super({
      minOccurrences: 3,
      dominanceThreshold: 0.3,
      minFiles: 2,
      includeComments: false,
      includeStrings: false,
    });
  }

  /**
   * Semantic keywords for input validation detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // Data Annotations
      ...DATA_ANNOTATIONS,
      // FluentValidation
      'AbstractValidator', 'RuleFor', 'NotEmpty', 'NotNull', 'Must',
      'When', 'Unless', 'WithMessage', 'IValidator',
      // Model state
      'ModelState', 'IsValid', 'ValidationResult',
      // Manual validation
      'IsNullOrEmpty', 'IsNullOrWhiteSpace',
      // Custom validation
      'ValidationAttribute', 'IsValid',
    ];
  }

  protected getSemanticCategory(): string {
    return 'security';
  }

  /**
   * Context-aware filtering for validation patterns
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { lineContent, keyword, surroundingContext, file } = match;
    const lineLower = lineContent.toLowerCase();
    const contextLower = surroundingContext.toLowerCase();

    // Skip if it's in a string literal
    if (/["'].*\[.*\].*["']/.test(lineContent)) {
      return false;
    }

    // Skip if it's a comment
    if (/^\s*\/\//.test(lineContent) && !lineContent.includes('///')) {
      return false;
    }

    // High-confidence: Data annotation attributes
    for (const annotation of DATA_ANNOTATIONS) {
      if (new RegExp(`\\[${annotation}(?:\\(|\\])`, 'i').test(lineContent)) {
        return true;
      }
    }

    // FluentValidation patterns
    if (/AbstractValidator<|RuleFor\s*\(|\.NotEmpty\s*\(|\.NotNull\s*\(/.test(lineContent)) {
      return true;
    }

    // ModelState checking
    if (/ModelState\.IsValid|!ModelState\.IsValid/.test(lineContent)) {
      return true;
    }

    // Custom validation attribute
    if (/:\s*ValidationAttribute/.test(lineContent)) {
      return true;
    }

    // Manual validation
    if (/string\.IsNullOrEmpty|string\.IsNullOrWhiteSpace/.test(lineContent)) {
      return true;
    }

    // Check file path for validation patterns
    for (const pattern of VALIDATION_FILE_PATTERNS) {
      if (pattern.test(file)) {
        // File is in a validation area - check for validation context
        const hasValidationContext = VALIDATION_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (hasValidationContext) {
          return true;
        }
      }
    }

    // Check for validation context in surrounding code
    const hasValidationContext = VALIDATION_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
    return hasValidationContext && lineLower.includes(keyword.toLowerCase());
  }

  /**
   * Create violation for inconsistent validation pattern
   */
  protected createPatternViolation(
    match: SemanticMatch,
    dominantPattern: UsagePattern
  ): Violation {
    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity: 'warning',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent validation pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for input validation in ${(dominantPattern.percentage * 100).toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Input validation is critical for security. Consistent validation patterns help prevent injection attacks and ensure data integrity.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createInputValidationSemanticDetector(): InputValidationSemanticDetector {
  return new InputValidationSemanticDetector();
}
