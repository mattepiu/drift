/**
 * Outcome Tracker
 * 
 * Tracks outcomes of AI interactions for learning,
 * including a feedback loop for continuous improvement.
 * 
 * @module learning/outcome-tracker
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { EpisodicMemory } from '../types/index.js';
import type { LearningOutcome } from '../types/learning.js';

/**
 * Outcome statistics
 */
export interface OutcomeStats {
  total: number;
  accepted: number;
  rejected: number;
  modified: number;
  unknown: number;
  acceptanceRate: number;
}

/**
 * Feedback entry
 */
export interface FeedbackEntry {
  /** Memory ID that was used */
  memoryId: string;
  /** Outcome of using the memory */
  outcome: 'accepted' | 'rejected' | 'modified';
  /** Context where it was used */
  context?: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Memory effectiveness score
 */
export interface MemoryEffectiveness {
  /** Memory ID */
  memoryId: string;
  /** Memory type */
  memoryType: string;
  /** Times used */
  usageCount: number;
  /** Times accepted */
  acceptedCount: number;
  /** Times rejected */
  rejectedCount: number;
  /** Effectiveness score (0-1) */
  score: number;
}

/**
 * Outcome Tracker
 * 
 * Tracks outcomes and provides feedback loop for learning.
 */
export class OutcomeTracker {
  /** In-memory feedback buffer */
  private feedbackBuffer: FeedbackEntry[] = [];

  /** Memory effectiveness cache */
  private effectivenessCache: Map<string, MemoryEffectiveness> = new Map();

  constructor(private storage: IMemoryStorage) {}

  /**
   * Get outcome statistics
   */
  async getStats(): Promise<OutcomeStats> {
    const episodes = await this.storage.search({
      types: ['episodic'],
      limit: 1000,
    }) as EpisodicMemory[];

    const stats = {
      total: episodes.length,
      accepted: 0,
      rejected: 0,
      modified: 0,
      unknown: 0,
      acceptanceRate: 0,
    };

    for (const episode of episodes) {
      switch (episode.interaction.outcome) {
        case 'accepted':
          stats.accepted++;
          break;
        case 'rejected':
          stats.rejected++;
          break;
        case 'modified':
          stats.modified++;
          break;
        default:
          stats.unknown++;
      }
    }

    stats.acceptanceRate = stats.total > 0
      ? stats.accepted / stats.total
      : 0;

    return stats;
  }

  /**
   * Get outcomes by focus area
   */
  async getStatsByFocus(): Promise<Map<string, OutcomeStats>> {
    const episodes = await this.storage.search({
      types: ['episodic'],
      limit: 1000,
    }) as EpisodicMemory[];

    const byFocus = new Map<string, EpisodicMemory[]>();

    for (const episode of episodes) {
      const focus = episode.context.focus || 'unknown';
      const existing = byFocus.get(focus) || [];
      existing.push(episode);
      byFocus.set(focus, existing);
    }

    const result = new Map<string, OutcomeStats>();

    for (const [focus, focusEpisodes] of byFocus) {
      const stats = {
        total: focusEpisodes.length,
        accepted: focusEpisodes.filter(e => e.interaction.outcome === 'accepted').length,
        rejected: focusEpisodes.filter(e => e.interaction.outcome === 'rejected').length,
        modified: focusEpisodes.filter(e => e.interaction.outcome === 'modified').length,
        unknown: focusEpisodes.filter(e => e.interaction.outcome === 'unknown').length,
        acceptanceRate: 0,
      };
      stats.acceptanceRate = stats.total > 0 ? stats.accepted / stats.total : 0;
      result.set(focus, stats);
    }

    return result;
  }

  /**
   * Record feedback for a memory usage
   */
  async recordFeedback(
    memoryId: string,
    outcome: 'accepted' | 'rejected' | 'modified',
    context?: string
  ): Promise<void> {
    const entry: FeedbackEntry = {
      memoryId,
      outcome,
      timestamp: new Date().toISOString(),
    };

    // Only add context if provided
    if (context) {
      entry.context = context;
    }

    // Add to buffer
    this.feedbackBuffer.push(entry);

    // Update effectiveness cache
    this.updateEffectivenessCache(entry);

    // Flush buffer if it gets too large
    if (this.feedbackBuffer.length >= 100) {
      await this.flushFeedbackBuffer();
    }
  }

