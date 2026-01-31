/**
 * Anti-Pattern Checker
 * 
 * Checks if generated code contains any of the
 * anti-patterns from the generation context.
 * 
 * @module generation/validation/antipattern-checker
 */

import type { AntiPatternContext } from '../types.js';

/**
 * Anti-pattern match
 */
export interface AntiPatternMatch {
  /** Memory ID of the anti-pattern */
  memoryId: string;
  /** Name of the anti-pattern */
  name: string;
  /** Description of the match */
  description: string;
  /** Severity */
  severity: 'error' | 'warning' | 'info';
  /** The pattern that was matched */
  pattern: string;
  /** Suggested alternative */
  alternative: string;
  /** Line number (if applicable) */
  line?: number;
}

/**
 * Anti-Pattern Checker
 * 
 * Checks if generated code contains anti-patterns.
 */
export class AntiPatternChecker {
  /**
   * Check code against anti-patterns
   */
  check(code: string, antiPatterns: AntiPatternContext[]): AntiPatternMatch[] {
    const matches: AntiPatternMatch[] = [];

    for (const antiPattern of antiPatterns) {
      const match = this.matchesAntiPattern(code, antiPattern);
      if (match) {
        matches.push(match);
      }
    }

    return matches;
  }

  /**
   * Check if code matches an anti-pattern
   */
  private matchesAntiPattern(code: string, antiPattern: AntiPatternContext): AntiPatternMatch | null {
    // Try regex pattern if it looks like one
    if (this.isRegexPattern(antiPattern.pattern)) {
      const match = this.matchRegexPattern(code, antiPattern);
      if (match) {
        return match;
      }
    }

    // Try keyword matching
    const keywordMatch = this.matchKeywords(code, antiPattern);
    if (keywordMatch) {
      return keywordMatch;
    }

    // Try structural matching
    const structuralMatch = this.matchStructural(code, antiPattern);
    if (structuralMatch) {
      return structuralMatch;
    }

    return null;
  }

  /**
   * Check if pattern looks like a regex
   */
  private isRegexPattern(pattern: string): boolean {
    const regexIndicators = ['^', '$', '\\', '[', ']', '(', ')', '*', '+', '?', '{', '}', '|'];
    return regexIndicators.some(indicator => pattern.includes(indicator));
  }

  /**
   * Match using regex pattern
   */
  private matchRegexPattern(code: string, antiPattern: AntiPatternContext): AntiPatternMatch | null {
    try {
      const regex = new RegExp(antiPattern.pattern, 'gi');
      const match = regex.exec(code);

      if (match) {
        // Find line number
        const beforeMatch = code.substring(0, match.index);
        const line = (beforeMatch.match(/\n/g) ?? []).length + 1;

        return {
          memoryId: antiPattern.memoryId,
          name: antiPattern.name,
          description: `Anti-pattern detected: ${antiPattern.name}`,
          severity: 'warning',
          pattern: antiPattern.pattern,
          alternative: antiPattern.alternative,
          line,
        };
      }
    } catch {
      // Invalid regex, fall through to other matching methods
    }

    return null;
  }

  /**
   * Match using keywords from pattern
   */
  private matchKeywords(code: string, antiPattern: AntiPatternContext): AntiPatternMatch | null {
    const codeLower = code.toLowerCase();
    const patternLower = antiPattern.pattern.toLowerCase();

    // Extract keywords from pattern
    const keywords = patternLower
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5);

    // Check if most keywords are present
    const matchedKeywords = keywords.filter(kw => codeLower.includes(kw));
    const matchRatio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 0;

    if (matchRatio >= 0.6) {
      return {
        memoryId: antiPattern.memoryId,
        name: antiPattern.name,
        description: `Code may contain anti-pattern: ${antiPattern.name}`,
        severity: 'warning',
        pattern: antiPattern.pattern,
        alternative: antiPattern.alternative,
      };
    }

    return null;
  }

  /**
   * Match using structural patterns
   */
  private matchStructural(code: string, antiPattern: AntiPatternContext): AntiPatternMatch | null {
    const nameLower = antiPattern.name.toLowerCase();
    const codeLower = code.toLowerCase();

    // Check for common anti-patterns by name
    if (nameLower.includes('nested ternary') || nameLower.includes('ternary')) {
      // Check for nested ternaries
      const ternaryCount = (code.match(/\?[^:]*:/g) ?? []).length;
      if (ternaryCount >= 2) {
        // Check if they're nested
        const nestedTernaryRegex = /\?[^?:]*\?[^:]*:[^:]*:/;
        if (nestedTernaryRegex.test(code)) {
          return this.createMatch(antiPattern, 'Nested ternary operators detected');
        }
      }
    }

    if (nameLower.includes('callback hell') || nameLower.includes('pyramid')) {
      // Check for deeply nested callbacks
      const indentLevels = code.split('\n').map(line => {
        const match = line.match(/^(\s*)/);
        return match?.[1]?.length ?? 0;
      });
      const maxIndent = Math.max(...indentLevels);
      if (maxIndent > 20) {
        return this.createMatch(antiPattern, 'Deeply nested code detected (possible callback hell)');
      }
    }

    if (nameLower.includes('magic number') || nameLower.includes('hardcoded')) {
      // Check for magic numbers
      const magicNumberRegex = /[^a-zA-Z0-9_]([2-9]\d{2,}|[1-9]\d{3,})[^a-zA-Z0-9_]/g;
      if (magicNumberRegex.test(code)) {
        return this.createMatch(antiPattern, 'Magic numbers detected - consider using named constants');
      }
    }

    if (nameLower.includes('god class') || nameLower.includes('large class')) {
      // Check for very large classes
      const classMatch = code.match(/class\s+\w+[^{]*\{/);
      if (classMatch) {
        const methodCount = (code.match(/\b(async\s+)?\w+\s*\([^)]*\)\s*[:{]/g) ?? []).length;
        if (methodCount > 15) {
          return this.createMatch(antiPattern, 'Large class detected - consider splitting into smaller classes');
        }
      }
    }

    if (nameLower.includes('long function') || nameLower.includes('long method')) {
      // Check for very long functions
      const lines = code.split('\n').length;
      if (lines > 50) {
        return this.createMatch(antiPattern, 'Long function detected - consider breaking into smaller functions');
      }
    }

    if (nameLower.includes('sql injection') || nameLower.includes('string concat')) {
      // Check for SQL injection patterns
      const codeLowerCase = code.toLowerCase();
      if (codeLowerCase.includes('query') || codeLowerCase.includes('sql')) {
        if (code.includes('`${') || code.includes("' + ") || code.includes('" + ')) {
          return this.createMatch(antiPattern, 'Potential SQL injection - use parameterized queries');
        }
      }
    }

    if (nameLower.includes('console.log') || nameLower.includes('debug')) {
      // Check for console.log statements
      if (codeLower.includes('console.log')) {
        return this.createMatch(antiPattern, 'console.log statements detected - use proper logging');
      }
    }

    if (nameLower.includes('any type') || nameLower.includes('typescript any')) {
      // Check for 'any' type usage
      if (code.includes(': any') || code.includes('<any>') || code.includes('as any')) {
        return this.createMatch(antiPattern, 'TypeScript "any" type detected - use specific types');
      }
    }

    return null;
  }

  /**
   * Create a match result
   */
  private createMatch(antiPattern: AntiPatternContext, description: string): AntiPatternMatch {
    return {
      memoryId: antiPattern.memoryId,
      name: antiPattern.name,
      description,
      severity: 'warning',
      pattern: antiPattern.pattern,
      alternative: antiPattern.alternative,
    };
  }
}
