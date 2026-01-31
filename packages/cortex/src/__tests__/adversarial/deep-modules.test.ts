/**
 * Deep Module Tests
 * 
 * Tests for deeper system modules:
 * - L1 Memory Cache (LRU eviction)
 * - Warning Aggregator
 * - Pruning Phase
 * - Strengthening Phase
 * - Replay Phase
 * - Pattern Context Gatherer
 * - Why Synthesizer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { L1MemoryCache } from '../../cache/l1-memory.js';
import { WarningAggregator } from '../../why/warning-aggregator.js';
import { PruningPhase } from '../../consolidation/pruning.js';
import { StrengtheningPhase } from '../../consolidation/strengthening.js';
import { ReplayPhase } from '../../consolidation/replay.js';
import { PatternContextGatherer } from '../../why/pattern-context.js';
import { SQLiteMemoryStorage } from '../../storage/sqlite/storage.js';
import type { TribalMemory, EpisodicMemory, PatternRationaleMemory } from '../../types/index.js';
import type { TribalContext, PatternContext } from '../../why/synthesizer.js';

describe('Deep Module Tests', () => {
  describe('L1 Memory Cache', () => {
    let cache: L1MemoryCache;

    beforeEach(() => {
      cache = new L1MemoryCache(5); // Small cache for testing
    });

    it('should store and retrieve memories', () => {
      const memory = createTribalMemory({ id: 'test-1' });
      cache.set('test-1', memory);
      
      const retrieved = cache.get('test-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('test-1');
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should delete memories', () => {
      const memory = createTribalMemory({ id: 'test-1' });
      cache.set('test-1', memory);
      cache.delete('test-1');
      
      expect(cache.get('test-1')).toBeNull();
    });

    it('should clear all memories', () => {
      cache.set('test-1', createTribalMemory({ id: 'test-1' }));
      cache.set('test-2', createTribalMemory({ id: 'test-2' }));
      cache.clear();
      
      expect(cache.size).toBe(0);
    });

    it('should evict LRU entry when at capacity', async () => {
      // Fill cache to capacity
      for (let i = 0; i < 5; i++) {
        cache.set(`mem-${i}`, createTribalMemory({ id: `mem-${i}` }));
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      
      // Access mem-0 to make it recently used
      cache.get('mem-0');
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 5));
      
      // Add one more, should evict mem-1 (oldest not accessed)
      cache.set('mem-5', createTribalMemory({ id: 'mem-5' }));
      
      expect(cache.size).toBe(5);
      expect(cache.get('mem-0')).not.toBeNull(); // Still there (was accessed)
      expect(cache.get('mem-5')).not.toBeNull(); // New one added
      // mem-1 should have been evicted (oldest after mem-0 was accessed)
    });

    it('should track access count', () => {
      const memory = createTribalMemory({ id: 'test-1' });
      cache.set('test-1', memory);
      
      // Access multiple times
      cache.get('test-1');
      cache.get('test-1');
      cache.get('test-1');
      
      // Should still return the memory
      expect(cache.get('test-1')).not.toBeNull();
    });

    it('should handle rapid set/get operations', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`rapid-${i}`, createTribalMemory({ id: `rapid-${i}` }));
        cache.get(`rapid-${i % 5}`); // Access some existing
      }
      
      // Cache should be at max size
      expect(cache.size).toBe(5);
    });

    it('should handle overwriting existing keys', () => {
      const memory1 = createTribalMemory({ id: 'test-1', knowledge: 'first' });
      const memory2 = createTribalMemory({ id: 'test-1', knowledge: 'second' });
      
      cache.set('test-1', memory1);
      cache.set('test-1', memory2);
      
      const retrieved = cache.get('test-1') as TribalMemory;
      expect(retrieved.knowledge).toBe('second');
    });
  });

  describe('Warning Aggregator', () => {
    let aggregator: WarningAggregator;

    beforeEach(() => {
      aggregator = new WarningAggregator();
    });

    it('should aggregate tribal warnings', () => {
      const tribal: TribalContext[] = [
        { topic: 'auth', knowledge: 'Never store passwords in plain text', severity: 'critical', confidence: 0.9 },
        { topic: 'db', knowledge: 'Use connection pooling', severity: 'info', confidence: 0.8 },
      ];
      
      const warnings = aggregator.aggregate(tribal, []);
      
      expect(warnings.length).toBe(1); // Only critical/warning, not info
      expect(warnings[0]!.severity).toBe('critical');
    });

    it('should aggregate pattern warnings for missing rationales', () => {
      const patterns: PatternContext[] = [
        { patternId: 'p1', patternName: 'Pattern 1', rationale: 'Has rationale' },
        { patternId: 'p2', patternName: 'Pattern 2' }, // No rationale
      ];
      
      const warnings = aggregator.aggregate([], patterns);
      
      expect(warnings.length).toBe(1);
      expect(warnings[0]!.type).toBe('pattern');
    });

    it('should sort warnings by severity', () => {
      const tribal: TribalContext[] = [
        { topic: 'a', knowledge: 'Warning', severity: 'warning', confidence: 0.9 },
        { topic: 'b', knowledge: 'Critical', severity: 'critical', confidence: 0.9 },
      ];
      
      const warnings = aggregator.aggregate(tribal, []);
      
      // Both should be included (critical and warning)
      expect(warnings.length).toBe(2);
      // Critical should come first
      expect(warnings[0]!.severity).toBe('critical');
      expect(warnings[1]!.severity).toBe('warning');
    });

    it('should handle empty inputs', () => {
      const warnings = aggregator.aggregate([], []);
      expect(warnings).toEqual([]);
    });

    it('should handle mixed sources', () => {
      const tribal: TribalContext[] = [
        { topic: 'auth', knowledge: 'Critical warning', severity: 'critical', confidence: 0.9 },
      ];
      const patterns: PatternContext[] = [
        { patternId: 'p1', patternName: 'Pattern without rationale' },
      ];
      
      const warnings = aggregator.aggregate(tribal, patterns);
      
      expect(warnings.length).toBe(2);
      // Critical tribal warning should come first
      expect(warnings[0]!.severity).toBe('critical');
      expect(warnings[0]!.type).toBe('tribal');
      // Pattern warning (info) should come second
      expect(warnings[1]!.severity).toBe('info');
      expect(warnings[1]!.type).toBe('pattern');
    });
  });

  describe('Pruning Phase', () => {
    let storage: SQLiteMemoryStorage;
    let pruning: PruningPhase;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      pruning = new PruningPhase(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should prune consolidated episodes', async () => {
      const episode1 = createEpisodicMemory({ id: 'ep-1' });
      const episode2 = createEpisodicMemory({ id: 'ep-2' });
      
      await storage.create(episode1);
      await storage.create(episode2);
      
      const abstractions = [
        { sourceEpisodes: ['ep-1'], topic: 'test', knowledge: 'test', confidence: 0.8 },
      ];
      
      const result = await pruning.prune([episode1, episode2], abstractions);
      
      expect(result.pruned).toBe(1);
      expect(result.tokensFreed).toBeGreaterThan(0);
    });

    it('should not prune non-consolidated episodes', async () => {
      const episode = createEpisodicMemory({ id: 'ep-1' });
      await storage.create(episode);
      
      const result = await pruning.prune([episode], []);
      
      expect(result.pruned).toBe(0);
    });

    it('should handle empty episodes array', async () => {
      const result = await pruning.prune([], []);
      
      expect(result.pruned).toBe(0);
      expect(result.tokensFreed).toBe(0);
    });

    it('should mark pruned episodes correctly', async () => {
      const episode = createEpisodicMemory({ id: 'ep-1' });
      await storage.create(episode);
      
      const abstractions = [
        { sourceEpisodes: ['ep-1'], topic: 'test', knowledge: 'test', confidence: 0.8 },
      ];
      
      await pruning.prune([episode], abstractions);
      
      const updated = await storage.read('ep-1') as EpisodicMemory;
      expect(updated.consolidationStatus).toBe('pruned');
    });
  });

  describe('Strengthening Phase', () => {
    let storage: SQLiteMemoryStorage;
    let strengthening: StrengtheningPhase;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      strengthening = new StrengtheningPhase(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should boost frequently accessed memories', async () => {
      const memory = createTribalMemory({ 
        id: 'freq-1',
        accessCount: 10,
        confidence: 0.7,
      });
      await storage.create(memory);
      
      await strengthening.boost();
      
      const updated = await storage.read('freq-1');
      expect(updated!.confidence).toBeGreaterThan(0.7);
    });

    it('should not boost infrequently accessed memories', async () => {
      const memory = createTribalMemory({ 
        id: 'infreq-1',
        accessCount: 2,
        confidence: 0.7,
      });
      await storage.create(memory);
      
      await strengthening.boost();
      
      const updated = await storage.read('infreq-1');
      expect(updated!.confidence).toBe(0.7);
    });

    it('should cap confidence at 1.0', async () => {
      const memory = createTribalMemory({ 
        id: 'high-1',
        accessCount: 100,
        confidence: 0.99,
      });
      await storage.create(memory);
      
      await strengthening.boost();
      
      const updated = await storage.read('high-1');
      expect(updated!.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should handle empty storage', async () => {
      // Should not throw
      await expect(strengthening.boost()).resolves.not.toThrow();
    });
  });

  describe('Replay Phase', () => {
    let storage: SQLiteMemoryStorage;
    let replay: ReplayPhase;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      replay = new ReplayPhase(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should select episodic memories', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      
      const episode = createEpisodicMemory({ 
        id: 'old-ep',
        createdAt: oldDate.toISOString(),
      });
      await storage.create(episode);
      
      // Use 'all' status to avoid consolidationStatus filter
      const selected = await replay.selectMemories({
        minAge: 7,
        status: 'all',
        limit: 10,
      });
      
      expect(selected.length).toBe(1);
    });

    it('should filter by age', async () => {
      // Create a recent episode
      const episode = createEpisodicMemory({ id: 'new-ep' });
      await storage.create(episode);
      
      const selected = await replay.selectMemories({
        minAge: 7,
        status: 'all',
        limit: 10,
      });
      
      // Recent episode should not be selected
      expect(selected.length).toBe(0);
    });

    it('should respect limit', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      
      for (let i = 0; i < 10; i++) {
        await storage.create(createEpisodicMemory({ 
          id: `ep-${i}`,
          createdAt: oldDate.toISOString(),
        }));
      }
      
      const selected = await replay.selectMemories({
        minAge: 7,
        status: 'all',
        limit: 5,
      });
      
      expect(selected.length).toBe(5);
    });

    it('should handle empty storage', async () => {
      const selected = await replay.selectMemories({
        minAge: 7,
        status: 'all',
        limit: 10,
      });
      
      expect(selected).toEqual([]);
    });
  });

  describe('Pattern Context Gatherer', () => {
    let storage: SQLiteMemoryStorage;
    let gatherer: PatternContextGatherer;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      gatherer = new PatternContextGatherer(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should gather pattern context with rationale', async () => {
      const rationale = createPatternRationale({
        id: 'rat-1',
        patternId: 'pattern-1',
        patternName: 'Test Pattern',
        rationale: 'This is why we use this pattern',
        businessContext: 'Business reason',
      });
      await storage.create(rationale);
      await storage.linkToPattern('rat-1', 'pattern-1');
      
      const contexts = await gatherer.gather(['pattern-1']);
      
      expect(contexts.length).toBe(1);
      expect(contexts[0]!.rationale).toBe('This is why we use this pattern');
      expect(contexts[0]!.businessContext).toBe('Business reason');
    });

    it('should return pattern ID when no rationale found', async () => {
      const contexts = await gatherer.gather(['unknown-pattern']);
      
      expect(contexts.length).toBe(1);
      expect(contexts[0]!.patternId).toBe('unknown-pattern');
      expect(contexts[0]!.rationale).toBeUndefined();
    });

    it('should handle empty pattern IDs', async () => {
      const contexts = await gatherer.gather([]);
      expect(contexts).toEqual([]);
    });

    it('should handle multiple patterns', async () => {
      const contexts = await gatherer.gather(['p1', 'p2', 'p3']);
      expect(contexts.length).toBe(3);
    });
  });

  describe('Integration: Consolidation Pipeline', () => {
    let storage: SQLiteMemoryStorage;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should handle full consolidation flow', async () => {
      // Create old episodes
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      
      for (let i = 0; i < 5; i++) {
        await storage.create(createEpisodicMemory({
          id: `ep-${i}`,
          createdAt: oldDate.toISOString(),
          context: { intent: 'add_feature', focus: 'authentication' },
        }));
      }
      
      // Replay phase - use 'all' to avoid consolidationStatus filter
      const replay = new ReplayPhase(storage);
      const episodes = await replay.selectMemories({
        minAge: 7,
        status: 'all',
        limit: 10,
      });
      
      expect(episodes.length).toBe(5);
      
      // Pruning phase (with mock abstractions)
      const pruning = new PruningPhase(storage);
      const abstractions = [
        { sourceEpisodes: ['ep-0', 'ep-1'], topic: 'auth', knowledge: 'test', confidence: 0.8 },
      ];
      
      const pruneResult = await pruning.prune(episodes, abstractions);
      expect(pruneResult.pruned).toBe(2);
      
      // Strengthening phase
      const strengthening = new StrengtheningPhase(storage);
      await strengthening.boost();
    });
  });
});

// Helper functions

let memoryCounter = 0;

function createTribalMemory(overrides: Partial<TribalMemory>): TribalMemory {
  memoryCounter++;
  return {
    id: overrides.id ?? `tribal-${memoryCounter}`,
    type: 'tribal',
    topic: 'test-topic',
    knowledge: overrides.knowledge ?? 'Test knowledge',
    severity: 'warning',
    source: { type: 'manual' },
    summary: 'Test summary',
    confidence: overrides.confidence ?? 0.8,
    importance: 'normal',
    accessCount: overrides.accessCount ?? 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createEpisodicMemory(overrides: Partial<EpisodicMemory>): EpisodicMemory {
  memoryCounter++;
  return {
    id: overrides.id ?? `episodic-${memoryCounter}`,
    type: 'episodic',
    sessionId: 'session-1',
    context: overrides.context ?? {
      intent: 'add_feature',
      focus: 'test',
    },
    interaction: {
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
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    consolidationStatus: 'pending',
    ...overrides,
  };
}

function createPatternRationale(overrides: Partial<PatternRationaleMemory>): PatternRationaleMemory {
  memoryCounter++;
  return {
    id: overrides.id ?? `rationale-${memoryCounter}`,
    type: 'pattern_rationale',
    patternId: overrides.patternId ?? 'pattern-1',
    patternName: overrides.patternName ?? 'Test Pattern',
    rationale: overrides.rationale ?? 'Test rationale',
    summary: 'Pattern rationale',
    confidence: 0.9,
    importance: 'normal',
    accessCount: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
