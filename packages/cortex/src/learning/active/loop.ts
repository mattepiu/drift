/**
 * Active Learning Loop
 * 
 * Orchestrates the active learning cycle:
 * - Identifies memories needing validation
 * - Generates validation prompts
 * - Processes user feedback
 * - Updates memory confidence
 * 
 * @module learning/active/loop
 */

import type { Memory } from '../../types/memory.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type {
  ValidationPrompt,
  ValidationFeedback,
  ValidationCandidate,
  LearningOutcome,
} from '../../types/learning.js';
import { ValidationCandidateSelector } from './candidate-selector.js';
import { ValidationPromptGenerator } from './prompt-generator.js';
import { ConfidenceCalibrator } from '../confidence/calibrator.js';
import { MetricsCalculator } from '../confidence/metrics.js';

/**
 * Active learning configuration
 */
export interface ActiveLearningConfig {
  /** Maximum candidates to consider per cycle */
  maxCandidatesPerCycle: number;
  /** Minimum time between validations for same memory (hours) */
  minValidationIntervalHours: number;
  /** Enable automatic candidate selection */
  autoSelectCandidates: boolean;
  /** Confidence boost on confirmation */
  confirmationBoost: number;
  /** Confidence reduction on rejection */
  rejectionPenalty: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ActiveLearningConfig = {
  maxCandidatesPerCycle: 10,
  minValidationIntervalHours: 24,
  autoSelectCandidates: true,
  confirmationBoost: 0.2,
  rejectionPenalty: 0.5,
};

/**
 * Active Learning Loop
 * 
 * Manages the continuous improvement of memory quality through
 * user validation and feedback.
 */
export class ActiveLearningLoop {
  private config: ActiveLearningConfig;
  private candidateSelector: ValidationCandidateSelector;
  private promptGenerator: ValidationPromptGenerator;
  private _calibrator: ConfidenceCalibrator;
  private _metricsCalculator: MetricsCalculator;

  /** Queue of pending validations */
  private validationQueue: ValidationCandidate[] = [];

  /** Recently validated memory IDs with timestamps */
  private recentlyValidated: Map<string, Date> = new Map();

  constructor(
    private storage: IMemoryStorage,
    candidateSelector?: ValidationCandidateSelector,
    promptGenerator?: ValidationPromptGenerator,
    calibrator?: ConfidenceCalibrator,
    config: Partial<ActiveLearningConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.candidateSelector = candidateSelector || new ValidationCandidateSelector(storage);
    this.promptGenerator = promptGenerator || new ValidationPromptGenerator();
    this._calibrator = calibrator || new ConfidenceCalibrator();
    this._metricsCalculator = new MetricsCalculator(storage);
  }

  /**
   * Get the calibrator instance
   */
  get calibrator(): ConfidenceCalibrator {
    return this._calibrator;
  }

  /**
   * Get the metrics calculator instance
   */
  get metricsCalculator(): MetricsCalculator {
    return this._metricsCalculator;
  }

