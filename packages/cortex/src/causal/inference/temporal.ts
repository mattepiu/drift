/**
 * Temporal Proximity Inference Strategy
 * 
 * Infers causal relationships based on temporal proximity.
 * Memories created close together in time are more likely
 * to be causally related.
 * 
 * @module causal/inference/temporal
 */

import type { Memory } from '../../types/memory.js';
import type { CausalEvidence } from '../../types/causal.js';
import type { IInferenceStrategy, InferredEdge } from './engine.js';

/**
 * Temporal inference configuration
 */
export interface TemporalInferenceConfig {
  /** Maximum time difference in milliseconds */
  maxTimeDifferenceMs: number;
  /** Time window for high confidence (ms) */
  highConfidenceWindowMs: number;
  /** Base confidence for temporal proximity */
  baseConfidence: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TemporalInferenceConfig = {
  maxTimeDifferenceMs: 24 * 60 * 60 * 1000, // 24 hours
  highConfidenceWindowMs: 60 * 60 * 1000, // 1 hour
  baseConfidence: 0.4,
};

/**
 * Temporal proximity inference strategy
 * 
 * Infers that memories created close together in time
 * may have a causal relationship.
 */
export class TemporalInferenceStrategy implements IInferenceStrategy {
  readonly name = 'temporal_proximity' as const;
  private config: TemporalInferenceConfig;

  constructor(config?: Partial<TemporalInferenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Infer causal edges based on temporal proximity
   */
  async infer(memory: Memory, candidates: Memory[]): Promise<InferredEdge[]> {
    const edges: InferredEdge[] = [];
    const memoryTime = new Date(memory.createdAt).getTime();

    for (const candidate of candidates) {
      const candidateTime = new Date(candidate.createdAt).getTime();
      const timeDiff = Math.abs(memoryTime - candidateTime);

      // Skip if too far apart
      if (timeDiff > this.config.maxTimeDifferenceMs) {
        continue;
      }

      // Calculate confidence based on time proximity
      const confidence = this.calculateConfidence(timeDiff);

      if (confidence < 0.2) {
        continue;
      }

      // Determine relation based on temporal order and types
      const relation = this.determineRelation(memory, candidate, candidateTime < memoryTime);

      edges.push({
        sourceId: candidate.id,
        targetId: memory.id,
        relation,
        confidence,
        evidence: this.createEvidence(timeDiff, confidence),
      });
    }

    return edges;
  }

  /**
   * Calculate confidence based on time difference
   */
  private calculateConfidence(timeDiffMs: number): number {
    // Exponential decay based on time difference
    const decayFactor = Math.exp(-timeDiffMs / this.config.highConfidenceWindowMs);
    return this.config.baseConfidence * decayFactor;
  }

  /**
   * Determine the causal relation type
   */
  private determineRelation(
    memory: Memory,
    candidate: Memory,
    candidateIsBefore: boolean
  ): InferredEdge['relation'] {
    // If same type, likely derived_from or supports
    if (memory.type === candidate.type) {
      return candidateIsBefore ? 'derived_from' : 'supports';
    }

    // Episodic memories often trigger other memories
    if (candidate.type === 'episodic') {
      return 'triggered_by';
    }

    // Pattern rationale often enables other decisions
    if (candidate.type === 'pattern_rationale') {
      return 'enabled';
    }

    // Default to general causation
    return candidateIsBefore ? 'caused' : 'supports';
  }

  /**
   * Create evidence for the inference
   */
  private createEvidence(timeDiffMs: number, confidence: number): CausalEvidence {
    const timeDiffHours = Math.round(timeDiffMs / (60 * 60 * 1000) * 10) / 10;
    const timeDiffMinutes = Math.round(timeDiffMs / (60 * 1000));

    const timeDescription = timeDiffHours >= 1
      ? `${timeDiffHours} hours`
      : `${timeDiffMinutes} minutes`;

    return {
      type: 'temporal',
      description: `Created within ${timeDescription} of each other`,
      confidence,
      gatheredAt: new Date().toISOString(),
    };
  }
}
