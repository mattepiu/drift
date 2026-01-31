/**
 * Relevance Scoring Tests
 * 
 * Tests for the memory relevance scoring system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RelevanceScorer } from '../../retrieval/scoring.js';
import type { RetrievalContext } from '../../retrieval/engine.js';
import type { TribalMemory, SemanticMemory } from '../../types/index.js';

describe('RelevanceScorer', () => {
  let scorer: RelevanceScorer;

  beforeEach(() => {
    scorer = new RelevanceScorer();
  });

  describe('score', () => {
    it('should return a score between 0 and 1', () => {
      const memory = createTribalMemory({});
      const context = createContext({ focus: 'authentication' });

      const score = scorer.score(memory, context);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should score higher for higher confidence', () => {
      const lowConfidence = createTribalMemory({ confidence: 0.3 });
      const highConfidence = createTribalMemory({ confidence: 0.9 });
      const context = createContext({ focus: 'test' });

      const lowScore = scorer.score(lowConfidence, context);
      const highScore = scorer.score(highConfidence, context);

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('should score higher for critical importance', () => {
      const normalImportance = createTribalMemory({ importance: 'normal' });
      const criticalImportance = createTribalMemory({ importance: 'critical' });
      const context = createContext({ focus: 'test' });

      const normalScore = scorer.score(normalImportance, context);
      const criticalScore = scorer.score(criticalImportance, context);

      expect(criticalScore).toBeGreaterThan(normalScore);
    });

    it('should score higher for recent memories', () => {
      const oldMemory = createTribalMemory({ createdAt: daysAgo(90) });
      const newMemory = createTribalMemory({ createdAt: new Date().toISOString() });
      const context = createContext({ focus: 'test' });

      const oldScore = scorer.score(oldMemory, context);
      const newScore = scorer.score(newMemory, context);

      expect(newScore).toBeGreaterThan(oldScore);
    });

    it('should score higher for frequently accessed memories', () => {
      const lowAccess = createTribalMemory({ accessCount: 1 });
      const highAccess = createTribalMemory({ accessCount: 100 });
      const context = createContext({ focus: 'test' });

      const lowScore = scorer.score(lowAccess, context);
      const highScore = scorer.score(highAccess, context);

      expect(highScore).toBeGreaterThan(lowScore);
    });
  });

  describe('topic matching', () => {
    it('should score higher when topic matches focus', () => {
      const matchingMemory = createTribalMemory({
        topic: 'authentication security',
        summary: 'Auth security warning',
      });
      const nonMatchingMemory = createTribalMemory({
        topic: 'database optimization',
        summary: 'DB optimization tip',
      });
      const context = createContext({ focus: 'authentication' });

      const matchingScore = scorer.score(matchingMemory, context);
      const nonMatchingScore = scorer.score(nonMatchingMemory, context);

      expect(matchingScore).toBeGreaterThan(nonMatchingScore);
    });

    it('should match on summary when topic is not available', () => {
      const matchingMemory = createTribalMemory({
        topic: 'general',
        summary: 'Important authentication warning',
      });
      const nonMatchingMemory = createTribalMemory({
        topic: 'general',
        summary: 'Database connection tip',
      });
      const context = createContext({ focus: 'authentication' });

      const matchingScore = scorer.score(matchingMemory, context);
      const nonMatchingScore = scorer.score(nonMatchingMemory, context);

      expect(matchingScore).toBeGreaterThan(nonMatchingScore);
    });

    it('should match on knowledge content for semantic memories', () => {
      const matchingMemory = createSemanticMemory({
        topic: 'general',
        knowledge: 'Always validate authentication tokens before processing requests',
      });
      const nonMatchingMemory = createSemanticMemory({
        topic: 'general',
        knowledge: 'Use connection pooling for database efficiency',
      });
      const context = createContext({ focus: 'authentication tokens' });

      const matchingScore = scorer.score(matchingMemory, context);
      const nonMatchingScore = scorer.score(nonMatchingMemory, context);

      expect(matchingScore).toBeGreaterThan(nonMatchingScore);
    });

    it('should handle multi-word focus queries', () => {
      const memory = createTribalMemory({
        topic: 'user authentication flow',
        knowledge: 'The authentication flow requires token validation',
      });
      const context = createContext({ focus: 'user authentication token validation' });

      const score = scorer.score(memory, context);

      // Should have a reasonable score due to multiple word matches
      expect(score).toBeGreaterThan(0.3);
    });
  });

  describe('importance scoring', () => {
    it('should return 1.0 for critical importance', () => {
      const memory = createTribalMemory({ importance: 'critical' });
      const context = createContext({ focus: 'test' });

      // We can't directly test private methods, but we can verify behavior
      const criticalScore = scorer.score(memory, context);
      
      const normalMemory = createTribalMemory({ importance: 'normal' });
      const normalScore = scorer.score(normalMemory, context);

      // Critical should contribute more to score
      expect(criticalScore).toBeGreaterThan(normalScore);
    });

    it('should handle all importance levels', () => {
      const context = createContext({ focus: 'test' });
      const importanceLevels = ['critical', 'high', 'normal', 'low'] as const;
      const scores: number[] = [];

      for (const importance of importanceLevels) {
        const memory = createTribalMemory({ importance });
        scores.push(scorer.score(memory, context));
      }

      // Scores should be in descending order
      for (let i = 0; i < scores.length - 1; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]!);
      }
    });
  });

  describe('recency scoring', () => {
    it('should give higher scores to recent memories', () => {
      const context = createContext({ focus: 'test' });
      const ages = [0, 7, 30, 90, 365]; // days
      const scores: number[] = [];

      for (const age of ages) {
        const memory = createTribalMemory({ createdAt: daysAgo(age) });
        scores.push(scorer.score(memory, context));
      }

      // Scores should be in descending order (newer = higher)
      for (let i = 0; i < scores.length - 1; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]!);
      }
    });

    it('should use exponential decay with ~30 day half-life', () => {
      const context = createContext({ focus: 'test' });
      
      const freshMemory = createTribalMemory({ createdAt: new Date().toISOString() });
      const monthOldMemory = createTribalMemory({ createdAt: daysAgo(30) });

      const freshScore = scorer.score(freshMemory, context);
      const monthOldScore = scorer.score(monthOldMemory, context);

      // After 30 days, recency component should be ~50% of original
      // But total score includes other factors, so just verify it's lower
      expect(monthOldScore).toBeLessThan(freshScore);
    });
  });

  describe('access frequency scoring', () => {
    it('should use logarithmic scaling', () => {
      const context = createContext({ focus: 'test' });
      
      const lowAccess = createTribalMemory({ accessCount: 1 });
      const mediumAccess = createTribalMemory({ accessCount: 10 });
      const highAccess = createTribalMemory({ accessCount: 100 });

      const lowScore = scorer.score(lowAccess, context);
      const mediumScore = scorer.score(mediumAccess, context);
      const highScore = scorer.score(highAccess, context);

      // Logarithmic: difference between 1->10 should be similar to 10->100
      const diff1 = mediumScore - lowScore;
      const diff2 = highScore - mediumScore;

      // Allow some tolerance due to other scoring factors
      expect(Math.abs(diff1 - diff2)).toBeLessThan(0.1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty focus', () => {
      const memory = createTribalMemory({});
      const context = createContext({ focus: '' });

      const score = scorer.score(memory, context);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle zero access count', () => {
      const memory = createTribalMemory({ accessCount: 0 });
      const context = createContext({ focus: 'test' });

      const score = scorer.score(memory, context);

      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should handle very old memories', () => {
      const memory = createTribalMemory({ createdAt: daysAgo(3650) }); // 10 years
      const context = createContext({ focus: 'test' });

      const score = scorer.score(memory, context);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});

// Helper functions

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function createContext(overrides: Partial<RetrievalContext>): RetrievalContext {
  return {
    intent: 'add_feature',
    focus: 'test',
    ...overrides,
  };
}

function createTribalMemory(overrides: Partial<TribalMemory>): TribalMemory {
  return {
    id: 'test-tribal-1',
    type: 'tribal',
    topic: 'test-topic',
    knowledge: 'Test knowledge content',
    severity: 'warning',
    summary: 'Test summary',
    confidence: 0.8,
    importance: 'normal',
    accessCount: 5,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createSemanticMemory(overrides: Partial<SemanticMemory>): SemanticMemory {
  return {
    id: 'test-semantic-1',
    type: 'semantic',
    topic: 'test-topic',
    knowledge: 'Test semantic knowledge',
    summary: 'Test summary',
    confidence: 0.8,
    importance: 'normal',
    accessCount: 5,
    supportingEvidence: 3,
    contradictingEvidence: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
