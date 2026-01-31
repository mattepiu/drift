/**
 * Pattern Rationale Creator
 * 
 * Creates pattern rationale memories from corrections that
 * reveal why patterns exist or should be followed.
 * 
 * @module learning/factory/pattern-creator
 */

import { randomUUID } from 'crypto';
import type { PatternRationaleMemory } from '../../types/pattern-rationale.js';
import type { AnalyzedCorrection } from '../../types/learning.js';
import type { MemoryCreator } from './tribal-creator.js';

/**
 * Pattern Rationale Creator
 * 
 * Creates pattern rationale memories from corrections that
 * indicate pattern violations or architectural mismatches.
 */
export class PatternRationaleCreator implements MemoryCreator<PatternRationaleMemory> {
  /**
   * Create a pattern rationale memory from an analyzed correction
   */
  create(analysis: AnalyzedCorrection): PatternRationaleMemory {
    const patternId = this.findRelatedPattern(analysis);
    const patternName = this.inferPatternName(analysis);
    const patternCategory = this.inferPatternCategory(analysis);
    const rationale = this.buildRationale(analysis);
    const businessContext = this.extractBusinessContext(analysis);
    const technicalContext = this.extractTechnicalContext(analysis);
    const alternativesRejected = this.extractAlternatives(analysis);
    const tradeoffs = this.extractTradeoffs(analysis);

    const now = new Date().toISOString();

    const memory: PatternRationaleMemory = {
      id: randomUUID(),
      type: 'pattern_rationale',
      patternId: patternId ?? `inferred-${randomUUID().slice(0, 8)}`,
      patternName,
      patternCategory,
      rationale,
      summary: this.generateSummary(patternName, rationale),
      confidence: analysis.principle.confidence,
      importance: this.determineImportance(analysis),
      transactionTime: {
        recordedAt: now,
      },
      validTime: {
        validFrom: now,
      },
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
      tags: [...analysis.principle.keywords, patternCategory],
    };

    // Add optional properties only if they have values
    if (businessContext) {
      memory.businessContext = businessContext;
    }
    if (technicalContext) {
      memory.technicalContext = technicalContext;
    }
    if (alternativesRejected) {
      memory.alternativesRejected = alternativesRejected;
    }
    if (tradeoffs) {
      memory.tradeoffs = tradeoffs;
    }
    if (analysis.metadata?.filePath) {
      memory.linkedFiles = [analysis.metadata.filePath];
    }
    if (patternId) {
      memory.linkedPatterns = [patternId];
    } else if (analysis.metadata?.relatedPatterns) {
      memory.linkedPatterns = analysis.metadata.relatedPatterns;
    }

    return memory;
  }

  /**
   * Find related pattern ID from analysis
   */
  findRelatedPattern(analysis: AnalyzedCorrection): string | null {
    // Check metadata for related patterns
    const firstPattern = analysis.metadata?.relatedPatterns?.[0];
    if (firstPattern) {
      return firstPattern;
    }

    // No pattern ID available
    return null;
  }