  /**
   * Process user feedback for a memory
   */
  async processFeedback(
    memoryId: string,
    feedback: 'confirm' | 'reject' | 'modify',
    modification?: string
  ): Promise<LearningOutcome> {
    const memory = await this.storage.read(memoryId);
    if (!memory) {
      return {
        correctionId: memoryId,
        memoriesUpdated: [],
        principlesExtracted: 0,
        success: false,
        error: `Memory not found: ${memoryId}`,
        completedAt: new Date().toISOString(),
      };
    }

    const memoriesUpdated: string[] = [];
    let memoryCreated: string | undefined;

    try {
      switch (feedback) {
        case 'confirm':
          await this.handleConfirmation(memory);
          memoriesUpdated.push(memoryId);
          break;

        case 'reject':
          await this.handleRejection(memory);
          memoriesUpdated.push(memoryId);
          break;

        case 'modify':
          if (modification) {
            memoryCreated = await this.handleModification(memory, modification);
            memoriesUpdated.push(memoryId);
            if (memoryCreated) {
              memoriesUpdated.push(memoryCreated);
            }
          }
          break;
      }

      // Record validation
      this.recentlyValidated.set(memoryId, new Date());

      // Store validation feedback
      const feedbackToStore: ValidationFeedback = {
        memoryId,
        action: feedback,
        providedAt: new Date().toISOString(),
      };
      if (modification) {
        feedbackToStore.modification = modification;
      }
      await this.storeValidationFeedback(feedbackToStore);

      const outcome: LearningOutcome = {
        correctionId: memoryId,
        memoriesUpdated,
        principlesExtracted: feedback === 'modify' ? 1 : 0,
        success: true,
        completedAt: new Date().toISOString(),
      };
      if (memoryCreated) {
        outcome.memoryCreated = memoryCreated;
      }
      return outcome;
    } catch (error) {
      return {
        correctionId: memoryId,
        memoriesUpdated,
        principlesExtracted: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Identify memories needing validation
   */
  async identifyValidationCandidates(): Promise<Memory[]> {
    const candidates = await this.candidateSelector.selectCandidates({
      limit: this.config.maxCandidatesPerCycle,
    });

    // Filter out recently validated
    const filtered = candidates.filter(c => !this.wasRecentlyValidated(c.memoryId));

    // Update queue
    this.validationQueue = filtered;

    // Return memories
    const memories: Memory[] = [];
    for (const candidate of filtered) {
      const memory = await this.storage.read(candidate.memoryId);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories;
  }

  /**
   * Get the next validation prompt
   */
  async getNextValidationPrompt(): Promise<ValidationPrompt | null> {
    // Refresh queue if empty
    if (this.validationQueue.length === 0) {
      await this.identifyValidationCandidates();
    }

    // Get next candidate
    const candidate = this.validationQueue.shift();
    if (!candidate) {
      return null;
    }

    // Get memory
    const memory = await this.storage.read(candidate.memoryId);
    if (!memory) {
      // Try next candidate
      return this.getNextValidationPrompt();
    }

    // Generate prompt
    return this.promptGenerator.generate(memory, candidate.currentConfidence);
  }

  /**
   * Get multiple validation prompts
   */
  async getValidationPrompts(count: number): Promise<ValidationPrompt[]> {
    const prompts: ValidationPrompt[] = [];

    for (let i = 0; i < count; i++) {
      const prompt = await this.getNextValidationPrompt();
      if (!prompt) break;
      prompts.push(prompt);
    }

    return prompts;
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): {
    queueLength: number;
    recentlyValidatedCount: number;
  } {
    return {
      queueLength: this.validationQueue.length,
      recentlyValidatedCount: this.recentlyValidated.size,
    };
  }

  /**
   * Clear the validation queue
   */
  clearQueue(): void {
    this.validationQueue = [];
  }

  /**
   * Handle confirmation feedback
   */
  private async handleConfirmation(memory: Memory): Promise<void> {
    const newConfidence = Math.min(
      1.0,
      memory.confidence + this.config.confirmationBoost
    );

    await this.storage.update(memory.id, {
      confidence: newConfidence,
      lastValidated: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Handle rejection feedback
   */
  private async handleRejection(memory: Memory): Promise<void> {
    const newConfidence = memory.confidence * (1 - this.config.rejectionPenalty);

    // Archive if confidence is too low
    if (newConfidence < 0.1) {
      await this.storage.update(memory.id, {
        confidence: newConfidence,
        archived: true,
        archiveReason: 'user_rejected',
        lastValidated: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      await this.storage.update(memory.id, {
        confidence: newConfidence,
        lastValidated: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle modification feedback
   */
  private async handleModification(
    memory: Memory,
    modification: string
  ): Promise<string | undefined> {
    // Update the original memory's summary with modification
    await this.storage.update(memory.id, {
      summary: modification,
      confidence: Math.min(1.0, memory.confidence + 0.1),
      lastValidated: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return undefined;
  }

  /**
   * Check if memory was recently validated
   */
  private wasRecentlyValidated(memoryId: string): boolean {
    const lastValidated = this.recentlyValidated.get(memoryId);
    if (!lastValidated) return false;

    const hoursSince =
      (Date.now() - lastValidated.getTime()) / (1000 * 60 * 60);
    return hoursSince < this.config.minValidationIntervalHours;
  }

  /**
   * Store validation feedback in history
   */
  private async storeValidationFeedback(
    _feedback: ValidationFeedback
  ): Promise<void> {
    // This would store to validation_history table
    // For now, we just update the memory's lastValidated
    // The actual storage is handled in the handle* methods
  }

  /**
   * Run a full validation cycle
   */
  async runValidationCycle(): Promise<{
    candidatesFound: number;
    promptsGenerated: number;
  }> {
    const candidates = await this.identifyValidationCandidates();

    return {
      candidatesFound: candidates.length,
      promptsGenerated: this.validationQueue.length,
    };
  }

  /**
   * Create loop with default dependencies
   */
  static create(
    storage: IMemoryStorage,
    config?: Partial<ActiveLearningConfig>
  ): ActiveLearningLoop {
    return new ActiveLearningLoop(storage, undefined, undefined, undefined, config);
  }
}
