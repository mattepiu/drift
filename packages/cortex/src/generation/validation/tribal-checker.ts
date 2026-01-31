/**
 * Tribal Compliance Checker
 * 
 * Checks if generated code respects tribal knowledge
 * from the generation context.
 * 
 * @module generation/validation/tribal-checker
 */

import type { TribalContext } from '../types.js';

/**
 * Tribal violation
 */
export interface TribalViolation {
  /** Memory ID of the tribal knowledge */
  memoryId: string;
  /** Topic of the tribal knowledge */
  topic: string;
  /** Description of the violation */
  description: string;
  /** Severity */
  severity: 'error' | 'warning' | 'info';
  /** The knowledge that was violated */
  knowledge: string;
  /** Consequences of the violation */
  consequences?: string[];
}

/**
 * Tribal Compliance Checker
 * 
 * Checks if generated code respects tribal knowledge.
 */
export class TribalComplianceChecker {
  /**
   * Check code against tribal knowledge
   */
  check(code: string, tribal: TribalContext[]): TribalViolation[] {
    const violations: TribalViolation[] = [];

    for (const knowledge of tribal) {
      if (this.violatesTribal(code, knowledge)) {
        const violation: TribalViolation = {
          memoryId: knowledge.memoryId,
          topic: knowledge.topic,
          description: `Code may violate tribal knowledge about ${knowledge.topic}`,
          severity: this.mapSeverity(knowledge.severity),
          knowledge: knowledge.knowledge,
        };
        if (knowledge.consequences && knowledge.consequences.length > 0) {
          violation.consequences = knowledge.consequences;
        }
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * Check if code violates tribal knowledge
   */
  private violatesTribal(code: string, tribal: TribalContext): boolean {
    const codeLower = code.toLowerCase();

    // Check for negative patterns (things to avoid)
    const negativePatterns = this.extractNegativePatterns(tribal.knowledge);
    for (const pattern of negativePatterns) {
      if (codeLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Check warnings
    if (tribal.warnings) {
      for (const warning of tribal.warnings) {
        const warningTerms = this.extractKeyTerms(warning.toLowerCase());
        // If warning mentions something and code contains it, might be a violation
        for (const term of warningTerms) {
          if (codeLower.includes(term) && this.isNegativeContext(warning)) {
            return true;
          }
        }
      }
    }

    // Check for specific anti-patterns based on topic
    return this.checkTopicSpecificViolations(code, tribal);
  }

  /**
   * Extract key terms from text
   */
  private extractKeyTerms(text: string): string[] {
    // Remove common words and extract meaningful terms
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'this', 'that', 'these', 'those']);

    return text
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 10);
  }

  /**
   * Extract negative patterns (things to avoid)
   */
  private extractNegativePatterns(knowledge: string): string[] {
    const patterns: string[] = [];
    const knowledgeLower = knowledge.toLowerCase();

    // Look for "never", "don't", "avoid", "do not" patterns
    const negativeIndicators = ['never', "don't", 'do not', 'avoid', 'should not', "shouldn't", 'must not', "mustn't"];

    for (const indicator of negativeIndicators) {
      const index = knowledgeLower.indexOf(indicator);
      if (index !== -1) {
        // Extract the phrase after the negative indicator
        const afterIndicator = knowledge.substring(index + indicator.length).trim();
        const phrase = afterIndicator.split(/[.,;!?]/)[0]?.trim();
        if (phrase && phrase.length > 0) {
          patterns.push(phrase);
        }
      }
    }

    return patterns;
  }

  /**
   * Check if warning is in negative context
   */
  private isNegativeContext(warning: string): boolean {
    const negativeWords = ['never', "don't", 'avoid', 'not', 'danger', 'risk', 'problem', 'issue', 'fail', 'error', 'bug', 'crash', 'break'];
    const warningLower = warning.toLowerCase();
    return negativeWords.some(word => warningLower.includes(word));
  }

  /**
   * Check topic-specific violations
   */
  private checkTopicSpecificViolations(code: string, tribal: TribalContext): boolean {
    const topic = tribal.topic.toLowerCase();
    const codeLower = code.toLowerCase();

    // Authentication topic
    if (topic.includes('auth') || topic.includes('login') || topic.includes('password')) {
      // Check for hardcoded credentials
      if (codeLower.includes('password') && (codeLower.includes("'") || codeLower.includes('"'))) {
        const passwordPattern = /password\s*[=:]\s*['"][^'"]+['"]/i;
        if (passwordPattern.test(code)) {
          return true;
        }
      }
    }

    // Database topic
    if (topic.includes('database') || topic.includes('sql') || topic.includes('query')) {
      // Check for SQL injection patterns
      if (codeLower.includes('query') && (codeLower.includes('${') || codeLower.includes("' +"))) {
        return true;
      }
    }

    // API topic
    if (topic.includes('api') || topic.includes('endpoint') || topic.includes('request')) {
      // Check for missing error handling
      if ((codeLower.includes('fetch') || codeLower.includes('axios')) && !codeLower.includes('catch')) {
        return true;
      }
    }

    // Security topic
    if (topic.includes('security') || topic.includes('sensitive') || topic.includes('secret')) {
      // Check for logging sensitive data
      if (codeLower.includes('console.log') && (codeLower.includes('password') || codeLower.includes('token') || codeLower.includes('secret'))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Map tribal severity to violation severity
   */
  private mapSeverity(tribalSeverity: 'info' | 'warning' | 'critical'): 'error' | 'warning' | 'info' {
    switch (tribalSeverity) {
      case 'critical':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'warning';
    }
  }
}
