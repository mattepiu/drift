/**
 * Fact Extractor
 * 
 * Extracts facts from episodic memories.
 */

import type { EpisodicMemory, ExtractedFact } from '../types/index.js';

/**
 * Fact extractor
 */
export class FactExtractor {
  /**
   * Extract facts from an episode
   */
  extract(episode: EpisodicMemory): ExtractedFact[] {
    const facts: ExtractedFact[] = [];

    // Extract from user query
    const queryFacts = this.extractFromQuery(episode.interaction.userQuery);
    facts.push(...queryFacts);

    // Extract from outcome
    if (episode.interaction.outcome === 'rejected') {
      facts.push({
        fact: `User rejected response about ${episode.context.focus || 'unknown'}`,
        confidence: 0.8,
        type: 'correction',
      });
    }

    return facts;
  }

  /**
   * Extract facts from a user query
   */
  private extractFromQuery(query: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    const lowerQuery = query.toLowerCase();

    // Look for preference indicators
    if (lowerQuery.includes('prefer') || lowerQuery.includes('like')) {
      facts.push({
        fact: query,
        confidence: 0.7,
        type: 'preference',
      });
    }

    // Look for warnings
    if (lowerQuery.includes('don\'t') || lowerQuery.includes('never') || lowerQuery.includes('avoid')) {
      facts.push({
        fact: query,
        confidence: 0.8,
        type: 'warning',
      });
    }

    // Look for knowledge
    if (lowerQuery.includes('always') || lowerQuery.includes('must') || lowerQuery.includes('should')) {
      facts.push({
        fact: query,
        confidence: 0.7,
        type: 'knowledge',
      });
    }

    return facts;
  }
}
