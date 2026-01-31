/**
 * Relevance Scoring
 * 
 * Scores memories based on relevance to the current context.
 * Considers confidence, recency, access patterns, and topic match.
 */

import type { Memory } from '../types/index.js';
import type { RetrievalContext } from './engine.js';

/**
 * Relevance scorer
 */
export class RelevanceScorer {
  /**
   * Score a memory's relevance to a context
   */
  score(memory: Memory, context: RetrievalContext): number {
    let score = 0;

    // Base confidence score (0-1)
    score += memory.confidence * 0.3;

    // Importance multiplier
    score += this.importanceScore(memory.importance) * 0.2;

    // Recency score (0-1)
    score += this.recencyScore(memory.createdAt) * 0.15;

    // Access frequency score (0-1)
    score += this.accessScore(memory.accessCount) * 0.1;

    // Topic match score (0-1)
    score += this.topicMatchScore(memory, context.focus) * 0.25;

    return Math.min(1.0, score);
  }

  /**
   * Score based on importance
   */
  private importanceScore(importance: string): number {
    switch (importance) {
      case 'critical': return 1.0;
      case 'high': return 0.8;
      case 'normal': return 0.5;
      case 'low': return 0.2;
      default: return 0.5;
    }
  }

  /**
   * Score based on recency
   */
  private recencyScore(createdAt: string): number {
    const age = Date.now() - new Date(createdAt).getTime();
    const daysOld = age / (1000 * 60 * 60 * 24);

    // Exponential decay with 30-day half-life
    return Math.exp(-daysOld / 30);
  }

  /**
   * Score based on access frequency
   */
  private accessScore(accessCount: number): number {
    // Logarithmic scaling
    return Math.min(1.0, Math.log10(accessCount + 1) / 2);
  }

  /**
   * Score based on topic match
   */
  private topicMatchScore(memory: Memory, focus: string): number {
    // Handle empty or whitespace-only focus
    if (!focus || !focus.trim()) {
      return 0;
    }

    const focusLower = focus.toLowerCase();
    const focusWords = new Set(focusLower.split(/\s+/).filter(w => w.length > 0));

    // Handle empty focus words
    if (focusWords.size === 0) {
      return 0;
    }

    // Check summary (handle undefined/null)
    let summaryMatch = 0;
    if (memory.summary) {
      const summaryWords = new Set(memory.summary.toLowerCase().split(/\s+/));
      summaryMatch = this.jaccardSimilarity(focusWords, summaryWords);
    }

    // Check topic if available
    let topicMatch = 0;
    if ('topic' in memory && memory.topic) {
      const topicWords = new Set(memory.topic.toLowerCase().split(/\s+/));
      topicMatch = this.jaccardSimilarity(focusWords, topicWords);
    }

    // Check knowledge if available
    let knowledgeMatch = 0;
    if ('knowledge' in memory && memory.knowledge) {
      const knowledgeWords = new Set(memory.knowledge.toLowerCase().split(/\s+/).slice(0, 50));
      knowledgeMatch = this.jaccardSimilarity(focusWords, knowledgeWords);
    }

    return Math.max(summaryMatch, topicMatch, knowledgeMatch);
  }

  /**
   * Calculate Jaccard similarity between two sets
   */
  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    const intersection = new Set([...a].filter(x => b.has(x)));
    const union = new Set([...a, ...b]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
}
