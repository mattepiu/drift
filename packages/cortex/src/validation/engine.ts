/**
 * Validation Engine
 * 
 * Main orchestrator for memory validation.
 * Runs multiple validators and applies healing strategies.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { Memory } from '../types/index.js';
import { CitationValidator } from './citation-validator.js';
import { TemporalValidator } from './temporal-validator.js';
import { ContradictionDetector } from './contradiction-detector.js';
import { PatternAlignmentValidator } from './pattern-alignment.js';
import { HealingEngine } from './healing.js';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Total memories validated */
  total: number;
  /** Valid memories */
  valid: number;
  /** Stale memories */
  stale: number;
  /** Healed memories */
  healed: number;
  /** Memories flagged for review */
  flaggedForReview: number;
  /** Detailed results */
  details: ValidationDetail[];
  /** Duration in ms */
  duration: number;
}

/**
 * Validation detail for a single memory
 */
export interface ValidationDetail {
  /** Memory ID */
  memoryId: string;
  /** Memory type */
  memoryType: string;
  /** Validation status */
  status: 'valid' | 'stale' | 'healed' | 'flagged';
  /** Issues found */
  issues: ValidationIssue[];
  /** New confidence after healing */
  newConfidence?: number;
}

/**
 * A validation issue
 */
export interface ValidationIssue {
  /** Which dimension found the issue */
  dimension: 'citation' | 'temporal' | 'contradiction' | 'pattern';
  /** Severity of the issue */
  severity: 'minor' | 'moderate' | 'severe';
  /** Description of the issue */
  description: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Validation engine
 */
export class ValidationEngine {
  private storage: IMemoryStorage;
  private citationValidator: CitationValidator;
  private temporalValidator: TemporalValidator;
  private contradictionDetector: ContradictionDetector;
  private patternValidator: PatternAlignmentValidator;
  private healingEngine: HealingEngine;

  constructor(storage: IMemoryStorage) {
    this.storage = storage;
    this.citationValidator = new CitationValidator();
    this.temporalValidator = new TemporalValidator();
    this.contradictionDetector = new ContradictionDetector(storage);
    this.patternValidator = new PatternAlignmentValidator();
    this.healingEngine = new HealingEngine(storage);
  }

  /**
   * Validate memories
   */
  async validate(options: {
    scope: 'all' | 'stale' | 'recent';
    autoHeal: boolean;
  }): Promise<ValidationResult> {
    const startTime = Date.now();

    // Get memories to validate
    const memories = await this.getMemoriesToValidate(options.scope);

    const details: ValidationDetail[] = [];
    let valid = 0;
    let stale = 0;
    let healed = 0;
    let flagged = 0;

    for (const memory of memories) {
      const issues = await this.validateMemory(memory);

      if (issues.length === 0) {
        valid++;
        details.push({
          memoryId: memory.id,
          memoryType: memory.type,
          status: 'valid',
          issues: [],
        });
        continue;
      }

      // Determine severity
      const maxSeverity = this.getMaxSeverity(issues);

      // Try to heal if enabled
      if (options.autoHeal && maxSeverity === 'minor') {
        const healResult = await this.healingEngine.heal(memory, issues);
        if (healResult.success) {
          healed++;
          const detail: ValidationDetail = {
            memoryId: memory.id,
            memoryType: memory.type,
            status: 'healed',
            issues,
          };
          if (healResult.newConfidence !== undefined) {
            detail.newConfidence = healResult.newConfidence;
          }
          details.push(detail);
          continue;
        }
      }

      // Flag for review if severe
      if (maxSeverity === 'severe') {
        flagged++;
        await this.flagForReview(memory, issues);
        details.push({
          memoryId: memory.id,
          memoryType: memory.type,
          status: 'flagged',
          issues,
        });
        continue;
      }

      // Mark as stale
      stale++;
      await this.markStale(memory, issues);
      details.push({
        memoryId: memory.id,
        memoryType: memory.type,
        status: 'stale',
        issues,
      });
    }

    return {
      total: memories.length,
      valid,
      stale,
      healed,
      flaggedForReview: flagged,
      details,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Validate a single memory
   */
  private async validateMemory(memory: Memory): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Dimension 1: Citation staleness
    const citationIssues = await this.citationValidator.validate(memory);
    issues.push(...citationIssues);

    // Dimension 2: Temporal staleness
    const temporalIssues = this.temporalValidator.validate(memory);
    issues.push(...temporalIssues);

    // Dimension 3: Contradiction detection
    const contradictions = await this.contradictionDetector.detect(memory);
    issues.push(...contradictions);

    // Dimension 4: Pattern alignment
    const patternIssues = await this.patternValidator.validate(memory);
    issues.push(...patternIssues);

    return issues;
  }

  /**
   * Get memories to validate based on scope
   */
  private async getMemoriesToValidate(scope: string): Promise<Memory[]> {
    switch (scope) {
      case 'stale':
        return this.storage.search({ maxConfidence: 0.7, limit: 100 });
      case 'recent': {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return this.storage.search({ minDate: weekAgo.toISOString(), limit: 100 });
      }
      default:
        return this.storage.search({ limit: 500 });
    }
  }

  /**
   * Get maximum severity from issues
   */
  private getMaxSeverity(issues: ValidationIssue[]): 'minor' | 'moderate' | 'severe' {
    if (issues.some(i => i.severity === 'severe')) return 'severe';
    if (issues.some(i => i.severity === 'moderate')) return 'moderate';
    return 'minor';
  }

  /**
   * Flag a memory for review
   */
  private async flagForReview(memory: Memory, _issues: ValidationIssue[]): Promise<void> {
    await this.storage.update(memory.id, {
      confidence: Math.min(memory.confidence, 0.3),
      tags: [...(memory.tags || []), 'needs-review'],
    });
  }

  /**
   * Mark a memory as stale
   */
  private async markStale(memory: Memory, issues: ValidationIssue[]): Promise<void> {
    const decayFactor = issues.some(i => i.severity === 'moderate') ? 0.7 : 0.9;
    await this.storage.update(memory.id, {
      confidence: memory.confidence * decayFactor,
    });
  }
}
