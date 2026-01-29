/**
 * Laravel Validation Patterns Detector - SEMANTIC VERSION
 *
 * Learns validation patterns from your Laravel codebase:
 * - Form Request validation
 * - Inline validation
 * - Custom validation rules
 * - Validation messages
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

const VALIDATION_FILE_PATTERNS = [
  /requests\//i, /rules\//i, /controllers\//i,
  /validators\//i,
];

const VALIDATION_CONTEXT_KEYWORDS = [
  'illuminate\\foundation\\http\\formrequest',
  'illuminate\\validation\\rule',
  'illuminate\\contracts\\validation',
  'validate(', 'validated(', 'rules(',
  'formrequest', 'validator::',
];


export class LaravelValidationSemanticDetector extends SemanticDetector {
  readonly id = 'validation/laravel-validation-semantic';
  readonly name = 'Laravel Validation Patterns Detector';
  readonly description = 'Learns validation patterns from your Laravel codebase';
  readonly category = 'security' as const;
  readonly subcategory = 'laravel';

  override readonly supportedLanguages: Language[] = ['php'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: true,
    });
  }

  protected getSemanticKeywords(): string[] {
    return [
      // Form Requests
      'FormRequest', 'authorize', 'rules', 'messages', 'attributes',
      'prepareForValidation', 'passedValidation', 'failedValidation',
      'withValidator', 'after',
      
      // Validation methods
      'validate', 'validated', 'validateWithBag', 'safe',
      'Validator', 'make', 'fails', 'passes', 'errors',
      
      // Built-in rules
      'required', 'nullable', 'sometimes', 'bail',
      'string', 'integer', 'numeric', 'boolean', 'array',
      'email', 'url', 'ip', 'uuid', 'json',
      'min', 'max', 'between', 'size', 'digits', 'digits_between',
      'in', 'not_in', 'exists', 'unique',
      'date', 'date_format', 'before', 'after', 'date_equals',
      'confirmed', 'same', 'different',
      'regex', 'not_regex', 'alpha', 'alpha_num', 'alpha_dash',
      'file', 'image', 'mimes', 'mimetypes', 'dimensions',
      'accepted', 'declined', 'prohibited', 'required_if', 'required_unless',
      
      // Rule class
      'Rule', 'when', 'unless', 'dimensions', 'exists', 'in', 'notIn',
      'prohibitedIf', 'requiredIf', 'unique', 'password',
      
      // Custom rules
      'InvokableRule', 'ValidationRule', 'ImplicitRule',
      'setData', 'passes', 'message',
    ];
  }

  protected getSemanticCategory(): string {
    return 'validation';
  }


  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    const highConfidenceKeywords = [
      'FormRequest', 'Validator', 'validate', 'validated',
      'rules', 'Rule', 'InvokableRule',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // Validation rules in strings are relevant
    const validationRules = ['required', 'string', 'email', 'numeric', 'min', 'max', 'unique', 'exists'];
    if (validationRules.includes(keyword.toLowerCase())) {
      const hasContext = VALIDATION_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inValidationFile = VALIDATION_FILE_PATTERNS.some(p => p.test(file));
        if (!inValidationFile) {return false;}
      }
    }

    return true;
  }

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
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for validation in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelValidationSemanticDetector(): LaravelValidationSemanticDetector {
  return new LaravelValidationSemanticDetector();
}
