/**
 * Pattern Compliance Checker
 * 
 * Checks if generated code follows the patterns
 * from the generation context.
 * 
 * @module generation/validation/pattern-checker
 */

import type { PatternContext } from '../types.js';

/**
 * Pattern violation
 */
export interface PatternViolation {
  /** Pattern that was violated */
  patternId: string;
  /** Pattern name */
  patternName: string;
  /** Description of the violation */
  description: string;
  /** Severity */
  severity: 'error' | 'warning' | 'info';
  /** Suggested fix */
  suggestion?: string;
  /** Line number (if applicable) */
  line?: number;
}

/**
 * Pattern Compliance Checker
 * 
 * Checks if generated code follows patterns.
 */
export class PatternComplianceChecker {
  /**
   * Check code against patterns
   */
  check(code: string, patterns: PatternContext[]): PatternViolation[] {
    const violations: PatternViolation[] = [];

    for (const pattern of patterns) {
      const patternViolations = this.checkPattern(code, pattern);
      violations.push(...patternViolations);
    }

    return violations;
  }

  /**
   * Check code against a single pattern
   */
  private checkPattern(code: string, pattern: PatternContext): PatternViolation[] {
    const violations: PatternViolation[] = [];

    // Check key rules
    for (const rule of pattern.keyRules) {
      if (!this.followsRule(code, rule)) {
        violations.push({
          patternId: pattern.patternId,
          patternName: pattern.patternName,
          description: `Code may not follow rule: ${rule}`,
          severity: 'warning',
          suggestion: `Review code to ensure it follows: ${rule}`,
        });
      }
    }

    // Check for common pattern violations based on category
    const categoryViolations = this.checkCategoryPatterns(code, pattern);
    violations.push(...categoryViolations);

    return violations;
  }

  /**
   * Check if code follows a rule
   */
  private followsRule(code: string, rule: string): boolean {
    const ruleLower = rule.toLowerCase();
    const codeLower = code.toLowerCase();

    // Check for common rule patterns
    if (ruleLower.includes('error handling') || ruleLower.includes('try-catch')) {
      return codeLower.includes('try') && codeLower.includes('catch');
    }

    if (ruleLower.includes('async') || ruleLower.includes('await')) {
      if (codeLower.includes('async')) {
        return codeLower.includes('await') || codeLower.includes('promise');
      }
    }

    if (ruleLower.includes('type') || ruleLower.includes('typescript')) {
      // Check for type annotations
      return code.includes(':') || code.includes('interface') || code.includes('type ');
    }

    if (ruleLower.includes('export')) {
      return codeLower.includes('export');
    }

    if (ruleLower.includes('const') || ruleLower.includes('immutable')) {
      // Check that let/var aren't used excessively
      const letCount = (code.match(/\blet\b/g) ?? []).length;
      const constCount = (code.match(/\bconst\b/g) ?? []).length;
      return constCount >= letCount;
    }

    // Default: assume rule is followed if we can't check
    return true;
  }

  /**
   * Check category-specific patterns
   */
  private checkCategoryPatterns(code: string, pattern: PatternContext): PatternViolation[] {
    const violations: PatternViolation[] = [];
    const category = pattern.category.toLowerCase();

    switch (category) {
      case 'api':
        violations.push(...this.checkApiPatterns(code, pattern));
        break;
      case 'auth':
        violations.push(...this.checkAuthPatterns(code, pattern));
        break;
      case 'error':
        violations.push(...this.checkErrorPatterns(code, pattern));
        break;
      case 'database':
        violations.push(...this.checkDatabasePatterns(code, pattern));
        break;
    }

    return violations;
  }

  /**
   * Check API patterns
   */
  private checkApiPatterns(code: string, pattern: PatternContext): PatternViolation[] {
    const violations: PatternViolation[] = [];

    // Check for response handling
    if (code.includes('fetch') || code.includes('axios') || code.includes('http')) {
      if (!code.includes('catch') && !code.includes('.catch')) {
        violations.push({
          patternId: pattern.patternId,
          patternName: pattern.patternName,
          description: 'API call without error handling',
          severity: 'warning',
          suggestion: 'Add try-catch or .catch() for API error handling',
        });
      }
    }

    return violations;
  }

  /**
   * Check auth patterns
   */
  private checkAuthPatterns(code: string, pattern: PatternContext): PatternViolation[] {
    const violations: PatternViolation[] = [];

    // Check for token handling
    if (code.includes('token') || code.includes('auth')) {
      if (code.includes('localStorage') || code.includes('sessionStorage')) {
        violations.push({
          patternId: pattern.patternId,
          patternName: pattern.patternName,
          description: 'Storing auth tokens in browser storage may be insecure',
          severity: 'warning',
          suggestion: 'Consider using httpOnly cookies for token storage',
        });
      }
    }

    return violations;
  }

  /**
   * Check error handling patterns
   */
  private checkErrorPatterns(code: string, pattern: PatternContext): PatternViolation[] {
    const violations: PatternViolation[] = [];

    // Check for empty catch blocks
    const emptyCatchRegex = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    if (emptyCatchRegex.test(code)) {
      violations.push({
        patternId: pattern.patternId,
        patternName: pattern.patternName,
        description: 'Empty catch block detected',
        severity: 'error',
        suggestion: 'Handle or log errors in catch blocks',
      });
    }

    // Check for console.log in error handling
    if (code.includes('catch') && code.includes('console.log')) {
      violations.push({
        patternId: pattern.patternId,
        patternName: pattern.patternName,
        description: 'Using console.log for error logging',
        severity: 'info',
        suggestion: 'Consider using a proper logging framework',
      });
    }

    return violations;
  }

  /**
   * Check database patterns
   */
  private checkDatabasePatterns(code: string, pattern: PatternContext): PatternViolation[] {
    const violations: PatternViolation[] = [];

    // Check for SQL injection risks
    if (code.includes('query') || code.includes('sql')) {
      if (code.includes('`${') || code.includes("' + ")) {
        violations.push({
          patternId: pattern.patternId,
          patternName: pattern.patternName,
          description: 'Potential SQL injection risk with string concatenation',
          severity: 'error',
          suggestion: 'Use parameterized queries instead of string concatenation',
        });
      }
    }

    return violations;
  }
}
