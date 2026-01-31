/**
 * Preference Learner
 * 
 * Learns user preferences from interaction patterns.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { EpisodicMemory } from '../types/index.js';

/**
 * Learned preference
 */
export interface LearnedPreference {
  category: string;
  preference: string;
  confidence: number;
  evidence: number;
}

/**
 * Preference learner
 */
export class PreferenceLearner {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Learn preferences from episodic memories
   */
  async learn(): Promise<LearnedPreference[]> {
    // Get accepted interactions
    const episodes = await this.storage.search({
      types: ['episodic'],
      limit: 100,
    }) as EpisodicMemory[];

    const accepted = episodes.filter(e => e.interaction.outcome === 'accepted');
    const rejected = episodes.filter(e => e.interaction.outcome === 'rejected');

    const preferences: LearnedPreference[] = [];

    // Analyze patterns in accepted vs rejected
    const acceptedPatterns = this.extractPatterns(accepted);
    const rejectedPatterns = this.extractPatterns(rejected);

    // Find patterns that appear more in accepted
    for (const [pattern, count] of acceptedPatterns) {
      const rejectedCount = rejectedPatterns.get(pattern) || 0;
      if (count > rejectedCount * 2 && count >= 3) {
        preferences.push({
          category: 'style',
          preference: pattern,
          confidence: count / (count + rejectedCount),
          evidence: count,
        });
      }
    }

    return preferences;
  }

  /**
   * Extract patterns from episodes
   */
  private extractPatterns(episodes: EpisodicMemory[]): Map<string, number> {
    const patterns = new Map<string, number>();

    for (const episode of episodes) {
      // Extract patterns from extracted facts
      for (const fact of episode.extractedFacts || []) {
        if (fact.type === 'preference') {
          const count = patterns.get(fact.fact) || 0;
          patterns.set(fact.fact, count + 1);
        }
      }
    }

    return patterns;
  }
}
