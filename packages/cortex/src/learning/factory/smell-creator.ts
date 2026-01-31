/**
 * Code Smell Creator
 * 
 * Creates code smell memories from corrections that reveal
 * anti-patterns or bad practices to avoid.
 * 
 * @module learning/factory/smell-creator
 */

import { randomUUID } from 'crypto';
import type { CodeSmellMemory, SmellSeverity } from '../../types/code-smell.js';
import type { AnalyzedCorrection } from '../../types/learning.js';
import type { MemoryCreator } from './tribal-creator.js';

/**
 * Code Smell Creator
 * 
 * Creates code smell memories from corrections that indicate
 * anti-patterns or practices to avoid.
 */
export class CodeSmellCreator implements MemoryCreator<CodeSmellMemory> {
  /**
   * Create a code smell memory from an analyzed correction
   */
  create(analysis: AnalyzedCorrection): CodeSmellMemory {
    const name = this.inferSmellName(analysis);
    const pattern = this.extractPattern(analysis);
    const severity = this.inferSeverity(analysis);
    const { bad, good } = this.buildExample(analysis);
    const consequences = this.extractConsequences(analysis);
    const detectionRule = this.buildDetectionRule(pattern);

    const now = new Date().toISOString();

    const memory: CodeSmellMemory = {
      id: randomUUID(),
      type: 'code_smell',
      name,
      description: analysis.principle.explanation,
      severity,
      reason: this.extractReason(analysis),
      suggestion: analysis.principle.statement,
      autoDetect: this.canAutoDetect(pattern),
      summary: this.generateSummary(name, severity),
      confidence: analysis.principle.confidence,
      importance: this.mapSeverityToImportance(severity),
      transactionTime: {
        recordedAt: now,
      },
      validTime: {
        validFrom: now,
      },
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
      tags: [...analysis.principle.keywords, 'code-smell', severity],
    };

    // Add optional properties only if they have values
    if (pattern) {
      memory.pattern = pattern;
    }
    if (consequences) {
      memory.consequences = consequences;
    }
    if (bad) {
      memory.exampleBad = bad;
    }
    if (good) {
      memory.exampleGood = good;
    }
    if (detectionRule) {
      memory.detectionRule = detectionRule;
    }
    if (analysis.metadata?.filePath) {
      memory.linkedFiles = [analysis.metadata.filePath];
    }

    return memory;
  }