  /**
   * Build the rationale from the analysis
   */
  buildRationale(analysis: AnalyzedCorrection): string {
    const parts: string[] = [];

    // Start with the principle
    parts.push(analysis.principle.statement);

    // Add explanation if different
    if (analysis.principle.explanation !== analysis.principle.statement) {
      parts.push(analysis.principle.explanation);
    }

    // Add context from feedback
    if (analysis.feedback.length > analysis.principle.statement.length) {
      const additionalContext = analysis.feedback
        .replace(analysis.principle.statement, '')
        .trim();
      if (additionalContext.length > 20) {
        parts.push(additionalContext);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Infer pattern name from analysis
   */
  private inferPatternName(analysis: AnalyzedCorrection): string {
    // Look for pattern names in feedback
    const patternKeywords = [
      'repository', 'factory', 'singleton', 'observer', 'strategy',
      'decorator', 'adapter', 'facade', 'proxy', 'middleware',
      'controller', 'service', 'model', 'view', 'presenter',
      'barrel', 'module', 'component', 'hook', 'context',
    ];

    const lowerFeedback = analysis.feedback.toLowerCase();

    for (const pattern of patternKeywords) {
      if (lowerFeedback.includes(pattern)) {
        return pattern.charAt(0).toUpperCase() + pattern.slice(1) + ' Pattern';
      }
    }

    // Generate name from category
    const categoryNames: Record<string, string> = {
      pattern_violation: 'Coding Pattern',
      architecture_mismatch: 'Architecture Pattern',
      api_misuse: 'API Usage Pattern',
      naming_convention: 'Naming Pattern',
      style_preference: 'Style Pattern',
    };

    return categoryNames[analysis.category] || 'Code Pattern';
  }

  /**
   * Infer pattern category from analysis
   */
  private inferPatternCategory(analysis: AnalyzedCorrection): string {
    // Map correction category to pattern category
    const categoryMap: Record<string, string> = {
      pattern_violation: 'structural',
      architecture_mismatch: 'structural',
      api_misuse: 'api',
      naming_convention: 'structural',
      style_preference: 'styling',
      security_issue: 'security',
      performance_issue: 'performance',
    };

    return categoryMap[analysis.category] || 'structural';
  }

  /**
   * Extract business context from analysis
   */
  private extractBusinessContext(analysis: AnalyzedCorrection): string | undefined {
    // Look for business-related phrases
    const businessPatterns = [
      /business\s+([^.!?]+)/gi,
      /requirement[s]?\s+([^.!?]+)/gi,
      /stakeholder[s]?\s+([^.!?]+)/gi,
      /user[s]?\s+need[s]?\s+([^.!?]+)/gi,
    ];

    for (const pattern of businessPatterns) {
      const match = analysis.feedback.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return undefined;
  }

  /**
   * Extract technical context from analysis
   */
  private extractTechnicalContext(analysis: AnalyzedCorrection): string | undefined {
    // Look for technical explanations
    const technicalPatterns = [
      /because\s+([^.!?]+)/gi,
      /since\s+([^.!?]+)/gi,
      /due\s+to\s+([^.!?]+)/gi,
      /technically\s+([^.!?]+)/gi,
    ];

    for (const pattern of technicalPatterns) {
      const match = analysis.feedback.match(pattern);
      if (match) {
        return match[0];
      }
    }

    // Use diff summary if available
    if (analysis.diff?.summary) {
      return `Changes: ${analysis.diff.summary}`;
    }

    return undefined;
  }

  /**
   * Extract rejected alternatives from analysis
   */
  private extractAlternatives(analysis: AnalyzedCorrection): string[] | undefined {
    const alternatives: string[] = [];

    // Look for "instead of" patterns
    const alternativePatterns = [
      /instead\s+of\s+([^.!?,]+)/gi,
      /rather\s+than\s+([^.!?,]+)/gi,
      /not\s+([^.!?,]+)/gi,
    ];

    for (const pattern of alternativePatterns) {
      const matches = analysis.feedback.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 5) {
          alternatives.push(match[1].trim());
        }
      }
    }

    // Add original code as rejected alternative if we have corrected code
    if (analysis.correctedCode && analysis.original) {
      alternatives.push(`Original approach: ${analysis.original.slice(0, 100)}...`);
    }

    return alternatives.length > 0 ? alternatives : undefined;
  }

  /**
   * Extract tradeoffs from analysis
   */
  private extractTradeoffs(analysis: AnalyzedCorrection): string[] | undefined {
    const tradeoffs: string[] = [];

    // Look for tradeoff indicators
    const tradeoffPatterns = [
      /tradeoff[s]?\s*[:\s]+([^.!?]+)/gi,
      /downside[s]?\s*[:\s]+([^.!?]+)/gi,
      /however\s+([^.!?]+)/gi,
      /but\s+([^.!?]+)/gi,
    ];

    for (const pattern of tradeoffPatterns) {
      const matches = analysis.feedback.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 10) {
          tradeoffs.push(match[1].trim());
        }
      }
    }

    return tradeoffs.length > 0 ? tradeoffs : undefined;
  }

  /**
   * Generate a summary for the memory
   */
  private generateSummary(patternName: string, rationale: string): string {
    const shortRationale = rationale.split('\n')[0] ?? rationale;

    if (shortRationale.length <= 80) {
      return `[${patternName}] ${shortRationale}`;
    }

    return `[${patternName}] ${shortRationale.slice(0, 77)}...`;
  }

  /**
   * Determine importance based on analysis
   */
  private determineImportance(
    analysis: AnalyzedCorrection
  ): 'low' | 'normal' | 'high' | 'critical' {
    // Architecture and security patterns are high importance
    if (
      analysis.category === 'architecture_mismatch' ||
      analysis.category === 'security_issue'
    ) {
      return 'high';
    }

    // Hard rules are high importance
    if (analysis.principle.isHardRule) {
      return 'high';
    }

    // High confidence principles are normal importance
    if (analysis.principle.confidence > 0.7) {
      return 'normal';
    }

    return 'low';
  }
}
