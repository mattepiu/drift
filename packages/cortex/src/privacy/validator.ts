/**
 * Privacy Validator
 * 
 * Validates content before storage.
 */

import { PrivacySanitizer } from './sanitizer.js';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  sanitized: string;
  warnings: string[];
}

/**
 * Privacy validator
 */
export class PrivacyValidator {
  private sanitizer = new PrivacySanitizer();

  /**
   * Validate and sanitize content before storage
   */
  validate(content: string): ValidationResult {
    const warnings: string[] = [];

    // Check for sensitive data
    if (this.sanitizer.containsSensitive(content)) {
      warnings.push('Content contains sensitive data that will be redacted');
    }

    // Sanitize
    const result = this.sanitizer.sanitize(content);

    if (result.redactedCount > 0) {
      warnings.push(`Redacted ${result.redactedCount} sensitive items: ${result.redactedTypes.join(', ')}`);
    }

    return {
      valid: true,
      sanitized: result.sanitized,
      warnings,
    };
  }

  /**
   * Validate a memory object
   */
  validateMemory(memory: unknown): ValidationResult {
    const content = JSON.stringify(memory);
    return this.validate(content);
  }
}
