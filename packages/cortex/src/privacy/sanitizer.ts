/**
 * Privacy Sanitizer
 * 
 * Sanitizes content to remove PII and secrets.
 */

import { ALL_PATTERNS, PII_PATTERNS, SECRET_PATTERNS } from './patterns.js';

/**
 * Sanitization result
 */
export interface SanitizationResult {
  sanitized: string;
  redactedCount: number;
  redactedTypes: string[];
}

/**
 * Privacy sanitizer
 */
export class PrivacySanitizer {
  /**
   * Sanitize content
   */
  sanitize(content: string): SanitizationResult {
    let sanitized = content;
    const redactedTypes: string[] = [];
    let redactedCount = 0;

    for (const { name, pattern, replacement } of ALL_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        redactedCount += matches.length;
        redactedTypes.push(name);
        sanitized = sanitized.replace(pattern, replacement);
      }
    }

    return {
      sanitized,
      redactedCount,
      redactedTypes: [...new Set(redactedTypes)],
    };
  }

  /**
   * Sanitize PII only
   */
  sanitizePII(content: string): SanitizationResult {
    let sanitized = content;
    const redactedTypes: string[] = [];
    let redactedCount = 0;

    for (const { name, pattern, replacement } of PII_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        redactedCount += matches.length;
        redactedTypes.push(name);
        sanitized = sanitized.replace(pattern, replacement);
      }
    }

    return {
      sanitized,
      redactedCount,
      redactedTypes: [...new Set(redactedTypes)],
    };
  }

  /**
   * Sanitize secrets only
   */
  sanitizeSecrets(content: string): SanitizationResult {
    let sanitized = content;
    const redactedTypes: string[] = [];
    let redactedCount = 0;

    for (const { name, pattern, replacement } of SECRET_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        redactedCount += matches.length;
        redactedTypes.push(name);
        sanitized = sanitized.replace(pattern, replacement);
      }
    }

    return {
      sanitized,
      redactedCount,
      redactedTypes: [...new Set(redactedTypes)],
    };
  }

  /**
   * Check if content contains sensitive data
   */
  containsSensitive(content: string): boolean {
    for (const { pattern } of ALL_PATTERNS) {
      if (pattern.test(content)) {
        return true;
      }
    }
    return false;
  }
}
