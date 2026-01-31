/**
 * Validation Candidate Selector
 * 
 * Selects memories that need user validation based on
 * confidence, importance, age, and usage patterns.
 * 
 * @module learning/active/candidate-selector
 */

import type { Memory, Importance } from '../../types/memory.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { ValidationCandidate, ValidationReason } from '../../types/learning.js';
import { MetricsCalculator } from '../confidence/metrics.js';
import { ConfidenceCalibrator } from '../confidence/calibrator.js';

/**
 * Selection options
 */
export interface SelectionOptions {
  /** Maximum candidates to return */
  limit?: number;
  /** Minimum confidence to consider */
  minConfidence?: number;
  /** Maximum confidence to consider */
  maxConfidence?: number;
  /** Filter by importance levels */
  importanceLevels?: Importance[];
  /** Filter by memory types */
  memoryTypes?: string[];
  /** Minimum age in days */
  minAgeDays?: number;
  /** Maximum age in days */
  maxAgeDays?: number;
  /** Include only unvalidated memories */
  unvalidatedOnly?: boolean;
}

/**
 * Default selection options
 */
const DEFAULT_OPTIONS: SelectionOptions = {
  limit: 10,
  minConfidence: 0,
  maxConfidence: 0.7,
  unvalidatedOnly: false,
};

/**
 * Validation Candidate Selector
 * 
 * Identifies memories that would benefit from user validation.
 */
export class ValidationCandidateSelector {
  private metricsCalculator: MetricsCalculator;
  private calibrator: ConfidenceCalibrator;

  constructor(private storage: IMemoryStorage) {
    this.metricsCalculator = new MetricsCalculator(storage);
    this.calibrator = new ConfidenceCalibrator();
  }

  /**
   * Select validation candidates
   */
  async selectCandidates(
    options: SelectionOptions = {}
  ): Promise<ValidationCandidate[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Build query, only including defined properties
    const query: {
      types?: string[];
      importance?: Importance[];
      minConfidence?: number;
      maxConfidence?: number;
      includeArchived: boolean;
      limit: number;
    } = {
      includeArchived: false,
      limit: 1000,
    };
    
    if (opts.memoryTypes) {
      query.types = opts.memoryTypes;
    }
    if (opts.importanceLevels) {
      query.importance = opts.importanceLevels;
    }
    if (opts.minConfidence !== undefined) {
      query.minConfidence = opts.minConfidence;
    }
    if (opts.maxConfidence !== undefined) {
      query.maxConfidence = opts.maxConfidence;
    }

    // Get all non-archived memories
    const memories = await this.storage.search(query as any);

    // Filter by criteria
    let filtered = memories;

    // Filter by age
    if (opts.minAgeDays !== undefined || opts.maxAgeDays !== undefined) {
      filtered = this.filterByAge(filtered, opts.minAgeDays, opts.maxAgeDays);
    }

    // Filter by validation status
    if (opts.unvalidatedOnly) {
      filtered = filtered.filter(m => !m.lastValidated);
    }

    // Filter by confidence range
    filtered = this.filterByConfidenceRange(filtered, opts);

    // Filter by importance
    filtered = this.filterByImportance(filtered, opts);

    // Score and prioritize candidates
    const candidates = await this.scoreCandidates(filtered);

    // Sort by priority and return top candidates
    candidates.sort((a, b) => b.priority - a.priority);

    return candidates.slice(0, opts.limit);
  }

  /**
   * Filter memories by confidence range
   */
  filterByConfidenceRange(
    memories: Memory[],
    options: SelectionOptions
  ): Memory[] {
    return memories.filter(m => {
      if (options.minConfidence !== undefined && m.confidence < options.minConfidence) {
        return false;
      }
      if (options.maxConfidence !== undefined && m.confidence > options.maxConfidence) {
        return false;
      }
      return true;
    });
  }

