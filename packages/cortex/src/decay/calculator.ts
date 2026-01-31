/**
 * Decay Calculator
 * 
 * Multi-factor confidence decay calculation.
 */

import type { Memory } from '../types/index.js';
import { HALF_LIVES } from './half-lives.js';
import { calculateUsageBoost, calculateImportanceAnchor, calculatePatternBoost } from './boosters.js';

/**
 * Decay factors breakdown
 */
export interface DecayFactors {
  /** Temporal decay factor */
  temporalDecay: number;
  /** Citation validity decay factor */
  citationDecay: number;
  /** Usage boost factor */
  usageBoost: number;
  /** Importance anchor factor */
  importanceAnchor: number;
  /** Pattern alignment boost factor */
  patternBoost: number;
  /** Final calculated confidence */
  finalConfidence: number;
}

/**
 * Decay calculator
 */
export class DecayCalculator {
  /**
   * Calculate decay factors for a memory
   */
  calculate(memory: Memory): DecayFactors {
    // Base temporal decay (exponential)
    const daysSinceAccess = this.daysSince(memory.lastAccessed || memory.createdAt);
    const halfLife = HALF_LIVES[memory.type] || 90;
    const temporalDecay = halfLife === Infinity ? 1.0 : Math.exp(-daysSinceAccess / halfLife);

    // Citation validity decay
    const citationDecay = this.calculateCitationDecay(memory);

    // Usage boost (frequently used memories resist decay)
    const usageBoost = calculateUsageBoost(memory.accessCount);

    // Importance anchor (critical memories decay slower)
    const importanceAnchor = calculateImportanceAnchor(memory.importance);

    // Pattern alignment boost
    const patternBoost = calculatePatternBoost(memory.linkedPatterns || []);

    // Final confidence
    const finalConfidence = Math.min(
      1.0,
      memory.confidence *
        temporalDecay *
        citationDecay *
        usageBoost *
        importanceAnchor *
        patternBoost
    );

    return {
      temporalDecay,
      citationDecay,
      usageBoost,
      importanceAnchor,
      patternBoost,
      finalConfidence,
    };
  }

  /**
   * Calculate citation decay factor
   */
  private calculateCitationDecay(memory: Memory): number {
    if (!('citations' in memory) || !Array.isArray(memory.citations)) {
      return 1.0;
    }

    const citations = memory.citations;
    if (citations.length === 0) return 1.0;

    const validCount = citations.filter(c => c.valid !== false).length;
    return validCount / citations.length;
  }

  /**
   * Calculate days since a date
   */
  private daysSince(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  }
}
