/**
 * Compression Module Tests
 * 
 * Tests for the 4-level compression system.
 * 
 * @module __tests__/compression/compressor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Level0Compressor } from '../../compression/compressor/level-0.js';
import { Level1Compressor } from '../../compression/compressor/level-1.js';
import { Level2Compressor } from '../../compression/compressor/level-2.js';
import { Level3Compressor } from '../../compression/compressor/level-3.js';
import { HierarchicalCompressorV2 } from '../../compression/compressor/hierarchical.js';
import type { Memory } from '../../types/memory.js';
import type { TribalMemory } from '../../types/tribal-memory.js';

// Helper to create test memories
function createTestMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date().toISOString();
  return {
    id: 'test-memory-id-12345678',
    type: 'tribal',
    summary: 'Always use async/await instead of raw promises for better readability',
    confidence: 0.85,
    importance: 'high',
    transactionTime: { recordedAt: now },
    validTime: { validFrom: now },
    accessCount: 5,
    createdAt: now,
    updatedAt: now,
    tags: ['async', 'promises', 'best-practices'],
    ...overrides,
  } as Memory;
}

function createTribalMemory(overrides: Partial<TribalMemory> = {}): TribalMemory {
  const base = createTestMemory() as TribalMemory;
  return {
    ...base,
    type: 'tribal',
    topic: 'async-patterns',
    knowledge: 'Always use async/await instead of raw promises for better readability and error handling.',
    context: 'This was learned from code review feedback on PR #123.',
    severity: 'warning',
    source: { type: 'manual' },
    warnings: ['Raw promises can lead to unhandled rejections'],
    consequences: ['Code becomes harder to debug', 'Error handling is inconsistent'],
    ...overrides,
  };
}

describe('Compression Module Tests', () => {
  describe('Level0Compressor', () => {
    let compressor: Level0Compressor;

    beforeEach(() => {
      compressor = new Level0Compressor();
    });

    it('should compress memory to minimal representation', () => {
      const memory = createTestMemory();
      const output = compressor.compress(memory);

      expect(output.id).toBe(memory.id);
      expect(output.type).toBe(memory.type);
      expect(output.importance).toBe(memory.importance);
      expect(output.tokens).toBeGreaterThanOrEqual(5);
    });

    it('should compress batch of memories', () => {
      const memories = [
        createTestMemory({ id: 'mem-1' }),
        createTestMemory({ id: 'mem-2' }),
        createTestMemory({ id: 'mem-3' }),
      ];

      const outputs = compressor.compressBatch(memories);

      expect(outputs).toHaveLength(3);
      expect(outputs[0]?.id).toBe('mem-1');
      expect(outputs[1]?.id).toBe('mem-2');
      expect(outputs[2]?.id).toBe('mem-3');
    });

    it('should format output as compact string', () => {
      const memory = createTestMemory();
      const output = compressor.compress(memory);
      const formatted = compressor.format(output);

      expect(formatted).toContain('tribal');
      expect(formatted).toContain('high');
      expect(formatted.length).toBeLessThan(50);
    });

    it('should return target tokens', () => {
      expect(compressor.getTargetTokens()).toBe(5);
    });
  });

  describe('Level1Compressor', () => {
    let compressor: Level1Compressor;

    beforeEach(() => {
      compressor = new Level1Compressor();
    });

    it('should compress memory with one-liner', () => {
      const memory = createTestMemory();
      const output = compressor.compress(memory);

      expect(output.id).toBe(memory.id);
      expect(output.type).toBe(memory.type);
      expect(output.oneLiner).toBeDefined();
      expect(output.confidence).toBe(memory.confidence);
      expect(output.tokens).toBeGreaterThan(5);
    });

    it('should include limited tags', () => {
      const memory = createTestMemory({
        tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
      });
      const output = compressor.compress(memory);

      expect(output.tags.length).toBeLessThanOrEqual(3);
    });

    it('should truncate long summaries', () => {
      const memory = createTestMemory({
        summary: 'A'.repeat(200),
      });
      const output = compressor.compress(memory);

      expect(output.oneLiner.length).toBeLessThanOrEqual(150);
    });

    it('should format output with one-liner', () => {
      const memory = createTestMemory();
      const output = compressor.compress(memory);
      const formatted = compressor.format(output);

      expect(formatted).toContain(output.oneLiner.slice(0, 20));
    });

    it('should return target tokens around 50', () => {
      expect(compressor.getTargetTokens()).toBe(50);
    });
  });

  describe('Level2Compressor', () => {
    let compressor: Level2Compressor;

    beforeEach(() => {
      compressor = new Level2Compressor();
    });

    it('should compress memory with knowledge', () => {
      const memory = createTribalMemory();
      const output = compressor.compress(memory);

      expect(output.id).toBe(memory.id);
      expect(output.details).toBeDefined();
      expect(output.details.knowledge).toBeDefined();
      expect(output.tokens).toBeGreaterThan(50);
    });

    it('should include one example if available', () => {
      const memory = createTribalMemory();
      const output = compressor.compress(memory);

      // May or may not have example depending on memory type
      expect(output.details).toBeDefined();
    });

    it('should include evidence', () => {
      const memory = createTribalMemory();
      const output = compressor.compress(memory);

      expect(output.details.evidence).toBeDefined();
      expect(Array.isArray(output.details.evidence)).toBe(true);
    });

    it('should return target tokens around 200', () => {
      expect(compressor.getTargetTokens()).toBe(200);
    });
  });

  describe('Level3Compressor', () => {
    let compressor: Level3Compressor;

    beforeEach(() => {
      compressor = new Level3Compressor();
    });

    it('should compress memory with full content', () => {
      const memory = createTribalMemory();
      const output = compressor.compress(memory);

      expect(output.id).toBe(memory.id);
      expect(output.full).toBeDefined();
      expect(output.full.completeKnowledge).toBeDefined();
      expect(output.tokens).toBeGreaterThan(200);
    });

    it('should include all examples in full context', () => {
      const memory = createTribalMemory();
      const output = compressor.compress(memory);

      expect(output.full.allExamples).toBeDefined();
      expect(Array.isArray(output.full.allExamples)).toBe(true);
    });

    it('should include related memories in full context', () => {
      const memory = createTribalMemory();
      const output = compressor.compress(memory);

      expect(output.full.relatedMemories).toBeDefined();
      expect(Array.isArray(output.full.relatedMemories)).toBe(true);
    });

    it('should include linked entities in full context', () => {
      const memory = createTribalMemory({
        linkedPatterns: ['pattern-1', 'pattern-2'],
        linkedFiles: ['src/utils.ts'],
      });
      const output = compressor.compress(memory);

      expect(output.full.linkedPatterns).toBeDefined();
      expect(output.full.linkedPatterns).toContain('pattern-1');
      expect(output.full.linkedFiles).toBeDefined();
    });

    it('should return target tokens around 500', () => {
      expect(compressor.getTargetTokens()).toBe(500);
    });
  });

  describe('HierarchicalCompressorV2', () => {
    let compressor: HierarchicalCompressorV2;

    beforeEach(() => {
      compressor = new HierarchicalCompressorV2();
    });

    it('should compress to specific level', () => {
      const memory = createTribalMemory();

      const level0 = compressor.compress(memory, 0);
      const level1 = compressor.compress(memory, 1);
      const level2 = compressor.compress(memory, 2);
      const level3 = compressor.compress(memory, 3);

      expect(level0.level).toBe(0);
      expect(level1.level).toBe(1);
      expect(level2.level).toBe(2);
      expect(level3.level).toBe(3);

      // Token counts should increase with level
      expect(level0.tokenCount).toBeLessThan(level1.tokenCount);
      expect(level1.tokenCount).toBeLessThan(level2.tokenCount);
      expect(level2.tokenCount).toBeLessThan(level3.tokenCount);
    });

    it('should compress to fit budget', () => {
      const memory = createTribalMemory();

      // Small budget should result in lower level
      const small = compressor.compressToFit(memory, 10);
      expect(small.level).toBe(0);

      // Medium budget
      const medium = compressor.compressToFit(memory, 100);
      expect(medium.level).toBeLessThanOrEqual(2);

      // Large budget should allow higher level
      const large = compressor.compressToFit(memory, 1000);
      expect(large.level).toBeGreaterThanOrEqual(2);
    });

    it('should compress batch to fit total budget', () => {
      const memories = [
        createTribalMemory({ id: 'mem-1', importance: 'critical' }),
        createTribalMemory({ id: 'mem-2', importance: 'high' }),
        createTribalMemory({ id: 'mem-3', importance: 'normal' }),
        createTribalMemory({ id: 'mem-4', importance: 'low' }),
      ];

      const results = compressor.compressBatchToFit(memories, 200);

      // Should prioritize by importance
      const totalTokens = results.reduce((sum, r) => sum + r.tokenCount, 0);
      expect(totalTokens).toBeLessThanOrEqual(200);

      // Critical should be included first
      if (results.length > 0) {
        expect(results[0]?.memoryId).toBe('mem-1');
      }
    });

    it('should get token counts for all levels', () => {
      const memory = createTribalMemory();
      const counts = compressor.getTokenCountsAllLevels(memory);

      expect(counts[0]).toBeDefined();
      expect(counts[1]).toBeDefined();
      expect(counts[2]).toBeDefined();
      expect(counts[3]).toBeDefined();

      expect(counts[0]).toBeLessThan(counts[1]);
      expect(counts[1]).toBeLessThan(counts[2]);
      expect(counts[2]).toBeLessThan(counts[3]);
    });

    it('should suggest optimal level for budget', () => {
      const memory = createTribalMemory();

      const level = compressor.suggestLevel(memory, 100);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(3);
    });

    it('should format compressed memory', () => {
      const memory = createTribalMemory();
      const compressed = compressor.compress(memory, 1);
      const formatted = compressor.format(compressed);

      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should calculate compression ratio', () => {
      const memory = createTribalMemory();
      const compressed = compressor.compress(memory, 0);

      expect(compressed.compressionRatio).toBeLessThan(1);
      expect(compressed.originalTokenCount).toBeGreaterThan(compressed.tokenCount);
    });
  });
});
