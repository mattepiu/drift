/**
 * Generation Feedback Loop
 * 
 * Processes feedback on generated code to improve
 * future generations. Coordinates outcome processing
 * and learning.
 * 
 * @module generation/feedback/loop
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { OutcomeProcessor } from './outcome-processor.js';
import type { GeneratedCode, GenerationOutcome, GenerationFeedback } from '../types.js';

/**
 * Feedback statistics
 */
export interface FeedbackStats {
  /** Total feedback received */
  total: number;
  /** Accepted count */
  accepted: number;
  /** Modified count */
  modified: number;
  /** Rejected count */
  rejected: number;
  /** Acceptance rate */
  acceptanceRate: number;
  /** Average confidence adjustment */
  avgConfidenceAdjustment: number;
}

/**
 * Generation Feedback Loop
 * 
 * Processes feedback on generated code.
 */
export class GenerationFeedbackLoop {
  private outcomeProcessor: OutcomeProcessor;
  private stats: FeedbackStats;

  constructor(_storage: IMemoryStorage, outcomeProcessor: OutcomeProcessor) {
    this.outcomeProcessor = outcomeProcessor;
    this.stats = {
      total: 0,
      accepted: 0,
      modified: 0,
      rejected: 0,
      acceptanceRate: 0,
      avgConfidenceAdjustment: 0,
    };
  }

  /**
   * Track outcome of a generation
   */
  async trackOutcome(
    generation: GeneratedCode,
    outcome: GenerationOutcome,
    feedback?: string
  ): Promise<void> {
    // Process the outcome
    await this.outcomeProcessor.process(generation, outcome, feedback);

    // Update statistics
    this.updateStats(outcome);

    // Store feedback record - only include feedback if provided
    const feedbackRecord: GenerationFeedback = {
      requestId: generation.provenance.requestId,
      outcome,
      providedAt: new Date().toISOString(),
    };
    if (feedback) {
      feedbackRecord.feedback = feedback;
    }
    await this.storeFeedback(feedbackRecord);
  }

  /**
   * Process feedback directly
   */
  async processFeedback(feedback: GenerationFeedback): Promise<void> {
    // Update statistics
    this.updateStats(feedback.outcome);

    // Store feedback record
    await this.storeFeedback(feedback);
  }

  /**
   * Update statistics
   */
  private updateStats(outcome: GenerationOutcome): void {
    this.stats.total++;

    switch (outcome) {
      case 'accepted':
        this.stats.accepted++;
        break;
      case 'modified':
        this.stats.modified++;
        break;
      case 'rejected':
        this.stats.rejected++;
        break;
    }

    // Calculate acceptance rate
    this.stats.acceptanceRate = this.stats.total > 0
      ? this.stats.accepted / this.stats.total
      : 0;

    // Calculate average confidence adjustment
    const adjustment = this.outcomeProcessor.getAdjustment(outcome);
    this.stats.avgConfidenceAdjustment = (
      (this.stats.avgConfidenceAdjustment * (this.stats.total - 1) + adjustment) /
      this.stats.total
    );
  }

  /**
   * Store feedback record
   */
  private async storeFeedback(_feedback: GenerationFeedback): Promise<void> {
    // For now, we just track in memory
    // In a full implementation, this would store to a feedback table
  }

  /**
   * Get feedback statistics
   */
  getStats(): FeedbackStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      total: 0,
      accepted: 0,
      modified: 0,
      rejected: 0,
      acceptanceRate: 0,
      avgConfidenceAdjustment: 0,
    };
  }

  /**
   * Get acceptance rate
   */
  getAcceptanceRate(): number {
    return this.stats.acceptanceRate;
  }

  /**
   * Check if feedback loop is healthy
   */
  isHealthy(): boolean {
    // Consider healthy if acceptance rate is above 50%
    // or if we don't have enough data yet
    return this.stats.total < 10 || this.stats.acceptanceRate >= 0.5;
  }
}
