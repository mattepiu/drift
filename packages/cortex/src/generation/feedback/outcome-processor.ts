/**
 * Outcome Processor
 * 
 * Processes generation outcomes to update memory
 * confidence and learn from feedback.
 * 
 * @module generation/feedback/outcome-processor
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { GeneratedCode, GenerationOutcome, CodeProvenance } from '../types.js';

/**
 * Confidence adjustment values
 */
const CONFIDENCE_ADJUSTMENTS = {
  accepted: 0.05,
  modified: -0.02,
  rejected: -0.1,
} as const;

/**
 * Outcome Processor
 * 
 * Processes generation outcomes to update memory confidence.
 */
export class OutcomeProcessor {
  private storage: IMemoryStorage;

  constructor(storage: IMemoryStorage) {
    this.storage = storage;
  }

  /**
   * Process a generation outcome
   */
  async process(
    generation: GeneratedCode,
    outcome: GenerationOutcome,
    feedback?: string
  ): Promise<void> {
    switch (outcome) {
      case 'accepted':
        await this.processAccepted(generation);
        break;
      case 'modified':
        await this.processModified(generation, feedback);
        break;
      case 'rejected':
        await this.processRejected(generation, feedback ?? 'No feedback provided');
        break;
    }
  }

  /**
   * Process accepted generation
   */
  async processAccepted(generation: GeneratedCode): Promise<void> {
    const provenance = generation.provenance;

    // Boost confidence for all influences
    for (const influence of provenance.influences) {
      await this.adjustConfidence(influence.memoryId, CONFIDENCE_ADJUSTMENTS.accepted);
    }

    // Record successful usage
    await this.recordUsage(provenance, 'accepted');
  }

  /**
   * Process modified generation
   */
  async processModified(generation: GeneratedCode, feedback?: string): Promise<void> {
    const provenance = generation.provenance;

    // Slightly reduce confidence for influences
    for (const influence of provenance.influences) {
      await this.adjustConfidence(influence.memoryId, CONFIDENCE_ADJUSTMENTS.modified);
    }

    // Record modified usage
    await this.recordUsage(provenance, 'modified', feedback);
  }

  /**
   * Process rejected generation
   */
  async processRejected(generation: GeneratedCode, feedback: string): Promise<void> {
    const provenance = generation.provenance;

    // Reduce confidence for all influences
    for (const influence of provenance.influences) {
      await this.adjustConfidence(influence.memoryId, CONFIDENCE_ADJUSTMENTS.rejected);
    }

    // Record rejected usage
    await this.recordUsage(provenance, 'rejected', feedback);
  }

  /**
   * Adjust confidence for a memory
   */
  private async adjustConfidence(memoryId: string, adjustment: number): Promise<void> {
    try {
      const memory = await this.storage.read(memoryId);
      if (!memory) return;

      // Calculate new confidence
      const newConfidence = Math.max(0, Math.min(1, memory.confidence + adjustment));

      // Update memory
      await this.storage.update(memoryId, {
        confidence: newConfidence,
        lastAccessed: new Date().toISOString(),
        accessCount: memory.accessCount + 1,
      });
    } catch {
      // Ignore errors - memory may not exist
    }
  }

  /**
   * Record usage of provenance
   */
  private async recordUsage(
    provenance: CodeProvenance,
    _outcome: GenerationOutcome,
    _feedback?: string
  ): Promise<void> {
    // Update access counts for all influenced memories
    for (const influence of provenance.influences) {
      try {
        const memory = await this.storage.read(influence.memoryId);
        if (memory) {
          await this.storage.update(influence.memoryId, {
            lastAccessed: new Date().toISOString(),
            accessCount: memory.accessCount + 1,
          });
        }
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Get confidence adjustment for an outcome
   */
  getAdjustment(outcome: GenerationOutcome): number {
    return CONFIDENCE_ADJUSTMENTS[outcome];
  }
}
