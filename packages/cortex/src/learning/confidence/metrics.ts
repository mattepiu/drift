/**
 * Metrics Calculator
 * 
 * Gathers confidence metrics from storage for a memory.
 * 
 * @module learning/confidence/metrics
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { ConfidenceMetrics } from '../../types/learning.js';

/**
 * Usage statistics for a memory
 */
export interface UsageStats {
  /** Total times used */
  totalUses: number;
  /** Times accepted */
  acceptedUses: number;
  /** Times rejected */
  rejectedUses: number;
  /** Times modified */
  modifiedUses: number;
  /** Last used timestamp */
  lastUsed?: string;
}

/**
 * Evidence counts for a memory
 */
export interface EvidenceCounts {
  /** Supporting evidence count */
  supporting: number;
  /** Contradicting evidence count */
  contradicting: number;
  /** Neutral evidence count */
  neutral: number;
}

/**
 * Metrics Calculator
 * 
 * Calculates confidence metrics by querying storage.
 */
export class MetricsCalculator {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Get all confidence metrics for a memory
   */
  async getMetrics(memoryId: string): Promise<ConfidenceMetrics> {
    const memory = await this.storage.read(memoryId);
    if (!memory) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const [evidenceCounts, usageStats] = await Promise.all([
      this.getEvidenceCounts(memoryId),
      this.getUsageStats(memoryId),
    ]);

    const ageInDays = this.calculateAge(memory.createdAt);
    const userFeedback = await this.getUserFeedback(memoryId);

    const metrics: ConfidenceMetrics = {
      baseConfidence: memory.confidence,
      supportingEvidenceCount: evidenceCounts.supporting,
      contradictingEvidenceCount: evidenceCounts.contradicting,
      successfulUses: usageStats.acceptedUses,
      rejectedUses: usageStats.rejectedUses,
      ageInDays,
      userConfirmations: userFeedback.confirmations,
      userRejections: userFeedback.rejections,
    };
    
    if (memory.lastValidated) {
      metrics.lastValidated = memory.lastValidated;
    }

    return metrics;
  }

  /**
   * Count supporting and contradicting evidence
   */
  async countSupportingEvidence(memoryId: string): Promise<number> {
    const counts = await this.getEvidenceCounts(memoryId);
    return counts.supporting;
  }

  /**
   * Count contradicting evidence
   */
  async countContradictingEvidence(memoryId: string): Promise<number> {
    const counts = await this.getEvidenceCounts(memoryId);
    return counts.contradicting;
  }

  /**
   * Get usage statistics for a memory
   */
  async getUsageStats(memoryId: string): Promise<UsageStats> {
    // Query usage_history table if available
    // For now, use access count as a proxy
    const memory = await this.storage.read(memoryId);
    if (!memory) {
      return {
        totalUses: 0,
        acceptedUses: 0,
        rejectedUses: 0,
        modifiedUses: 0,
      };
    }

    // Estimate usage from access count and confidence
    // Higher confidence memories are more likely to have been accepted
    const totalUses = memory.accessCount;
    const acceptanceRate = memory.confidence;

    const stats: UsageStats = {
      totalUses,
      acceptedUses: Math.round(totalUses * acceptanceRate),
      rejectedUses: Math.round(totalUses * (1 - acceptanceRate) * 0.5),
      modifiedUses: Math.round(totalUses * (1 - acceptanceRate) * 0.5),
    };
    
    if (memory.lastAccessed) {
      stats.lastUsed = memory.lastAccessed;
    }

    return stats;
  }

  /**
   * Get evidence counts for a memory
   */
  private async getEvidenceCounts(memoryId: string): Promise<EvidenceCounts> {
    // Get related memories to count evidence
    const related = await this.storage.getRelated(memoryId);

    let supporting = 0;
    let contradicting = 0;
    let neutral = 0;

    for (const rel of related) {
      // Check relationship type from supersedes field
      if (rel.supersedes === memoryId) {
        contradicting++;
      } else if (rel.supersededBy === memoryId) {
        supporting++;
      } else {
        // Check confidence alignment
        const memory = await this.storage.read(memoryId);
        if (memory) {
          if (Math.abs(rel.confidence - memory.confidence) < 0.2) {
            supporting++;
          } else if (rel.confidence < 0.3 && memory.confidence > 0.7) {
            contradicting++;
          } else {
            neutral++;
          }
        }
      }
    }

    return { supporting, contradicting, neutral };
  }

  /**
   * Get user feedback counts
   */
  private async getUserFeedback(
    memoryId: string
  ): Promise<{ confirmations: number; rejections: number }> {
    // Query validation_history table if available
    // For now, estimate from memory state
    const memory = await this.storage.read(memoryId);
    if (!memory) {
      return { confirmations: 0, rejections: 0 };
    }

    // If memory has been validated, count as confirmation
    const confirmations = memory.lastValidated ? 1 : 0;

    // If memory is archived due to rejection, count as rejection
    const rejections = memory.archived && memory.archiveReason?.includes('reject') ? 1 : 0;

    return { confirmations, rejections };
  }

  /**
   * Calculate age in days
   */
  private calculateAge(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Get metrics for multiple memories
   */
  async getMetricsBatch(memoryIds: string[]): Promise<Map<string, ConfidenceMetrics>> {
    const results = new Map<string, ConfidenceMetrics>();

    for (const id of memoryIds) {
      try {
        const metrics = await this.getMetrics(id);
        results.set(id, metrics);
      } catch {
        // Skip memories that can't be found
      }
    }

    return results;
  }
}
