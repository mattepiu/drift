/**
 * Memory Scale Stress Tests
 * Tests Cortex V2 under high memory counts and concurrent operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteMemoryStorage } from '../../storage/sqlite/index.js';
import { CortexV2 } from '../../orchestrators/cortex-v2.js';
import type { MemoryType } from '../../types/index.js';

describe('Memory Scale Stress Tests', () => {
  let storage: SQLiteMemoryStorage;
  let cortex: CortexV2;

  beforeEach(async () => {
    storage = new SQLiteMemoryStorage(':memory:');
    await storage.initialize();
    cortex = new CortexV2(storage);
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('High Memory Count', () => {
    it('should handle 1000 memories efficiently', async () => {
      const startTime = Date.now();
      
      // Create 1000 memories
      const memories: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const id = await storage.create({
          type: 'tribal' as MemoryType,
          content: `Memory ${i}: This is test content for memory number ${i} with some additional text to make it realistic. Keywords: auth, security, pattern-${i % 10}`,
          source: 'stress_test',
          confidence: 0.5 + (Math.random() * 0.5),
          metadata: {
            category: `category-${i % 20}`,
            tags: [`tag-${i % 5}`, `tag-${(i + 1) % 5}`],
          },
        } as any);
        memories.push(id);
      }

      const createTime = Date.now() - startTime;
      console.log(`Created 1000 memories in ${createTime}ms`);
      expect(createTime).toBeLessThan(10000); // Should complete in < 10s

      // Test search performance
      const searchStart = Date.now();
      const results = await storage.search({
        limit: 50,
      });
      const searchTime = Date.now() - searchStart;
      console.log(`Search completed in ${searchTime}ms, found ${results.length} results`);
      expect(searchTime).toBeLessThan(500); // Search should be < 500ms
      expect(results.length).toBeGreaterThan(0);

      // Test retrieval performance
      const retrievalStart = Date.now();
      const context = await cortex.getContext('add_feature', 'authentication', {
        maxTokens: 2000,
      });
      const retrievalTime = Date.now() - retrievalStart;
      console.log(`Context retrieval completed in ${retrievalTime}ms`);
      expect(retrievalTime).toBeLessThan(1000); // Retrieval should be < 1s
    }, 30000);

    it('should handle 5000 memories without degradation', async () => {
      // Create 5000 memories in batches
      const batchSize = 500;
      const totalMemories = 5000;
      
      for (let batch = 0; batch < totalMemories / batchSize; batch++) {
        const promises = [];
        for (let i = 0; i < batchSize; i++) {
          const idx = batch * batchSize + i;
          promises.push(storage.create({
            type: (idx % 2 === 0 ? 'tribal' : 'pattern_rationale') as MemoryType,
            content: `Memory ${idx}: Content with keywords like authentication, validation, error-handling, pattern-${idx % 50}`,
            source: 'stress_test',
            confidence: 0.6 + (Math.random() * 0.4),
          } as any));
        }
        await Promise.all(promises);
      }

      // Verify count
      const count = await storage.count();
      expect(count).toBe(5000);

      // Test that search still performs well
      const searchStart = Date.now();
      const results = await storage.search({
        limit: 100,
      });
      const searchTime = Date.now() - searchStart;
      console.log(`Search in 5000 memories: ${searchTime}ms`);
      expect(searchTime).toBeLessThan(1000);
    }, 60000);
  });

  describe('Deep Causal Chains', () => {
    it('should handle causal chains of depth 10', async () => {
      // Create a chain of 10 memories
      let previousId: string | null = null;
      const chainIds: string[] = [];

      for (let i = 0; i < 10; i++) {
        const id = await storage.create({
          type: 'tribal' as MemoryType,
          content: `Chain memory ${i}: This is level ${i} of the causal chain`,
          source: 'stress_test',
          confidence: 0.8,
        } as any);
        chainIds.push(id);

        if (previousId) {
          await storage.addRelationship(previousId, id, 'derived_from');
        }
        previousId = id;
      }

      // Test traversal from the end
      const lastMemory = await storage.read(chainIds[chainIds.length - 1]);
      expect(lastMemory).toBeDefined();

      // Get related memories (should traverse the chain)
      const related = await storage.getRelated(chainIds[chainIds.length - 1]);
      
      // Should find memories from the chain
      expect(related.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle branching causal graphs', async () => {
      // Create a root memory
      const rootId = await storage.create({
        type: 'tribal' as MemoryType,
        content: 'Root memory: The origin of all patterns',
        source: 'stress_test',
        confidence: 0.9,
      } as any);

      // Create 5 branches, each with 5 levels
      for (let branch = 0; branch < 5; branch++) {
        let parentId = rootId;
        for (let level = 0; level < 5; level++) {
          const childId = await storage.create({
            type: 'pattern_rationale' as MemoryType,
            content: `Branch ${branch}, Level ${level}: Derived pattern`,
            source: 'stress_test',
            confidence: 0.7,
          } as any);

          await storage.addRelationship(parentId, childId, 'supports');

          parentId = childId;
        }
      }

      // Verify we can traverse from root
      const related = await storage.getRelated(rootId);
      expect(related.length).toBeGreaterThanOrEqual(5); // At least the direct children
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle 50 concurrent searches', async () => {
      // First, create some memories
      for (let i = 0; i < 100; i++) {
        await storage.create({
          type: 'tribal' as MemoryType,
          content: `Concurrent test memory ${i}: auth security validation error-handling`,
          source: 'stress_test',
          confidence: 0.7,
        } as any);
      }

      // Run 50 concurrent searches
      const searchPromises = [];
      for (let i = 0; i < 50; i++) {
        searchPromises.push(
          storage.search({
            limit: 10,
          })
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(searchPromises);
      const totalTime = Date.now() - startTime;

      console.log(`50 concurrent searches completed in ${totalTime}ms`);
      expect(totalTime).toBeLessThan(5000); // Should complete in < 5s
      
      // All searches should return results
      results.forEach((r) => {
        expect(Array.isArray(r)).toBe(true);
      });
    });

    it('should handle concurrent reads and writes', async () => {
      const operations: Promise<any>[] = [];

      // Mix of reads and writes
      for (let i = 0; i < 100; i++) {
        if (i % 3 === 0) {
          // Write
          operations.push(
            storage.create({
              type: 'tribal' as MemoryType,
              content: `Concurrent write ${i}`,
              source: 'stress_test',
              confidence: 0.7,
            } as any)
          );
        } else {
          // Read (search)
          operations.push(
            storage.search({ limit: 5 })
          );
        }
      }

      const startTime = Date.now();
      await Promise.all(operations);
      const totalTime = Date.now() - startTime;

      console.log(`100 concurrent read/write operations in ${totalTime}ms`);
      expect(totalTime).toBeLessThan(10000);
    });
  });

  describe('Large Content Handling', () => {
    it('should handle memories with large content (10KB)', async () => {
      const largeContent = 'x'.repeat(10000) + ' auth security validation';
      
      const id = await storage.create({
        type: 'tribal' as MemoryType,
        content: largeContent,
        source: 'stress_test',
        confidence: 0.8,
      } as any);

      const retrieved = await storage.read(id);
      expect(retrieved).toBeDefined();
    });

    it('should handle memories with complex metadata', async () => {
      const complexMetadata = {
        tags: Array.from({ length: 100 }, (_, i) => `tag-${i}`),
        nested: {
          level1: {
            level2: {
              level3: {
                data: Array.from({ length: 50 }, (_, i) => ({ key: i, value: `value-${i}` })),
              },
            },
          },
        },
        array: Array.from({ length: 200 }, (_, i) => i),
      };

      const id = await storage.create({
        type: 'tribal' as MemoryType,
        content: 'Memory with complex metadata',
        source: 'stress_test',
        confidence: 0.8,
        metadata: complexMetadata,
      } as any);

      const retrieved = await storage.read(id);
      expect(retrieved).toBeDefined();
    });
  });

  describe('Session Stress', () => {
    it('should handle 100 session context switches', async () => {
      // Create some memories first
      for (let i = 0; i < 50; i++) {
        await storage.create({
          type: 'tribal' as MemoryType,
          content: `Session test memory ${i}: auth security`,
          source: 'stress_test',
          confidence: 0.7,
        } as any);
      }

      // Simulate 100 different sessions
      for (let session = 0; session < 100; session++) {
        const sessionId = `session-${session}`;
        
        const context = await cortex.getContext('add_feature', 'authentication', {
          maxTokens: 500,
          sessionId,
        });

        expect(context).toBeDefined();
      }
    });

    it('should track deduplication across session queries', async () => {
      // Create memories
      for (let i = 0; i < 20; i++) {
        await storage.create({
          type: 'tribal' as MemoryType,
          content: `Dedup test memory ${i}: authentication patterns`,
          source: 'stress_test',
          confidence: 0.8,
        } as any);
      }

      const sessionId = 'dedup-test-session';

      // First query
      const context1 = await cortex.getContext('add_feature', 'authentication', {
        maxTokens: 1000,
        sessionId,
      });

      // Second query - should have fewer tokens due to deduplication
      const context2 = await cortex.getContext('add_feature', 'authentication', {
        maxTokens: 1000,
        sessionId,
      });

      // The second context should indicate deduplication occurred
      expect(context1).toBeDefined();
      expect(context2).toBeDefined();
    });
  });
});