  /**
   * Filter memories by importance
   */
  filterByImportance(
    memories: Memory[],
    options: SelectionOptions
  ): Memory[] {
    if (!options.importanceLevels || options.importanceLevels.length === 0) {
      return memories;
    }

    return memories.filter(m =>
      options.importanceLevels!.includes(m.importance)
    );
  }

  /**
   * Filter memories by age
   */
  filterByAge(
    memories: Memory[],
    minDays?: number,
    maxDays?: number
  ): Memory[] {
    const now = new Date();

    return memories.filter(m => {
      const created = new Date(m.createdAt);
      const ageInDays = Math.floor(
        (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (minDays !== undefined && ageInDays < minDays) {
        return false;
      }
      if (maxDays !== undefined && ageInDays > maxDays) {
        return false;
      }
      return true;
    });
  }

  /**
   * Prioritize candidates by various factors
   */
  prioritize(candidates: ValidationCandidate[]): ValidationCandidate[] {
    // Already sorted by priority in selectCandidates
    return candidates;
  }

  /**
   * Score candidates and create ValidationCandidate objects
   */
  private async scoreCandidates(
    memories: Memory[]
  ): Promise<ValidationCandidate[]> {
    const candidates: ValidationCandidate[] = [];

    for (const memory of memories) {
      try {
        const metrics = await this.metricsCalculator.getMetrics(memory.id);
        const calculated = this.calibrator.calculate(memory, metrics);

        if (calculated.needsValidation) {
          const priority = this.calculatePriority(memory, calculated.confidence);
          const reason = calculated.validationReason || 'low_confidence';

          candidates.push({
            memoryId: memory.id,
            memoryType: memory.type,
            summary: memory.summary,
            currentConfidence: calculated.confidence,
            reason: reason as ValidationReason,
            priority,
            suggestedPrompt: this.generateSuggestedPrompt(memory, reason),
          });
        }
      } catch {
        // Skip memories that can't be processed
      }
    }

    return candidates;
  }

  /**
   * Calculate priority score for a candidate
   */
  private calculatePriority(memory: Memory, confidence: number): number {
    let priority = 0;

    // Lower confidence = higher priority
    priority += (1 - confidence) * 0.4;

    // Higher importance = higher priority
    const importanceScores: Record<Importance, number> = {
      critical: 1.0,
      high: 0.75,
      normal: 0.5,
      low: 0.25,
    };
    priority += importanceScores[memory.importance] * 0.3;

    // More access = higher priority (more impactful)
    const accessScore = Math.min(memory.accessCount / 100, 1);
    priority += accessScore * 0.2;

    // Never validated = higher priority
    if (!memory.lastValidated) {
      priority += 0.1;
    }

    return Math.min(priority, 1.0);
  }

  /**
   * Generate a suggested prompt for validation
   */
  private generateSuggestedPrompt(memory: Memory, reason: string): string {
    const reasonMessages: Record<string, string> = {
      low_confidence: 'This memory has low confidence.',
      conflicting_evidence: 'There is conflicting evidence about this memory.',
      stale: 'This memory is old and may be outdated.',
      never_validated: 'This memory has never been validated.',
      high_importance_low_confidence: 'This is an important memory with low confidence.',
      frequent_rejection: 'This memory has been frequently rejected.',
    };

    const reasonMessage = reasonMessages[reason] || 'This memory needs validation.';

    return `${reasonMessage} Is this still accurate?\n\n"${memory.summary}"`;
  }

  /**
   * Get candidates by specific reason
   */
  async getCandidatesByReason(
    reason: ValidationReason,
    limit: number = 10
  ): Promise<ValidationCandidate[]> {
    const allCandidates = await this.selectCandidates({ limit: 100 });
    return allCandidates
      .filter(c => c.reason === reason)
      .slice(0, limit);
  }

  /**
   * Get high-priority candidates only
   */
  async getHighPriorityCandidates(limit: number = 5): Promise<ValidationCandidate[]> {
    const candidates = await this.selectCandidates({
      limit: 50,
      importanceLevels: ['critical', 'high'],
    });

    return candidates
      .filter(c => c.priority > 0.7)
      .slice(0, limit);
  }
}
