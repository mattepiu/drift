/**
 * Abstraction Phase Tests
 * 
 * Tests for the episodic memory abstraction/consolidation system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AbstractionPhase, type AbstractedKnowledge } from '../../consolidation/abstraction.js';
import type { EpisodicMemory } from '../../types/index.js';

describe('AbstractionPhase', () => {
  let abstraction: AbstractionPhase;

  beforeEach(() => {
    abstraction = new AbstractionPhase();
  });

  describe('extract', () => {
    it('should return empty array for empty input', async () => {
      const result = await abstraction.extract([]);
      expect(result).toEqual([]);
    });

    it('should return empty array for single episode (needs 2+ for pattern)', async () => {
      const episodes = [createEpisode({ focus: 'auth' })];
      const result = await abstraction.extract(episodes);
      expect(result).toEqual([]);
    });

    it('should extract patterns from multiple episodes with same topic', async () => {
      const episodes = [
        createEpisode({
          focus: 'authentication',
          extractedFacts: [
            { fact: 'Always validate JWT tokens', confidence: 0.9 },
          ],
        }),
        createEpisode({
          focus: 'authentication',
          extractedFacts: [
            { fact: 'Always validate JWT tokens', confidence: 0.85 },
          ],
        }),
        createEpisode({
          focus: 'authentication',
          extractedFacts: [
            { fact: 'Always validate JWT tokens', confidence: 0.8 },
          ],
        }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.topic).toBe('authentication');
      expect(result[0]!.knowledge).toContain('jwt');
    });

    it('should group episodes by topic', async () => {
      const episodes = [
        createEpisode({
          focus: 'authentication',
          extractedFacts: [{ fact: 'Auth fact 1', confidence: 0.9 }],
        }),
        createEpisode({
          focus: 'authentication',
          extractedFacts: [{ fact: 'Auth fact 1', confidence: 0.9 }],
        }),
        createEpisode({
          focus: 'database',
          extractedFacts: [{ fact: 'DB fact 1', confidence: 0.9 }],
        }),
        createEpisode({
          focus: 'database',
          extractedFacts: [{ fact: 'DB fact 1', confidence: 0.9 }],
        }),
      ];

      const result = await abstraction.extract(episodes);

      const topics = result.map(r => r.topic);
      expect(topics).toContain('authentication');
      expect(topics).toContain('database');
    });

    it('should track source episode IDs', async () => {
      const episode1 = createEpisode({
        id: 'ep-1',
        focus: 'auth',
        extractedFacts: [{ fact: 'Common fact', confidence: 0.9 }],
      });
      const episode2 = createEpisode({
        id: 'ep-2',
        focus: 'auth',
        extractedFacts: [{ fact: 'Common fact', confidence: 0.9 }],
      });

      const result = await abstraction.extract([episode1, episode2]);

      expect(result[0]!.sourceEpisodes).toContain('ep-1');
      expect(result[0]!.sourceEpisodes).toContain('ep-2');
    });

    it('should use highest confidence from matching facts', async () => {
      const episodes = [
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: 'Important fact', confidence: 0.7 }],
        }),
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: 'Important fact', confidence: 0.95 }],
        }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result[0]!.confidence).toBe(0.95);
    });

    it('should count supporting evidence', async () => {
      const episodes = [
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: 'Repeated fact', confidence: 0.9 }],
        }),
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: 'Repeated fact', confidence: 0.9 }],
        }),
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: 'Repeated fact', confidence: 0.9 }],
        }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result[0]!.supportingEvidence).toBe(3);
    });

    it('should require at least 2 occurrences for a fact', async () => {
      const episodes = [
        createEpisode({
          focus: 'auth',
          extractedFacts: [
            { fact: 'Common fact', confidence: 0.9 },
            { fact: 'Unique fact 1', confidence: 0.9 },
          ],
        }),
        createEpisode({
          focus: 'auth',
          extractedFacts: [
            { fact: 'Common fact', confidence: 0.9 },
            { fact: 'Unique fact 2', confidence: 0.9 },
          ],
        }),
      ];

      const result = await abstraction.extract(episodes);

      // Only the common fact should be extracted
      expect(result.length).toBe(1);
      expect(result[0]!.knowledge).toContain('common');
    });
  });

  describe('topic grouping', () => {
    it('should use focus as topic', async () => {
      const episodes = [
        createEpisode({
          focus: 'payment-processing',
          extractedFacts: [{ fact: 'Test', confidence: 0.9 }],
        }),
        createEpisode({
          focus: 'payment-processing',
          extractedFacts: [{ fact: 'Test', confidence: 0.9 }],
        }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result[0]!.topic).toBe('payment-processing');
    });

    it('should use "general" for episodes without focus', async () => {
      const episodes = [
        createEpisode({
          focus: undefined,
          extractedFacts: [{ fact: 'General fact', confidence: 0.9 }],
        }),
        createEpisode({
          focus: undefined,
          extractedFacts: [{ fact: 'General fact', confidence: 0.9 }],
        }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result[0]!.topic).toBe('general');
    });
  });

  describe('fact matching', () => {
    it('should match facts case-insensitively', async () => {
      const episodes = [
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: 'Always Validate Tokens', confidence: 0.9 }],
        }),
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: 'always validate tokens', confidence: 0.9 }],
        }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result.length).toBe(1);
      expect(result[0]!.supportingEvidence).toBe(2);
    });

    it('should trim whitespace when matching', async () => {
      const episodes = [
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: '  Validate tokens  ', confidence: 0.9 }],
        }),
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: 'Validate tokens', confidence: 0.9 }],
        }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result.length).toBe(1);
      expect(result[0]!.supportingEvidence).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle episodes without extractedFacts', async () => {
      const episodes = [
        createEpisode({ focus: 'auth', extractedFacts: undefined }),
        createEpisode({ focus: 'auth', extractedFacts: undefined }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result).toEqual([]);
    });

    it('should handle empty extractedFacts arrays', async () => {
      const episodes = [
        createEpisode({ focus: 'auth', extractedFacts: [] }),
        createEpisode({ focus: 'auth', extractedFacts: [] }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result).toEqual([]);
    });

    it('should handle mixed episodes (some with facts, some without)', async () => {
      const episodes = [
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: 'Important fact', confidence: 0.9 }],
        }),
        createEpisode({ focus: 'auth', extractedFacts: undefined }),
        createEpisode({
          focus: 'auth',
          extractedFacts: [{ fact: 'Important fact', confidence: 0.9 }],
        }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result.length).toBe(1);
      expect(result[0]!.supportingEvidence).toBe(2);
    });
  });

  describe('multiple facts per episode', () => {
    it('should extract multiple common facts', async () => {
      const episodes = [
        createEpisode({
          focus: 'auth',
          extractedFacts: [
            { fact: 'Fact A', confidence: 0.9 },
            { fact: 'Fact B', confidence: 0.8 },
          ],
        }),
        createEpisode({
          focus: 'auth',
          extractedFacts: [
            { fact: 'Fact A', confidence: 0.9 },
            { fact: 'Fact B', confidence: 0.85 },
          ],
        }),
      ];

      const result = await abstraction.extract(episodes);

      expect(result.length).toBe(2);
      const facts = result.map(r => r.knowledge);
      expect(facts).toContain('fact a');
      expect(facts).toContain('fact b');
    });
  });
});

// Helper functions

let episodeCounter = 0;

function createEpisode(overrides: {
  id?: string;
  focus?: string;
  extractedFacts?: Array<{ fact: string; confidence: number }>;
}): EpisodicMemory {
  episodeCounter++;
  return {
    id: overrides.id || `ep-${episodeCounter}`,
    type: 'episodic',
    sessionId: 'session-1',
    context: {
      intent: 'add_feature',
      focus: overrides.focus,
    },
    interaction: {
      userQuery: 'Test query',
      agentResponse: 'Test response',
      outcome: 'accepted',
    },
    extractedFacts: overrides.extractedFacts,
    summary: 'Test episode',
    confidence: 1.0,
    importance: 'normal',
    accessCount: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    consolidationStatus: 'pending',
  };
}
