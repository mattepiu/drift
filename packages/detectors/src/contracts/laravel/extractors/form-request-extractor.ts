/**
 * Laravel Form Request Extractor
 *
 * Extracts Form Request definitions from Laravel request files.
 * Handles validation rules, authorization, and custom messages.
 *
 * @module contracts/laravel/extractors/form-request-extractor
 */

import { ClassExtractor } from '../../../php/class-extractor.js';
import { inferTypeFromRules } from '../types.js';

import type { PhpClassInfo, PhpMethodInfo } from '../../../php/types.js';
import type {
  LaravelFormRequestInfo,
  ValidationRule,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Pattern to match validation rules in rules() method
 * 'field' => ['required', 'string', 'max:255']
 * 'field' => 'required|string|max:255'
 */
const RULE_ARRAY_PATTERN = /['"]([^'"]+)['"]\s*=>\s*\[([^\]]+)\]/g;
const RULE_STRING_PATTERN = /['"]([^'"]+)['"]\s*=>\s*['"]([^'"]+)['"]/g;

/**
 * Pattern to match nested/array field rules
 * 'items.*.name' => ['required', 'string']
 */
// const NESTED_FIELD_PATTERN = /^(\w+)(?:\.\*)?(?:\.(\w+))?$/;

// ============================================================================
// Form Request Extractor
// ============================================================================

/**
 * Extracts Laravel Form Request definitions
 */
export class FormRequestExtractor {
  private readonly classExtractor: ClassExtractor;

  constructor() {
    this.classExtractor = new ClassExtractor();
  }

  /**
   * Extract all form requests from content
   *
   * @param content - PHP source code
   * @param file - File path
   * @returns Array of extracted form requests
   */
  extract(content: string, file: string): LaravelFormRequestInfo[] {
    const formRequests: LaravelFormRequestInfo[] = [];

    // Extract namespace
    const namespace = this.extractNamespace(content);

    // Extract classes
    const classResult = this.classExtractor.extract(content, file, namespace);

    for (const classInfo of classResult.items) {
      if (this.isFormRequest(classInfo)) {
        const formRequest = this.parseFormRequest(classInfo, file);
        formRequests.push(formRequest);
      }
    }

    return formRequests;
  }

  /**
   * Check if content contains Laravel form requests
   */
  hasFormRequests(content: string): boolean {
    return (
      content.includes('extends FormRequest') ||
      content.includes('use Illuminate\\Foundation\\Http\\FormRequest')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Check if a class is a form request
   */
  private isFormRequest(classInfo: PhpClassInfo): boolean {
    if (classInfo.extends?.includes('FormRequest')) {return true;}
    if (classInfo.name.endsWith('Request') && classInfo.methods.some(m => m.name === 'rules')) {return true;}
    return false;
  }

  /**
   * Parse a form request class
   */
  private parseFormRequest(
    classInfo: PhpClassInfo,
    file: string
  ): LaravelFormRequestInfo {
    // Find rules method
    const rulesMethod = classInfo.methods.find(m => m.name === 'rules');

    // Extract validation rules
    const rules = rulesMethod ? this.extractRules(rulesMethod) : [];

    // Check for other methods
    const hasAuthorization = classInfo.methods.some(m => m.name === 'authorize');
    const hasCustomMessages = classInfo.methods.some(m => m.name === 'messages');
    const hasCustomAttributes = classInfo.methods.some(m => m.name === 'attributes');
    const hasPrepareForValidation = classInfo.methods.some(m => m.name === 'prepareForValidation');

    return {
      name: classInfo.name,
      fqn: classInfo.fqn,
      namespace: classInfo.namespace,
      rules,
      hasAuthorization,
      hasCustomMessages,
      hasCustomAttributes,
      hasPrepareForValidation,
      file,
      line: classInfo.line,
    };
  }

  /**
   * Extract validation rules from rules() method
   */
  private extractRules(method: PhpMethodInfo): ValidationRule[] {
    const rules: ValidationRule[] = [];
    
    if (!method.body) {return rules;}

    // Extract array-style rules
    RULE_ARRAY_PATTERN.lastIndex = 0;
    let match;
    while ((match = RULE_ARRAY_PATTERN.exec(method.body)) !== null) {
      const field = match[1] || '';
      const rulesStr = match[2] || '';
      
      const ruleList = this.parseRuleArray(rulesStr);
      const rule = this.createValidationRule(field, ruleList, method.line);
      rules.push(rule);
    }

    // Extract string-style rules (pipe-separated)
    RULE_STRING_PATTERN.lastIndex = 0;
    while ((match = RULE_STRING_PATTERN.exec(method.body)) !== null) {
      const field = match[1] || '';
      const rulesStr = match[2] || '';
      
      // Skip if already processed as array
      if (rules.some(r => r.field === field)) {continue;}
      
      const ruleList = rulesStr.split('|').map(r => r.trim()).filter(Boolean);
      const rule = this.createValidationRule(field, ruleList, method.line);
      rules.push(rule);
    }

    return rules;
  }

  /**
   * Parse array-style rules
   */
  private parseRuleArray(rulesStr: string): string[] {
    const rules: string[] = [];
    
    // Split by comma, respecting strings
    let current = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < rulesStr.length; i++) {
      const char = rulesStr[i];

      if ((char === '"' || char === "'") && rulesStr[i - 1] !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (char === ',' && !inString) {
        const trimmed = current.trim().replace(/^['"]|['"]$/g, '');
        if (trimmed) {rules.push(trimmed);}
        current = '';
      } else {
        current += char;
      }
    }

    const trimmed = current.trim().replace(/^['"]|['"]$/g, '');
    if (trimmed) {rules.push(trimmed);}

    return rules;
  }

  /**
   * Create a validation rule object
   */
  private createValidationRule(field: string, ruleList: string[], line: number): ValidationRule {
    const required = ruleList.some(r => r === 'required' || r.startsWith('required_'));
    const nullable = ruleList.includes('nullable');
    const inferredType = inferTypeFromRules(ruleList);

    return {
      field,
      rules: ruleList,
      required,
      nullable,
      inferredType,
      line,
    };
  }

  /**
   * Extract namespace from content
   */
  private extractNamespace(content: string): string | null {
    const match = content.match(/namespace\s+([\w\\]+)\s*;/);
    return match ? match[1] || null : null;
  }
}

/**
 * Create a new form request extractor instance
 */
export function createFormRequestExtractor(): FormRequestExtractor {
  return new FormRequestExtractor();
}
