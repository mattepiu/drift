/**
 * Learning Module Tests
 * 
 * Tests for:
 * - Preference Learner
 * - Outcome Tracker
 * - Fact Extractor (additional tests)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PreferenceLearner } from '../../learning/preference-learner.js';
import { OutcomeTracker } from '../../learning/outcome-tracker.js';
import { FactExtractor } from '../../learning/fact-extractor.js';
import { SQLiteMemoryStorage } from '../../storage/sqlite/storage.js';
import type { EpisodicMemory } from '../../types/index.js';

describe('Learning Module Tests', () => {
  describe('Preference Learner', () => {
    let storage: SQLiteMemoryStorage;
    let learner: PreferenceLearner;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      learner = new PreferenceLearner(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should learn preferences from accepted interactions', async () => {
      // Create episodes with extracted facts
      for (let i = 0; i < 5; i++) {
        await storage.create(createEpisodicMemory({
          id: `ep-${i}`,
          interaction: {
            userQuery: 'I prefer TypeScript',
            agentResponse: 'Using TypeScript',
            outcome: 'accepted',
          },
          extractedFacts: [
            { fact: 'prefers TypeScript', type: 'preference', confidence: 0.8 },
          ],
        }));
      }
      
      const preferences = await learner.learn();
      
      // Should find the TypeScript preference
      expect(preferences.some(p => p.preference.includes('TypeScript'))).toBe(true);
    });

    it('should not learn from rejected interactions', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.create(createEpisodicMemory({
          id: `ep-${i}`,
          interaction: {
            userQuery: 'Use JavaScript',
            agentResponse: 'Using JavaScript',
            outcome: 'rejected',
          },
          extractedFacts: [
            { fact: 'use JavaScript', type: 'preference', confidence: 0.8 },
          ],
        }));
      }
      
      const preferences = await learner.learn();
      
      // Should not learn rejected preferences
      expect(preferences.filter(p => p.preference.includes('JavaScript'))).toEqual([]);
    });

    it('should handle empty storage', async () => {
      const preferences = await learner.learn();
      expect(preferences).toEqual([]);
    });

    it('should require minimum evidence', async () => {
      // Only 2 episodes - below threshold
      for (let i = 0; i < 2; i++) {
        await storage.create(createEpisodicMemory({
          id: `ep-${i}`,
          interaction: {
            userQuery: 'Test',
            agentResponse: 'Test',
            outcome: 'accepted',
          },
          extractedFacts: [
            { fact: 'rare preference', type: 'preference', confidence: 0.8 },
          ],
        }));
      }
      
      const preferences = await learner.learn();
      
      // Should not learn with insufficient evidence
      expect(preferences.filter(p => p.preference === 'rare preference')).toEqual([]);
    });
  });

  describe('Outcome Tracker', () => {
    let storage: SQLiteMemoryStorage;
    let tracker: OutcomeTracker;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      tracker = new OutcomeTracker(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should track outcome statistics', async () => {
      await storage.create(createEpisodicMemory({ 
        id: 'ep-1',
        interaction: { userQuery: 'q', agentResponse: 'r', outcome: 'accepted' },
      }));
      await storage.create(createEpisodicMemory({ 
        id: 'ep-2',
        interaction: { userQuery: 'q', agentResponse: 'r', outcome: 'accepted' },
      }));
      await storage.create(createEpisodicMemory({ 
        id: 'ep-3',
        interaction: { userQuery: 'q', agentResponse: 'r', outcome: 'rejected' },
      }));
      
      const stats = await tracker.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.accepted).toBe(2);
      expect(stats.rejected).toBe(1);
      expect(stats.acceptanceRate).toBeCloseTo(0.667, 2);
    });

    it('should handle empty storage', async () => {
      const stats = await tracker.getStats();
      
      expect(stats.total).toBe(0);
      expect(stats.acceptanceRate).toBe(0);
    });

    it('should track modified outcomes', async () => {
      await storage.create(createEpisodicMemory({ 
        id: 'ep-1',
        interaction: { userQuery: 'q', agentResponse: 'r', outcome: 'modified' },
      }));
      
      const stats = await tracker.getStats();
      
      expect(stats.modified).toBe(1);
    });

    it('should track unknown outcomes', async () => {
      await storage.create(createEpisodicMemory({ 
        id: 'ep-1',
        interaction: { userQuery: 'q', agentResponse: 'r', outcome: 'unknown' },
      }));
      
      const stats = await tracker.getStats();
      
      expect(stats.unknown).toBe(1);
    });

    it('should get stats by focus area', async () => {
      await storage.create(createEpisodicMemory({ 
        id: 'ep-1',
        context: { intent: 'add_feature', focus: 'auth' },
        interaction: { userQuery: 'q', agentResponse: 'r', outcome: 'accepted' },
      }));
      await storage.create(createEpisodicMemory({ 
        id: 'ep-2',
        context: { intent: 'add_feature', focus: 'auth' },
        interaction: { userQuery: 'q', agentResponse: 'r', outcome: 'rejected' },
      }));
      await storage.create(createEpisodicMemory({ 
        id: 'ep-3',
        context: { intent: 'fix_bug', focus: 'database' },
        interaction: { userQuery: 'q', agentResponse: 'r', outcome: 'accepted' },
      }));
      
      const statsByFocus = await tracker.getStatsByFocus();
      
      expect(statsByFocus.get('auth')?.total).toBe(2);
      expect(statsByFocus.get('auth')?.acceptanceRate).toBe(0.5);
      expect(statsByFocus.get('database')?.total).toBe(1);
      expect(statsByFocus.get('database')?.acceptanceRate).toBe(1);
    });

    it('should handle missing focus', async () => {
      await storage.create(createEpisodicMemory({ 
        id: 'ep-1',
        context: { intent: 'add_feature' }, // No focus
        interaction: { userQuery: 'q', agentResponse: 'r', outcome: 'accepted' },
      }));
      
      const statsByFocus = await tracker.getStatsByFocus();
      
      expect(statsByFocus.get('unknown')?.total).toBe(1);
    });
  });

  describe('Fact Extractor - Additional Tests', () => {
    let extractor: FactExtractor;

    beforeEach(() => {
      extractor = new FactExtractor();
    });

    it('should extract multiple fact types from single query', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: "I prefer TypeScript and you should always use strict mode, but never use any type",
          agentResponse: 'Understood',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      
      const types = new Set(facts.map(f => f.type));
      expect(types.has('preference')).toBe(true);
      expect(types.has('knowledge')).toBe(true);
      expect(types.has('warning')).toBe(true);
    });

    it('should handle case insensitivity', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: "I PREFER uppercase and NEVER use lowercase",
          agentResponse: 'OK',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      
      expect(facts.some(f => f.type === 'preference')).toBe(true);
      expect(facts.some(f => f.type === 'warning')).toBe(true);
    });

    it('should extract from "avoid" keyword', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: "Avoid using global variables",
          agentResponse: 'Will do',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      
      expect(facts.some(f => f.type === 'warning')).toBe(true);
    });

    it('should extract from "must" keyword', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: "You must validate all inputs",
          agentResponse: 'Understood',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      
      expect(facts.some(f => f.type === 'knowledge')).toBe(true);
    });

    it('should extract from "like" keyword', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: "I like functional programming",
          agentResponse: 'Noted',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      
      expect(facts.some(f => f.type === 'preference')).toBe(true);
    });

    it('should handle very long queries', () => {
      const longQuery = 'I prefer ' + 'word '.repeat(1000);
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: longQuery,
          agentResponse: 'OK',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      
      expect(facts.some(f => f.type === 'preference')).toBe(true);
    });

    it('should handle special characters in query', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: "I prefer using @decorators and #hashtags, don't use $variables",
          agentResponse: 'OK',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      
      expect(Array.isArray(facts)).toBe(true);
    });
  });
});

// Helper functions

let memoryCounter = 0;

function createEpisodicMemory(overrides: Partial<EpisodicMemory> & { extractedFacts?: Array<{ fact: string; type: string; confidence: number }> }): EpisodicMemory {
  memoryCounter++;
  const base: EpisodicMemory = {
    id: overrides.id ?? `episodic-${memoryCounter}`,
    type: 'episodic',
    sessionId: 'session-1',
    context: overrides.context ?? {
      intent: 'add_feature',
      focus: 'test',
    },
    interaction: overrides.interaction ?? {
      userQuery: 'Test query',
      agentResponse: 'Test response',
      outcome: 'accepted',
    },
    summary: 'Episodic memory',
    confidence: 1.0,
    importance: 'normal',
    accessCount: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    consolidationStatus: 'pending',
  };
  
  // Add extractedFacts if provided
  if (overrides.extractedFacts) {
    (base as any).extractedFacts = overrides.extractedFacts;
  }
  
  return { ...base, ...overrides };
}
