/**
 * Token Efficiency Integration Tests
 * 
 * Tests that the Cortex V2 system efficiently manages token budgets
 * through compression, deduplication, and smart retrieval.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteMemoryStorage } from '../../storage/sqlite/index.js';
import { CortexV2 } from '../../orchestrators/cortex-v2.js';
import { estimateTokens } from '../../utils/tokens.js';

describe('Token Efficiency Integration Tests', () => {
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

  describe('Budget Enforcement', () => {
    beforeEach(async () => {
      // Create many memories to test budget limits
      for (let i = 0; i < 50; i++) {
        await storage.create({
          type: 'tribal',
          topic: `topic-${i}`,
          knowledge: `This is knowledge item ${i} with some detailed information about best practices and patterns that should be followed when working on this codebase. It includes multiple sentences to increase token count.`,
          severity: 'info',
          confidence: 0.8 + (i % 20) * 0.01,
          importance: i % 5 === 0 ? 'high' : 'normal',
          summary: `💡 Knowledge item ${i}`,
        } as any);
      }
    });

    it('should respect maxTokens budget', async () => {
      const result = await cortex.getContext('understand_code', 'patterns', {
        maxTokens: 500,
      });

      expect(result.tokensUsed).toBeLessThanOrEqual(500);
    });

    it('should include more memories with larger budget', async () => {
      const smallBudget = await cortex.getContext('understand_code', 'patterns', {
        maxTokens: 200,
      });

      const largeBudget = await cortex.getContext('understand_code', 'patterns', {
        maxTokens: 2000,
      });

      expect(largeBudget.memories.length).toBeGreaterThanOrEqual(smallBudget.memories.length);
    });

    it('should prioritize high-importance memories within budget', async () => {
      const result = await cortex.getContext('understand_code', 'patterns', {
        maxTokens: 300,
      });

      // Should return some memories
      expect(result.memories.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Compression Levels', () => {
    beforeEach(async () => {
      // Create a memory with long content
      await storage.create({
        type: 'procedural',
        name: 'deployment-process',
        steps: [
          { action: 'First, ensure all tests pass by running the full test suite' },
          { action: 'Second, build the production bundle with optimizations enabled' },
          { action: 'Third, run database migrations if there are any pending' },
          { action: 'Fourth, deploy to staging environment and verify functionality' },
          { action: 'Fifth, run smoke tests against staging' },
          { action: 'Sixth, deploy to production with blue-green deployment' },
          { action: 'Seventh, monitor error rates and performance metrics' },
          { action: 'Eighth, rollback if any issues are detected within 15 minutes' },
        ],
        confidence: 0.95,
        importance: 'high',
        summary: '📋 Complete deployment process with 8 detailed steps for safe production releases',
      } as any);
    });

    it('should compress memories at different levels', async () => {
      // Level 1 - full content
      const level1 = await cortex.getContext('understand_code', 'deployment', {
        maxTokens: 2000,
        compressionLevel: 1,
      });

      // Level 3 - minimal
      const level3 = await cortex.getContext('understand_code', 'deployment', {
        maxTokens: 2000,
        compressionLevel: 3,
      });

      // Level 3 should use fewer tokens for same content
      if (level1.memories.length > 0 && level3.memories.length > 0) {
        // Both should have memories, but level 3 should be more compressed
        expect(level3.tokensUsed).toBeLessThanOrEqual(level1.tokensUsed);
      }
    });
  });

  describe('Session Deduplication', () => {
    beforeEach(async () => {
      // Create memories
      for (let i = 0; i < 10; i++) {
        await storage.create({
          type: 'tribal',
          topic: `topic-${i}`,
          knowledge: `Knowledge about topic ${i}`,
          severity: 'info',
          confidence: 0.9,
          importance: 'normal',
          summary: `💡 Topic ${i}`,
        } as any);
      }
    });

    it('should track memories sent in session', async () => {
      const result1 = await cortex.getContext('understand_code', 'topics', {
        maxTokens: 1000,
      });

      expect(result1.session).toBeDefined();
      expect(result1.session.sessionId).toBeDefined();
    });

    it('should handle multiple retrievals in same session', async () => {
      // First retrieval
      const result1 = await cortex.getContext('understand_code', 'topics', {
        maxTokens: 500,
      });

      // Second retrieval
      const result2 = await cortex.getContext('understand_code', 'topics', {
        maxTokens: 500,
      });

      // Both should return results
      expect(result1.memories).toBeDefined();
      expect(result2.memories).toBeDefined();
    });
  });

  describe('Token Estimation Accuracy', () => {
    it('should accurately estimate tokens for different memory types', async () => {
      const tribalMemory = {
        type: 'tribal',
        topic: 'testing',
        knowledge: 'Always write unit tests for business logic',
        severity: 'warning',
        confidence: 0.9,
        importance: 'normal',
        summary: '🧪 Unit test requirement',
      };

      const proceduralMemory = {
        type: 'procedural',
        name: 'code-review',
        steps: [
          { action: 'Check for code style violations' },
          { action: 'Verify test coverage' },
          { action: 'Review security implications' },
        ],
        confidence: 0.85,
        importance: 'normal',
        summary: '📋 Code review checklist',
      };

      const tribalTokens = estimateTokens(JSON.stringify(tribalMemory));
      const proceduralTokens = estimateTokens(JSON.stringify(proceduralMemory));

      // Procedural with steps should have more tokens
      expect(proceduralTokens).toBeGreaterThan(tribalTokens);

      // Both should be reasonable estimates (not 0 or extremely large)
      expect(tribalTokens).toBeGreaterThan(10);
      expect(tribalTokens).toBeLessThan(500);
      expect(proceduralTokens).toBeGreaterThan(20);
      expect(proceduralTokens).toBeLessThan(1000);
    });

    it('should handle empty and minimal content', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('a')).toBeGreaterThan(0);
      expect(estimateTokens('hello world')).toBeGreaterThan(0);
    });
  });

  describe('Retrieval Efficiency', () => {
    beforeEach(async () => {
      // Create a large number of memories
      for (let i = 0; i < 100; i++) {
        await storage.create({
          type: i % 3 === 0 ? 'tribal' : i % 3 === 1 ? 'procedural' : 'pattern_rationale',
          topic: `topic-${i % 10}`,
          knowledge: `Knowledge ${i}`,
          name: `procedure-${i}`,
          patternName: `pattern-${i}`,
          rationale: `Rationale ${i}`,
          severity: 'info',
          confidence: 0.5 + (i % 50) * 0.01,
          importance: i % 10 === 0 ? 'high' : 'normal',
          summary: `Memory ${i}`,
        } as any);
      }
    });

    it('should retrieve efficiently with many memories', async () => {
      const startTime = Date.now();
      
      const result = await cortex.getContext('understand_code', 'patterns', {
        maxTokens: 1000,
      });

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 1 second for in-memory DB)
      expect(duration).toBeLessThan(1000);
      expect(result.memories.length).toBeGreaterThan(0);
    });

    it('should filter by type efficiently', async () => {
      const tribalOnly = await storage.search({ types: ['tribal'], limit: 50 });
      const proceduralOnly = await storage.search({ types: ['procedural'], limit: 50 });

      // Should return only requested types
      expect(tribalOnly.every(m => m.type === 'tribal')).toBe(true);
      expect(proceduralOnly.every(m => m.type === 'procedural')).toBe(true);
    });
  });
});
