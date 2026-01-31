/**
 * Tribal Memory Creator
 * 
 * Creates tribal memories from corrections that reveal
 * institutional knowledge or "gotchas".
 * 
 * @module learning/factory/tribal-creator
 */

import { randomUUID } from 'crypto';
import type { TribalMemory, TribalSource, TribalSeverity } from '../../types/tribal-memory.js';
import type { AnalyzedCorrection } from '../../types/learning.js';

/**
 * Memory creator interface
 */
export interface MemoryCreator<T> {
  create(analysis: AnalyzedCorrection): T;
}

/**
 * Tribal Memory Creator
 * 
 * Creates tribal memories from corrections that indicate
 * missing institutional knowledge.
 */
export class TribalMemoryCreator implements MemoryCreator<TribalMemory> {
  /**
   * Create a tribal memory from an analyzed correction
   */
  create(analysis: AnalyzedCorrection): TribalMemory {
    const topic = this.inferTopic(analysis);
    const severity = this.inferSeverity(analysis);
    const source = this.buildSource(analysis);
    const subtopic = this.inferSubtopic(analysis);
    const warnings = this.extractWarnings(analysis);
    const consequences = this.extractConsequences(analysis);

    const now = new Date().toISOString();

    const memory: TribalMemory = {
      id: randomUUID(),
      type: 'tribal',
      topic,
      knowledge: analysis.principle.statement,
      context: analysis.feedback,
      severity,
      source,
      summary: this.generateSummary(analysis, topic),
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
      tags: analysis.principle.keywords,
    };

    // Add optional properties only if they have values
    if (subtopic) {
      memory.subtopic = subtopic;
    }
    if (warnings) {
      memory.warnings = warnings;
    }
    if (consequences) {
      memory.consequences = consequences;
    }
    if (analysis.metadata?.filePath) {
      memory.linkedFiles = [analysis.metadata.filePath];
    }
    if (analysis.metadata?.relatedPatterns) {
      memory.linkedPatterns = analysis.metadata.relatedPatterns;
    }
    if (analysis.metadata?.relatedConstraints) {
      memory.linkedConstraints = analysis.metadata.relatedConstraints;
    }

    return memory;
  }

  /**
   * Infer the main topic from the analysis
   */
  inferTopic(analysis: AnalyzedCorrection): string {
    // Check for common topics in feedback
    const topicKeywords: Record<string, string[]> = {
      authentication: ['auth', 'login', 'password', 'token', 'session', 'jwt'],
      database: ['database', 'db', 'query', 'sql', 'table', 'migration'],
      api: ['api', 'endpoint', 'request', 'response', 'rest', 'graphql'],
      security: ['security', 'secure', 'vulnerability', 'xss', 'csrf', 'injection'],
      performance: ['performance', 'slow', 'fast', 'optimize', 'cache', 'memory'],
      testing: ['test', 'spec', 'mock', 'stub', 'fixture', 'assertion'],
      deployment: ['deploy', 'ci', 'cd', 'pipeline', 'build', 'release'],
      configuration: ['config', 'env', 'environment', 'setting', 'option'],
      error_handling: ['error', 'exception', 'catch', 'throw', 'handle'],
      logging: ['log', 'logging', 'trace', 'debug', 'monitor'],
    };

    const lowerFeedback = analysis.feedback.toLowerCase();

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(k => lowerFeedback.includes(k))) {
        return topic;
      }
    }

    // Default to category-based topic
    return analysis.category.replace('_', ' ');
  }

  /**
   * Infer subtopic from the analysis
   */
  private inferSubtopic(analysis: AnalyzedCorrection): string | undefined {
    // Extract more specific topic from feedback
    const words = analysis.feedback.split(/\s+/);
    const significantWords = words.filter(w => 
      w.length > 4 && 
      /^[a-zA-Z]+$/.test(w) &&
      !['should', 'would', 'could', 'always', 'never'].includes(w.toLowerCase())
    );

    const firstWord = significantWords[0];
    if (firstWord) {
      return firstWord.toLowerCase();
    }

    return undefined;
  }

  /**
   * Infer severity from the analysis
   */
  inferSeverity(analysis: AnalyzedCorrection): TribalSeverity {
    // Critical categories
    if (
      analysis.category === 'security_issue' ||
      analysis.category === 'constraint_violation'
    ) {
      return 'critical';
    }

    // Warning categories
    if (
      analysis.category === 'pattern_violation' ||
      analysis.category === 'architecture_mismatch' ||
      analysis.category === 'api_misuse'
    ) {
      return 'warning';
    }

    // Check feedback for severity indicators
    const lowerFeedback = analysis.feedback.toLowerCase();
    if (
      lowerFeedback.includes('critical') ||
      lowerFeedback.includes('dangerous') ||
      lowerFeedback.includes('never')
    ) {
      return 'critical';
    }

    if (
      lowerFeedback.includes('warning') ||
      lowerFeedback.includes('careful') ||
      lowerFeedback.includes('avoid')
    ) {
      return 'warning';
    }

    return 'info';
  }

  /**
   * Build the source information
   */
  buildSource(analysis: AnalyzedCorrection): TribalSource {
    // Determine source type based on metadata
    let type: TribalSource['type'] = 'inferred';

    if (analysis.metadata?.userId) {
      type = 'manual';
    }

    const source: TribalSource = { type };
    
    if (analysis.metadata?.sessionId) {
      source.reference = analysis.metadata.sessionId;
    }

    return source;
  }

  /**
   * Extract warnings from the analysis
   */
  private extractWarnings(analysis: AnalyzedCorrection): string[] | undefined {
    const warnings: string[] = [];

    // Look for warning phrases in feedback
    const warningPatterns = [
      /don't\s+([^.!?]+)/gi,
      /never\s+([^.!?]+)/gi,
      /avoid\s+([^.!?]+)/gi,
      /careful\s+([^.!?]+)/gi,
      /warning[:\s]+([^.!?]+)/gi,
    ];

    for (const pattern of warningPatterns) {
      const matches = analysis.feedback.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          warnings.push(match[1].trim());
        }
      }
    }

    return warnings.length > 0 ? warnings : undefined;
  }

  /**
   * Extract consequences from the analysis
   */
  private extractConsequences(analysis: AnalyzedCorrection): string[] | undefined {
    const consequences: string[] = [];

    // Look for consequence phrases
    const consequencePatterns = [
      /will\s+cause\s+([^.!?]+)/gi,
      /results?\s+in\s+([^.!?]+)/gi,
      /leads?\s+to\s+([^.!?]+)/gi,
      /because\s+([^.!?]+)/gi,
      /otherwise\s+([^.!?]+)/gi,
    ];

    for (const pattern of consequencePatterns) {
      const matches = analysis.feedback.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          consequences.push(match[1].trim());
        }
      }
    }

    return consequences.length > 0 ? consequences : undefined;
  }

  /**
   * Generate a summary for the memory
   */
  private generateSummary(analysis: AnalyzedCorrection, topic: string): string {
    const principle = analysis.principle.statement;

    // Keep summary concise
    if (principle.length <= 100) {
      return `[${topic}] ${principle}`;
    }

    return `[${topic}] ${principle.slice(0, 97)}...`;
  }

  /**
   * Map severity to importance
   */
  private mapSeverityToImportance(
    severity: TribalSeverity
  ): 'low' | 'normal' | 'high' | 'critical' {
    switch (severity) {
      case 'critical':
        return 'critical';
      case 'warning':
        return 'high';
      case 'info':
      default:
        return 'normal';
    }
  }
}
