/**
 * Abstraction Phase
 * 
 * Phase 2 of consolidation: Extract patterns from episodic memories.
 * Groups episodes by topic and extracts common facts.
 */

import type { EpisodicMemory } from '../types/index.js';

/**
 * Abstracted knowledge from episodes
 */
export interface AbstractedKnowledge {
  /** Topic of the knowledge */
  topic: string;
  /** The extracted knowledge */
  knowledge: string;
  /** Source episode IDs */
  sourceEpisodes: string[];
  /** Confidence in this abstraction */
  confidence: number;
  /** Number of supporting episodes */
  supportingEvidence: number;
}

/**
 * Abstraction phase
 */
export class AbstractionPhase {
  /**
   * Extract patterns from episodes
   */
  async extract(episodes: EpisodicMemory[]): Promise<AbstractedKnowledge[]> {
    // Group episodes by topic/focus
    const grouped = this.groupByTopic(episodes);

    const abstractions: AbstractedKnowledge[] = [];

    for (const [topic, topicEpisodes] of Object.entries(grouped)) {
      if (topicEpisodes.length < 2) continue;

      // Extract common facts
      const facts = this.extractCommonFacts(topicEpisodes);

      for (const fact of facts) {
        abstractions.push({
          topic,
          knowledge: fact.fact,
          sourceEpisodes: topicEpisodes.map(e => e.id),
          confidence: fact.confidence,
          supportingEvidence: fact.count,
        });
      }
    }

    return abstractions;
  }

  /**
   * Group episodes by topic
   */
  private groupByTopic(episodes: EpisodicMemory[]): Record<string, EpisodicMemory[]> {
    const groups: Record<string, EpisodicMemory[]> = {};

    for (const episode of episodes) {
      const topic = episode.context.focus || 'general';
      if (!groups[topic]) groups[topic] = [];
      groups[topic].push(episode);
    }

    return groups;
  }

  /**
   * Extract common facts from episodes
   */
  private extractCommonFacts(episodes: EpisodicMemory[]): Array<{
    fact: string;
    confidence: number;
    count: number;
  }> {
    // Collect all extracted facts
    const factCounts = new Map<string, { confidence: number; count: number }>();

    for (const episode of episodes) {
      for (const extracted of episode.extractedFacts || []) {
        const key = extracted.fact.toLowerCase().trim();
        const existing = factCounts.get(key);

        if (existing) {
          existing.count++;
          existing.confidence = Math.max(existing.confidence, extracted.confidence);
        } else {
          factCounts.set(key, {
            confidence: extracted.confidence,
            count: 1,
          });
        }
      }
    }

    // Return facts that appear multiple times
    return Array.from(factCounts.entries())
      .filter(([_, data]) => data.count >= 2)
      .map(([fact, data]) => ({
        fact,
        confidence: data.confidence,
        count: data.count,
      }));
  }
}