  /**
   * Get memory effectiveness scores
   */
  async getMemoryEffectiveness(
    memoryIds?: string[]
  ): Promise<MemoryEffectiveness[]> {
    const results: MemoryEffectiveness[] = [];

    // Get from cache
    const idsToCheck = memoryIds || Array.from(this.effectivenessCache.keys());

    for (const id of idsToCheck) {
      const cached = this.effectivenessCache.get(id);
      if (cached) {
        results.push(cached);
      } else {
        // Calculate from storage
        const effectiveness = await this.calculateEffectiveness(id);
        if (effectiveness) {
          results.push(effectiveness);
          this.effectivenessCache.set(id, effectiveness);
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Get least effective memories
   */
  async getLeastEffective(limit: number = 10): Promise<MemoryEffectiveness[]> {
    const all = await this.getMemoryEffectiveness();

    // Filter to those with enough usage
    const withUsage = all.filter(e => e.usageCount >= 3);

    // Sort by score ascending (least effective first)
    withUsage.sort((a, b) => a.score - b.score);

    return withUsage.slice(0, limit);
  }

  /**
   * Get most effective memories
   */
  async getMostEffective(limit: number = 10): Promise<MemoryEffectiveness[]> {
    const all = await this.getMemoryEffectiveness();

    // Filter to those with enough usage
    const withUsage = all.filter(e => e.usageCount >= 3);

    // Already sorted by score descending
    return withUsage.slice(0, limit);
  }

  /**
   * Process feedback loop - update memory confidence based on outcomes
   */
  async processFeedbackLoop(): Promise<LearningOutcome[]> {
    const outcomes: LearningOutcome[] = [];

    // Group feedback by memory
    const byMemory = new Map<string, FeedbackEntry[]>();
    for (const entry of this.feedbackBuffer) {
      const existing = byMemory.get(entry.memoryId) || [];
      existing.push(entry);
      byMemory.set(entry.memoryId, existing);
    }

    // Process each memory
    for (const [memoryId, entries] of byMemory) {
      try {
        const memory = await this.storage.read(memoryId);
        if (!memory) continue;

        // Calculate new confidence based on feedback
        const accepted = entries.filter(e => e.outcome === 'accepted').length;
        const total = entries.length;

        // Adjust confidence
        const feedbackRatio = accepted / total;
        const adjustment = (feedbackRatio - 0.5) * 0.2;
        const newConfidence = Math.max(0, Math.min(1, memory.confidence + adjustment));

        // Update memory
        await this.storage.update(memoryId, {
          confidence: newConfidence,
          updatedAt: new Date().toISOString(),
        });

        outcomes.push({
          correctionId: memoryId,
          memoriesUpdated: [memoryId],
          principlesExtracted: 0,
          success: true,
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        outcomes.push({
          correctionId: memoryId,
          memoriesUpdated: [],
          principlesExtracted: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date().toISOString(),
        });
      }
    }

    // Clear buffer
    this.feedbackBuffer = [];

    return outcomes;
  }

  /**
   * Get feedback buffer size
   */
  getBufferSize(): number {
    return this.feedbackBuffer.length;
  }

  /**
   * Flush feedback buffer to storage
   */
  async flushFeedbackBuffer(): Promise<void> {
    await this.processFeedbackLoop();
  }

  /**
   * Update effectiveness cache with new feedback
   */
  private updateEffectivenessCache(entry: FeedbackEntry): void {
    const existing = this.effectivenessCache.get(entry.memoryId);

    if (existing) {
      existing.usageCount++;
      if (entry.outcome === 'accepted') {
        existing.acceptedCount++;
      } else if (entry.outcome === 'rejected') {
        existing.rejectedCount++;
      }
      existing.score = this.calculateScore(
        existing.acceptedCount,
        existing.rejectedCount
      );
    }
  }

  /**
   * Calculate effectiveness for a memory
   */
  private async calculateEffectiveness(
    memoryId: string
  ): Promise<MemoryEffectiveness | null> {
    const memory = await this.storage.read(memoryId);
    if (!memory) return null;

    // Count feedback entries for this memory
    const entries = this.feedbackBuffer.filter(e => e.memoryId === memoryId);
    const accepted = entries.filter(e => e.outcome === 'accepted').length;
    const rejected = entries.filter(e => e.outcome === 'rejected').length;

    return {
      memoryId,
      memoryType: memory.type,
      usageCount: entries.length,
      acceptedCount: accepted,
      rejectedCount: rejected,
      score: this.calculateScore(accepted, rejected),
    };
  }

  /**
   * Calculate effectiveness score
   */
  private calculateScore(accepted: number, rejected: number): number {
    const total = accepted + rejected;
    if (total === 0) return 0.5;
    return accepted / total;
  }

  /**
   * Get trend analysis for outcomes
   */
  async getTrend(days: number = 7): Promise<{
    date: string;
    stats: OutcomeStats;
  }[]> {
    const episodes = await this.storage.search({
      types: ['episodic'],
      limit: 10000,
    }) as EpisodicMemory[];

    const now = new Date();
    const trend: { date: string; stats: OutcomeStats }[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStrParts = date.toISOString().split('T');
      const dateStr = dateStrParts[0] ?? '';

      const dayEpisodes = episodes.filter(e =>
        e.createdAt.startsWith(dateStr)
      );

      const stats: OutcomeStats = {
        total: dayEpisodes.length,
        accepted: dayEpisodes.filter(e => e.interaction.outcome === 'accepted').length,
        rejected: dayEpisodes.filter(e => e.interaction.outcome === 'rejected').length,
        modified: dayEpisodes.filter(e => e.interaction.outcome === 'modified').length,
        unknown: dayEpisodes.filter(e => e.interaction.outcome === 'unknown').length,
        acceptanceRate: 0,
      };
      stats.acceptanceRate = stats.total > 0 ? stats.accepted / stats.total : 0;

      trend.push({ date: dateStr, stats });
    }

    return trend.reverse();
  }
}