  /**
   * Extract the anti-pattern from the analysis
   */
  extractPattern(analysis: AnalyzedCorrection): string | undefined {
    // Try to extract from diff
    if (analysis.diff?.removals.length) {
      // The removed code is the anti-pattern
      const removedCode = analysis.diff.removals
        .map(r => r.content)
        .join('\n')
        .trim();

      if (removedCode.length > 0 && removedCode.length < 200) {
        return removedCode;
      }
    }

    // Try to extract from original
    if (analysis.original && analysis.original.length < 200) {
      return analysis.original;
    }

    // Extract pattern description from feedback
    const patternMatch = analysis.feedback.match(
      /(?:don't|never|avoid)\s+([^.!?]+)/i
    );
    if (patternMatch?.[1]) {
      return patternMatch[1].trim();
    }

    return undefined;
  }

  /**
   * Build good and bad examples from the analysis
   */
  buildExample(analysis: AnalyzedCorrection): { bad: string; good: string } {
    let bad = '';
    let good = '';

    // Use original as bad example
    if (analysis.original) {
      bad = analysis.original.slice(0, 300);
    }

    // Use corrected code as good example
    if (analysis.correctedCode) {
      good = analysis.correctedCode.slice(0, 300);
    }

    // If we have diff, use that
    if (analysis.diff) {
      if (analysis.diff.removals.length > 0 && !bad) {
        bad = analysis.diff.removals.map(r => r.content).join('\n').slice(0, 300);
      }
      if (analysis.diff.additions.length > 0 && !good) {
        good = analysis.diff.additions.map(a => a.content).join('\n').slice(0, 300);
      }
    }

    // Use principle examples if available
    if (analysis.principle.incorrectExample && !bad) {
      bad = analysis.principle.incorrectExample;
    }
    if (analysis.principle.correctExample && !good) {
      good = analysis.principle.correctExample;
    }

    return { bad, good };
  }

  /**
   * Infer smell name from analysis
   */
  private inferSmellName(analysis: AnalyzedCorrection): string {
    // Check for known smell patterns
    const smellPatterns: Record<string, string[]> = {
      'Magic Number': ['magic', 'hardcoded', 'literal'],
      'Long Method': ['long', 'too many lines', 'complex'],
      'God Class': ['god', 'too many responsibilities', 'monolithic'],
      'Feature Envy': ['feature envy', 'accessing other', 'wrong class'],
      'Data Clump': ['data clump', 'always together', 'group of'],
      'Primitive Obsession': ['primitive', 'should be object', 'type'],
      'Switch Statement': ['switch', 'case', 'polymorphism'],
      'Parallel Inheritance': ['parallel', 'inheritance', 'hierarchy'],
      'Lazy Class': ['lazy', 'does nothing', 'unnecessary'],
      'Speculative Generality': ['speculative', 'might need', 'future'],
      'Temporary Field': ['temporary', 'sometimes null', 'optional'],
      'Message Chain': ['chain', 'train wreck', 'law of demeter'],
      'Middle Man': ['middle man', 'delegation', 'pass through'],
      'Inappropriate Intimacy': ['intimate', 'private', 'internal'],
      'Alternative Classes': ['alternative', 'similar', 'duplicate'],
      'Incomplete Library': ['library', 'missing', 'extend'],
      'Data Class': ['data class', 'only getters', 'anemic'],
      'Refused Bequest': ['refused', 'inherit', 'override'],
      'Comments': ['comment', 'explain', 'self-documenting'],
    };

    const lowerFeedback = analysis.feedback.toLowerCase();

    for (const [smellName, keywords] of Object.entries(smellPatterns)) {
      if (keywords.some(k => lowerFeedback.includes(k))) {
        return smellName;
      }
    }

    // Generate name from category
    const categoryNames: Record<string, string> = {
      security_issue: 'Security Anti-Pattern',
      performance_issue: 'Performance Anti-Pattern',
      api_misuse: 'API Misuse',
      pattern_violation: 'Pattern Violation',
      architecture_mismatch: 'Architecture Smell',
    };

    return categoryNames[analysis.category] || 'Code Smell';
  }

  /**
   * Infer severity from analysis
   */
  private inferSeverity(analysis: AnalyzedCorrection): SmellSeverity {
    // Security issues are errors
    if (analysis.category === 'security_issue') {
      return 'error';
    }

    // Check feedback for severity indicators
    const lowerFeedback = analysis.feedback.toLowerCase();

    if (
      lowerFeedback.includes('critical') ||
      lowerFeedback.includes('dangerous') ||
      lowerFeedback.includes('vulnerability') ||
      lowerFeedback.includes('security')
    ) {
      return 'error';
    }

    if (
      lowerFeedback.includes('warning') ||
      lowerFeedback.includes('avoid') ||
      lowerFeedback.includes('bad practice')
    ) {
      return 'warning';
    }

    // Hard rules are warnings
    if (analysis.principle.isHardRule) {
      return 'warning';
    }

    return 'info';
  }

  /**
   * Extract reason from analysis
   */
  private extractReason(analysis: AnalyzedCorrection): string {
    // Look for "because" explanations
    const becauseMatch = analysis.feedback.match(/because\s+([^.!?]+)/i);
    if (becauseMatch?.[1]) {
      return becauseMatch[1].trim();
    }

    // Look for "since" explanations
    const sinceMatch = analysis.feedback.match(/since\s+([^.!?]+)/i);
    if (sinceMatch?.[1]) {
      return sinceMatch[1].trim();
    }

    // Use principle explanation
    return analysis.principle.explanation;
  }

  /**
   * Extract consequences from analysis
   */
  private extractConsequences(analysis: AnalyzedCorrection): string[] | undefined {
    const consequences: string[] = [];

    // Look for consequence phrases
    const patterns = [
      /will\s+cause\s+([^.!?]+)/gi,
      /leads?\s+to\s+([^.!?]+)/gi,
      /results?\s+in\s+([^.!?]+)/gi,
      /can\s+cause\s+([^.!?]+)/gi,
    ];

    for (const pattern of patterns) {
      const matches = analysis.feedback.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          consequences.push(match[1].trim());
        }
      }
    }

    // Add category-specific consequences
    const categoryConsequences: Record<string, string> = {
      security_issue: 'May introduce security vulnerabilities',
      performance_issue: 'May cause performance degradation',
      api_misuse: 'May cause unexpected behavior or errors',
    };

    const categoryConsequence = categoryConsequences[analysis.category];
    if (categoryConsequence) {
      consequences.push(categoryConsequence);
    }

    return consequences.length > 0 ? consequences : undefined;
  }

  /**
   * Check if pattern can be auto-detected
   */
  private canAutoDetect(pattern: string | undefined): boolean {
    if (!pattern) return false;

    // Simple patterns can be auto-detected
    // Complex patterns need manual review
    return pattern.length < 100 && !pattern.includes('\n');
  }

  /**
   * Build detection rule from pattern
   */
  private buildDetectionRule(pattern: string | undefined): string | undefined {
    if (!pattern) return undefined;

    // Try to create a regex from the pattern
    try {
      // Escape special characters
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Make it more flexible
      const flexible = escaped
        .replace(/\s+/g, '\\s+')
        .replace(/\w+/g, '\\w+');

      // Test if it's a valid regex
      new RegExp(flexible);

      return flexible;
    } catch {
      // Can't create regex, return description
      return `Pattern: ${pattern.slice(0, 50)}`;
    }
  }

  /**
   * Generate summary for the memory
   */
  private generateSummary(name: string, severity: SmellSeverity): string {
    const severityEmoji: Record<SmellSeverity, string> = {
      error: '🔴',
      warning: '🟡',
      info: '🔵',
    };

    return `${severityEmoji[severity]} [${name}] Anti-pattern to avoid`;
  }

  /**
   * Map severity to importance
   */
  private mapSeverityToImportance(
    severity: SmellSeverity
  ): 'low' | 'normal' | 'high' | 'critical' {
    switch (severity) {
      case 'error':
        return 'high';
      case 'warning':
        return 'normal';
      case 'info':
      default:
        return 'low';
    }
  }
}
