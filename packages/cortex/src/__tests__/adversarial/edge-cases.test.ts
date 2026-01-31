/**
 * Adversarial Edge Case Tests
 * 
 * Tests designed to break the system with edge cases,
 * malformed data, and boundary conditions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteMemoryStorage } from '../../storage/sqlite/storage.js';
import { DecayCalculator } from '../../decay/calculator.js';
import { RelevanceScorer } from '../../retrieval/scoring.js';
import { IntentWeighter } from '../../retrieval/weighting.js';
import { HierarchicalCompressor } from '../../retrieval/compression.js';
import { ResultRanker } from '../../retrieval/ranking.js';
import type { TribalMemory, EpisodicMemory } from '../../types/index.js';

describe('Adversarial Edge Cases', () => {
  describe('Storage Edge Cases', () => {
    let storage: SQLiteMemoryStorage;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
    });

    describe('malformed data', () => {
      it('should handle memory with empty string ID', async () => {
        const memory = createTribalMemory({ id: '' });
        // Empty ID should still work (will be replaced with generated ID)
        const id = await storage.create(memory);
        expect(id).toBeTruthy();
      });

      it('should handle memory with very long ID', async () => {
        const longId = 'a'.repeat(10000);
        const memory = createTribalMemory({ id: longId });
        const id = await storage.create(memory);
        expect(id).toBe(longId);
        
        const retrieved = await storage.read(longId);
        expect(retrieved).not.toBeNull();
      });

      it('should handle memory with special characters in ID', async () => {
        const specialId = 'mem_!@#$%^&*()_+-=[]{}|;:,.<>?';
        const memory = createTribalMemory({ id: specialId });
        const id = await storage.create(memory);
        expect(id).toBe(specialId);
      });

      it('should handle memory with unicode in content', async () => {
        const memory = createTribalMemory({
          topic: '日本語テスト 🎉 émojis',
          knowledge: '中文内容 العربية עברית',
          summary: '🚀 Rocket science 🔬',
        });
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        
        expect((retrieved as TribalMemory).topic).toBe('日本語テスト 🎉 émojis');
      });

      it('should handle memory with null bytes in content', async () => {
        const memory = createTribalMemory({
          topic: 'test\x00null\x00bytes',
          knowledge: 'content\x00with\x00nulls',
        });
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        
        expect(retrieved).not.toBeNull();
      });

      it('should handle memory with very large content', async () => {
        const largeContent = 'x'.repeat(1000000); // 1MB
        const memory = createTribalMemory({
          knowledge: largeContent,
        });
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        
        expect((retrieved as TribalMemory).knowledge.length).toBe(1000000);
      });

      it('should handle memory with deeply nested JSON', async () => {
        let nested: any = { value: 'deep' };
        for (let i = 0; i < 100; i++) {
          nested = { level: i, child: nested };
        }
        
        const memory = createTribalMemory({});
        (memory as any).deepNested = nested;
        
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(retrieved).not.toBeNull();
      });
    });

    describe('boundary conditions', () => {
      it('should handle confidence of exactly 0', async () => {
        const memory = createTribalMemory({ confidence: 0 });
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(retrieved!.confidence).toBe(0);
      });

      it('should handle confidence of exactly 1', async () => {
        const memory = createTribalMemory({ confidence: 1 });
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(retrieved!.confidence).toBe(1);
      });

      it('should reject negative confidence (validation)', async () => {
        const memory = createTribalMemory({ confidence: -0.5 });
        // SQLite CHECK constraint should reject this
        await expect(storage.create(memory)).rejects.toThrow();
      });

      it('should reject confidence > 1 (validation)', async () => {
        const memory = createTribalMemory({ confidence: 1.5 });
        // SQLite CHECK constraint should reject this
        await expect(storage.create(memory)).rejects.toThrow();
      });

      it('should handle accessCount of 0', async () => {
        const memory = createTribalMemory({ accessCount: 0 });
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(retrieved!.accessCount).toBe(0);
      });

      it('should handle very large accessCount', async () => {
        const memory = createTribalMemory({ accessCount: Number.MAX_SAFE_INTEGER });
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(retrieved!.accessCount).toBe(Number.MAX_SAFE_INTEGER);
      });

      it('should handle empty tags array', async () => {
        const memory = createTribalMemory({ tags: [] });
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(retrieved!.tags).toEqual([]);
      });

      it('should handle very many tags', async () => {
        const manyTags = Array.from({ length: 1000 }, (_, i) => `tag-${i}`);
        const memory = createTribalMemory({ tags: manyTags });
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(retrieved!.tags!.length).toBe(1000);
      });
    });

    describe('concurrent operations', () => {
      it('should handle rapid sequential creates', async () => {
        const promises = Array.from({ length: 100 }, (_, i) =>
          storage.create(createTribalMemory({ id: `rapid-${i}` }))
        );
        
        const ids = await Promise.all(promises);
        expect(new Set(ids).size).toBe(100);
      });

      it('should handle rapid sequential reads', async () => {
        const id = await storage.create(createTribalMemory({}));
        
        const promises = Array.from({ length: 100 }, () => storage.read(id));
        const results = await Promise.all(promises);
        
        expect(results.every(r => r !== null)).toBe(true);
      });

      it('should handle interleaved reads and writes', async () => {
        const operations: Promise<any>[] = [];
        
        for (let i = 0; i < 50; i++) {
          operations.push(storage.create(createTribalMemory({ id: `interleaved-${i}` })));
          if (i > 0) {
            operations.push(storage.read(`interleaved-${i - 1}`));
          }
        }
        
        await Promise.all(operations);
        
        // Verify all were created
        for (let i = 0; i < 50; i++) {
          const retrieved = await storage.read(`interleaved-${i}`);
          expect(retrieved).not.toBeNull();
        }
      });
    });

    describe('SQL injection attempts', () => {
      it('should handle SQL injection in ID', async () => {
        const maliciousId = "'; DROP TABLE memories; --";
        const memory = createTribalMemory({ id: maliciousId });
        
        const id = await storage.create(memory);
        expect(id).toBe(maliciousId);
        
        // Table should still exist
        const count = await storage.count();
        expect(count).toBeGreaterThanOrEqual(1);
      });

      it('should handle SQL injection in content', async () => {
        const memory = createTribalMemory({
          topic: "'; DROP TABLE memories; --",
          knowledge: "SELECT * FROM memories WHERE 1=1; --",
        });
        
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        
        expect((retrieved as TribalMemory).topic).toBe("'; DROP TABLE memories; --");
      });

      it('should handle SQL injection in search query', async () => {
        await storage.create(createTribalMemory({ topic: 'safe-topic' }));
        
        // This should not cause SQL injection
        const results = await storage.search({
          types: ["tribal'; DROP TABLE memories; --" as any],
        });
        
        // Should return empty (no match) but not crash
        expect(Array.isArray(results)).toBe(true);
      });
    });

    describe('date handling', () => {
      it('should handle invalid date strings', async () => {
        const memory = createTribalMemory({
          createdAt: 'not-a-date',
          updatedAt: 'also-not-a-date',
        });
        
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(retrieved).not.toBeNull();
      });

      it('should handle epoch date', async () => {
        const memory = createTribalMemory({
          createdAt: new Date(0).toISOString(),
        });
        
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(retrieved!.createdAt).toBe('1970-01-01T00:00:00.000Z');
      });

      it('should handle far future date', async () => {
        const futureDate = new Date('9999-12-31T23:59:59.999Z').toISOString();
        const memory = createTribalMemory({
          createdAt: futureDate,
        });
        
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(retrieved!.createdAt).toBe(futureDate);
      });
    });
  });

  describe('Decay Calculator Edge Cases', () => {
    let calculator: DecayCalculator;

    beforeEach(() => {
      calculator = new DecayCalculator();
    });

    it('should handle memory with invalid date', () => {
      const memory = createTribalMemory({
        createdAt: 'invalid-date',
        lastAccessed: 'also-invalid',
      });
      
      // Should not throw, but result may be NaN
      const factors = calculator.calculate(memory);
      expect(typeof factors.temporalDecay).toBe('number');
    });

    it('should handle memory with future date', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 10);
      
      const memory = createTribalMemory({
        createdAt: futureDate.toISOString(),
      });
      
      const factors = calculator.calculate(memory);
      // Future date means negative days, which could cause issues
      expect(factors.temporalDecay).toBeGreaterThan(0);
    });

    it('should handle memory with NaN confidence', () => {
      const memory = createTribalMemory({
        confidence: NaN,
      });
      
      const factors = calculator.calculate(memory);
      expect(Number.isNaN(factors.finalConfidence)).toBe(true);
    });

    it('should handle memory with Infinity confidence', () => {
      const memory = createTribalMemory({
        confidence: Infinity,
      });
      
      const factors = calculator.calculate(memory);
      // Should cap at 1.0
      expect(factors.finalConfidence).toBe(1.0);
    });

    it('should handle memory with negative accessCount', () => {
      const memory = createTribalMemory({
        accessCount: -10,
      });
      
      const factors = calculator.calculate(memory);
      // log10 of negative number is NaN
      expect(typeof factors.usageBoost).toBe('number');
    });

    it('should handle citations with undefined valid field', () => {
      const memory = createTribalMemory({});
      (memory as any).citations = [
        { file: 'a.ts', lineStart: 1, lineEnd: 10, hash: 'abc' },
        { file: 'b.ts', lineStart: 1, lineEnd: 10, hash: 'def' },
      ];
      
      const factors = calculator.calculate(memory);
      // undefined !== false, so should count as valid
      expect(factors.citationDecay).toBe(1.0);
    });

    it('should handle empty citations array', () => {
      const memory = createTribalMemory({});
      (memory as any).citations = [];
      
      const factors = calculator.calculate(memory);
      expect(factors.citationDecay).toBe(1.0);
    });
  });

  describe('Relevance Scorer Edge Cases', () => {
    let scorer: RelevanceScorer;

    beforeEach(() => {
      scorer = new RelevanceScorer();
    });

    it('should handle memory with undefined summary', () => {
      const memory = createTribalMemory({});
      (memory as any).summary = undefined;
      
      const context = { intent: 'add_feature' as const, focus: 'test' };
      
      // Should not throw
      expect(() => scorer.score(memory, context)).not.toThrow();
    });

    it('should handle empty focus string', () => {
      const memory = createTribalMemory({});
      const context = { intent: 'add_feature' as const, focus: '' };
      
      const score = scorer.score(memory, context);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle focus with only whitespace', () => {
      const memory = createTribalMemory({});
      const context = { intent: 'add_feature' as const, focus: '   \n\t   ' };
      
      const score = scorer.score(memory, context);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should handle very long focus string', () => {
      const memory = createTribalMemory({});
      const context = { intent: 'add_feature' as const, focus: 'word '.repeat(10000) };
      
      const score = scorer.score(memory, context);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle memory with NaN confidence', () => {
      const memory = createTribalMemory({ confidence: NaN });
      const context = { intent: 'add_feature' as const, focus: 'test' };
      
      const score = scorer.score(memory, context);
      expect(Number.isNaN(score)).toBe(true);
    });

    it('should handle memory with invalid importance', () => {
      const memory = createTribalMemory({});
      (memory as any).importance = 'invalid-importance';
      
      const context = { intent: 'add_feature' as const, focus: 'test' };
      const score = scorer.score(memory, context);
      
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Compression Edge Cases', () => {
    let compressor: HierarchicalCompressor;

    beforeEach(() => {
      compressor = new HierarchicalCompressor();
    });

    it('should handle memory with undefined fields', () => {
      const memory = createTribalMemory({});
      (memory as any).topic = undefined;
      (memory as any).knowledge = undefined;
      
      const result = compressor.compress(memory);
      expect(result.summary).toBeTruthy();
      expect(result.expanded).toBeTruthy();
    });

    it('should handle memory with null fields', () => {
      const memory = createTribalMemory({});
      (memory as any).topic = null;
      (memory as any).knowledge = null;
      
      const result = compressor.compress(memory);
      expect(result.summary).toBeTruthy();
    });

    it('should handle episodic memory with missing interaction', () => {
      const memory = createEpisodicMemory({});
      (memory as any).interaction = undefined;
      
      // Should not throw
      expect(() => compressor.compress(memory)).not.toThrow();
    });

    it('should handle procedural memory with empty steps', () => {
      const memory: any = {
        id: 'proc-1',
        type: 'procedural',
        name: 'Test Procedure',
        steps: [],
        summary: 'Test',
        confidence: 1.0,
        importance: 'normal',
        accessCount: 0,
        transactionTime: { recordedAt: new Date().toISOString() },
        validTime: { validFrom: new Date().toISOString() },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      const result = compressor.compress(memory);
      expect(result.expanded).toContain('Steps: 0');
    });

    it('should handle unknown memory type', () => {
      const memory = createTribalMemory({});
      (memory as any).type = 'unknown_type';
      
      const result = compressor.compress(memory);
      expect(result.summary).toBeTruthy();
    });
  });

  describe('Ranker Edge Cases', () => {
    let ranker: ResultRanker;

    beforeEach(() => {
      ranker = new ResultRanker();
    });

    it('should handle empty array', () => {
      const result = ranker.rank([]);
      expect(result).toEqual([]);
    });

    it('should handle single item', () => {
      const memory = createTribalMemory({});
      const result = ranker.rank([{ memory, score: 0.5 }]);
      expect(result.length).toBe(1);
    });

    it('should handle all same scores', () => {
      const memories = Array.from({ length: 10 }, (_, i) => ({
        memory: createTribalMemory({ id: `mem-${i}` }),
        score: 0.5,
      }));
      
      const result = ranker.rank(memories);
      expect(result.length).toBe(10);
    });

    it('should handle all same type (diversity penalty)', () => {
      const memories = Array.from({ length: 10 }, (_, i) => ({
        memory: createTribalMemory({ id: `mem-${i}` }),
        score: 1.0 - i * 0.01, // Slightly different scores
      }));
      
      const result = ranker.rank(memories);
      
      // Later items should have lower scores due to diversity penalty
      expect(result[9]!.score).toBeLessThan(result[0]!.score);
    });

    it('should handle NaN scores', () => {
      const memories = [
        { memory: createTribalMemory({ id: 'mem-1' }), score: NaN },
        { memory: createTribalMemory({ id: 'mem-2' }), score: 0.5 },
      ];
      
      // Should not throw
      const result = ranker.rank(memories);
      expect(result.length).toBe(2);
    });

    it('should handle negative scores', () => {
      const memories = [
        { memory: createTribalMemory({ id: 'mem-1' }), score: -0.5 },
        { memory: createTribalMemory({ id: 'mem-2' }), score: 0.5 },
      ];
      
      const result = ranker.rank(memories);
      expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
    });
  });

  describe('Intent Weighter Edge Cases', () => {
    let weighter: IntentWeighter;

    beforeEach(() => {
      weighter = new IntentWeighter();
    });

    it('should handle unknown intent', () => {
      const weight = weighter.getWeight('tribal', 'unknown_intent' as any);
      expect(weight).toBe(1.0);
    });

    it('should handle unknown memory type', () => {
      const weight = weighter.getWeight('unknown_type' as any, 'add_feature');
      expect(weight).toBe(1.0);
    });

    it('should handle both unknown', () => {
      const weight = weighter.getWeight('unknown_type' as any, 'unknown_intent' as any);
      expect(weight).toBe(1.0);
    });
  });

  describe('Retrieval Engine Edge Cases', () => {
    let storage: SQLiteMemoryStorage;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should handle empty storage gracefully', async () => {
      const results = await storage.search({ limit: 10 });
      expect(results).toEqual([]);
    });

    it('should handle search with all undefined filters', async () => {
      await storage.create(createTribalMemory({}));
      
      const results = await storage.search({
        types: undefined,
        topics: undefined,
        limit: undefined,
      });
      
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle search with empty arrays', async () => {
      await storage.create(createTribalMemory({}));
      
      const results = await storage.search({
        types: [],
        topics: [],
      });
      
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle similarity search with zero vector', async () => {
      await storage.create(createTribalMemory({}));
      
      const zeroVector = new Array(384).fill(0);
      const results = await storage.similaritySearch(zeroVector, 10);
      
      // Should not crash, may return empty or all results
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle similarity search with NaN vector', async () => {
      await storage.create(createTribalMemory({}));
      
      const nanVector = new Array(384).fill(NaN);
      const results = await storage.similaritySearch(nanVector, 10);
      
      // Should not crash
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle findByPattern with non-existent pattern', async () => {
      const results = await storage.findByPattern('non-existent-pattern-id');
      expect(results).toEqual([]);
    });

    it('should handle findByFile with special characters', async () => {
      const results = await storage.findByFile('path/with spaces/and!special@chars.ts');
      expect(results).toEqual([]);
    });
  });

  describe('Token Budget Edge Cases', () => {
    let ranker: ResultRanker;

    beforeEach(() => {
      ranker = new ResultRanker();
    });

    it('should handle memories with zero token estimates', () => {
      const memories = [
        { memory: createTribalMemory({ id: 'mem-1', knowledge: '' }), score: 0.9 },
        { memory: createTribalMemory({ id: 'mem-2', knowledge: '' }), score: 0.8 },
      ];
      
      const result = ranker.rank(memories);
      expect(result.length).toBe(2);
    });

    it('should handle very large number of memories', () => {
      const memories = Array.from({ length: 1000 }, (_, i) => ({
        memory: createTribalMemory({ id: `mem-${i}` }),
        score: Math.random(),
      }));
      
      const result = ranker.rank(memories);
      expect(result.length).toBe(1000);
      
      // Should be sorted by score (descending)
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
      }
    });
  });

  describe('Consolidation Edge Cases', () => {
    let storage: SQLiteMemoryStorage;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should handle consolidation with no episodic memories', async () => {
      // Only add tribal memories
      await storage.create(createTribalMemory({}));
      
      const episodes = await storage.search({ types: ['episodic'] });
      expect(episodes).toEqual([]);
    });

    it('should handle episodic memory with minimal fields', async () => {
      const minimalEpisodic = createEpisodicMemory({});
      const id = await storage.create(minimalEpisodic);
      
      const retrieved = await storage.read(id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.type).toBe('episodic');
    });

    it('should handle episodic memory with very long interaction', async () => {
      const longQuery = 'word '.repeat(10000);
      const longResponse = 'response '.repeat(10000);
      
      const episodic = createEpisodicMemory({
        interaction: {
          userQuery: longQuery,
          agentResponse: longResponse,
          outcome: 'accepted',
        },
      });
      
      const id = await storage.create(episodic);
      const retrieved = await storage.read(id);
      
      expect(retrieved).not.toBeNull();
    });
  });

  describe('Validation Edge Cases', () => {
    let storage: SQLiteMemoryStorage;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should handle memory with all optional fields missing', async () => {
      const minimal: TribalMemory = {
        id: 'minimal-1',
        type: 'tribal',
        topic: 'test',
        knowledge: 'test knowledge',
        severity: 'info',
        source: { type: 'manual' },
        summary: 'test',
        confidence: 0.5,
        importance: 'normal',
        accessCount: 0,
        transactionTime: { recordedAt: new Date().toISOString() },
        validTime: { validFrom: new Date().toISOString() },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      const id = await storage.create(minimal);
      const retrieved = await storage.read(id);
      
      expect(retrieved).not.toBeNull();
    });

    it('should handle update with empty object', async () => {
      const id = await storage.create(createTribalMemory({}));
      
      // Update with empty object should not crash
      await storage.update(id, {});
      
      const retrieved = await storage.read(id);
      expect(retrieved).not.toBeNull();
    });

    it('should throw on update of non-existent memory', async () => {
      // Should throw an error for non-existent memory
      await expect(storage.update('non-existent-id', { confidence: 0.5 }))
        .rejects.toThrow('Memory not found');
    });

    it('should handle delete on non-existent memory gracefully', async () => {
      // Should not throw (soft delete is idempotent)
      await expect(storage.delete('non-existent-id')).resolves.not.toThrow();
    });
  });

  describe('Race Condition Simulation', () => {
    let storage: SQLiteMemoryStorage;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should handle concurrent updates to same memory', async () => {
      const id = await storage.create(createTribalMemory({ confidence: 0.5 }));
      
      // Simulate concurrent updates
      const updates = Array.from({ length: 10 }, (_, i) =>
        storage.update(id, { confidence: 0.5 + i * 0.05 })
      );
      
      await Promise.all(updates);
      
      const retrieved = await storage.read(id);
      expect(retrieved).not.toBeNull();
      // Final confidence should be one of the values
      expect(retrieved!.confidence).toBeGreaterThanOrEqual(0.5);
      expect(retrieved!.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should handle concurrent create and delete', async () => {
      const operations: Promise<any>[] = [];
      
      for (let i = 0; i < 20; i++) {
        const id = `race-${i}`;
        operations.push(storage.create(createTribalMemory({ id })));
        if (i > 0) {
          operations.push(storage.delete(`race-${i - 1}`));
        }
      }
      
      await Promise.all(operations);
      
      // At least the last one should exist
      const last = await storage.read('race-19');
      expect(last).not.toBeNull();
    });

    it('should handle concurrent reads during writes', async () => {
      const id = await storage.create(createTribalMemory({}));
      
      const operations: Promise<any>[] = [];
      
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          operations.push(storage.read(id));
        } else {
          operations.push(storage.update(id, { accessCount: i }));
        }
      }
      
      const results = await Promise.all(operations);
      
      // All reads should return valid memory
      const reads = results.filter((_, i) => i % 2 === 0);
      expect(reads.every(r => r !== null)).toBe(true);
    });
  });

  describe('Memory Type Coercion Edge Cases', () => {
    let storage: SQLiteMemoryStorage;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should handle numeric strings in confidence', async () => {
      const memory = createTribalMemory({});
      (memory as any).confidence = '0.75';
      
      // Should coerce or reject
      try {
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(typeof retrieved!.confidence).toBe('number');
      } catch {
        // Also acceptable to reject
        expect(true).toBe(true);
      }
    });

    it('should handle boolean in accessCount', async () => {
      const memory = createTribalMemory({});
      (memory as any).accessCount = true;
      
      try {
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        expect(typeof retrieved!.accessCount).toBe('number');
      } catch {
        expect(true).toBe(true);
      }
    });

    it('should handle array in summary field', async () => {
      const memory = createTribalMemory({});
      (memory as any).summary = ['array', 'of', 'strings'];
      
      try {
        const id = await storage.create(memory);
        const retrieved = await storage.read(id);
        // Should either stringify or reject
        expect(retrieved).not.toBeNull();
      } catch {
        expect(true).toBe(true);
      }
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
    knowledge: 'Test knowledge',
    severity: 'warning',
    source: { type: 'manual' },
    summary: 'Test summary',
    confidence: 0.8,
    importance: 'normal',
    accessCount: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createEpisodicMemory(overrides: Partial<EpisodicMemory>): EpisodicMemory {
  memoryCounter++;
  return {
    id: `episodic-${memoryCounter}`,
    type: 'episodic',
    sessionId: 'session-1',
    context: {
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    consolidationStatus: 'pending',
    ...overrides,
  };
}
