/**
 * Budget Module Tests
 * 
 * Tests for token estimation and packing.
 * 
 * @module __tests__/compression/budget
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenEstimator } from '../../compression/budget/estimator.js';
import { GreedyPacker, type PackableItem } from '../../compression/budget/packer.js';
import type { Memory } from '../../types/memory.js';

// Helper to create test memory
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

// Helper to create packable items
function createPackableItem(
  id: string,
  tokens: number,
  priority: number
): PackableItem {
  return { id, tokens, priority };
}

describe('Budget Module Tests', () => {
  describe('TokenEstimator', () => {
    let estimator: TokenEstimator;

    beforeEach(() => {
      estimator = new TokenEstimator();
    });

    it('should estimate tokens for plain text', () => {
      const text = 'Hello, world!';
      const tokens = estimator.estimate(text);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(text.length);
    });

    it('should return 0 for empty text', () => {
      expect(estimator.estimate('')).toBe(0);
    });

    it('should estimate tokens for objects', () => {
      const obj = { name: 'test', value: 123, nested: { a: 1, b: 2 } };
      const tokens = estimator.estimateObject(obj);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens for code', () => {
      const code = `
        function hello() {
          console.log('Hello, world!');
        }
      `;
      const tokens = estimator.estimateCode(code);

      // Code should have higher token estimate due to symbols
      const plainTokens = estimator.estimate(code);
      expect(tokens).toBeGreaterThanOrEqual(plainTokens);
    });

    it('should estimate memory at different compression levels', () => {
      const memory = createTestMemory();

      const level0 = estimator.estimateMemory(memory, 0);
      const level1 = estimator.estimateMemory(memory, 1);
      const level2 = estimator.estimateMemory(memory, 2);
      const level3 = estimator.estimateMemory(memory, 3);

      // Higher levels should have more tokens
      expect(level0).toBeLessThan(level1);
      expect(level1).toBeLessThan(level2);
      expect(level2).toBeLessThan(level3);
    });

    it('should estimate array of strings', () => {
      const items = ['hello', 'world', 'test'];
      const tokens = estimator.estimateArray(items);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(
        items.reduce((sum, item) => sum + estimator.estimate(item), 0)
      );
    });

    it('should return chars per token ratio', () => {
      const ratio = estimator.getCharsPerToken();
      expect(ratio).toBe(4);
    });

    it('should handle memory with examples', () => {
      const memory = createTestMemory() as any;
      memory.examples = [
        { code: 'const x = 1;', description: 'Simple example' },
        { code: 'const y = 2;', description: 'Another example' },
      ];

      const level3 = estimator.estimateMemory(memory, 3);
      expect(level3).toBeGreaterThan(estimator.estimateMemory(memory, 2));
    });

    it('should handle memory with linked entities', () => {
      const memory = createTestMemory() as any;
      memory.linkedPatterns = ['pattern-1', 'pattern-2'];
      memory.linkedFiles = ['src/utils.ts', 'src/helpers.ts'];
      memory.linkedConstraints = ['constraint-1'];

      const level3 = estimator.estimateMemory(memory, 3);
      expect(level3).toBeGreaterThan(0);
    });
  });

  describe('GreedyPacker', () => {
    let packer: GreedyPacker;

    beforeEach(() => {
      packer = new GreedyPacker();
    });

    it('should pack items within budget', () => {
      const items: PackableItem[] = [
        createPackableItem('a', 10, 0.9),
        createPackableItem('b', 20, 0.8),
        createPackableItem('c', 30, 0.7),
      ];

      const result = packer.pack(items, 50);

      expect(result.tokensUsed).toBeLessThanOrEqual(50);
      expect(result.packed.length).toBeGreaterThan(0);
    });

    it('should prioritize high-priority items', () => {
      const items: PackableItem[] = [
        createPackableItem('low', 10, 0.1),
        createPackableItem('high', 10, 0.9),
        createPackableItem('medium', 10, 0.5),
      ];

      const result = packer.pack(items, 20);

      // High priority should be packed first
      expect(result.packed[0]?.id).toBe('high');
    });

    it('should handle empty items array', () => {
      const result = packer.pack([], 100);

      expect(result.packed).toHaveLength(0);
      expect(result.remaining).toHaveLength(0);
      expect(result.tokensUsed).toBe(0);
    });

    it('should handle zero budget', () => {
      const items: PackableItem[] = [
        createPackableItem('a', 10, 0.9),
      ];

      const result = packer.pack(items, 0);

      expect(result.packed).toHaveLength(0);
      expect(result.remaining).toHaveLength(1);
    });

    it('should respect reserve tokens', () => {
      const items: PackableItem[] = [
        createPackableItem('a', 10, 0.9),
        createPackableItem('b', 10, 0.8),
      ];

      const result = packer.pack(items, 25, { reserveTokens: 10 });

      // Only 15 tokens available after reserve
      expect(result.tokensUsed).toBeLessThanOrEqual(15);
    });

    it('should respect max items limit', () => {
      const items: PackableItem[] = [
        createPackableItem('a', 5, 0.9),
        createPackableItem('b', 5, 0.8),
        createPackableItem('c', 5, 0.7),
        createPackableItem('d', 5, 0.6),
      ];

      const result = packer.pack(items, 100, { maxItems: 2 });

      expect(result.packed.length).toBeLessThanOrEqual(2);
    });

    it('should filter by minimum priority', () => {
      const items: PackableItem[] = [
        createPackableItem('high', 10, 0.9),
        createPackableItem('low', 10, 0.1),
      ];

      const result = packer.pack(items, 100, { minPriority: 0.5 });

      expect(result.packed.length).toBe(1);
      expect(result.packed[0]?.id).toBe('high');
    });

    it('should use balanced strategy', () => {
      const items: PackableItem[] = [
        createPackableItem('big', 50, 0.9),
        createPackableItem('small1', 10, 0.8),
        createPackableItem('small2', 10, 0.7),
      ];

      const result = packer.pack(items, 60, { strategy: 'balanced' });

      // Balanced should try to fill gaps
      expect(result.tokensUsed).toBeGreaterThan(0);
    });

    it('should calculate efficiency', () => {
      const items: PackableItem[] = [
        createPackableItem('a', 45, 0.9),
        createPackableItem('b', 45, 0.8),
      ];

      const result = packer.pack(items, 50);

      expect(result.efficiency).toBeGreaterThan(0);
      expect(result.efficiency).toBeLessThanOrEqual(1);
    });

    it('should track fully utilized status', () => {
      const items: PackableItem[] = [
        createPackableItem('a', 45, 0.9),
      ];

      const result = packer.pack(items, 50);

      // 45/50 = 90%, should be considered fully utilized
      expect(result.fullyUtilized).toBe(true);
    });

    it('should pack with allocation per item', () => {
      const items: PackableItem[] = [
        createPackableItem('a', 10, 0.9),
        createPackableItem('b', 10, 0.8),
        createPackableItem('c', 10, 0.7),
        createPackableItem('d', 10, 0.6),
      ];

      const result = packer.packWithAllocation(items, 100, 30);

      // 100 / 30 = 3 items max
      expect(result.packed.length).toBeLessThanOrEqual(3);
    });

    it('should estimate capacity', () => {
      const items: PackableItem[] = [
        createPackableItem('a', 10, 0.9),
        createPackableItem('b', 20, 0.8),
        createPackableItem('c', 30, 0.7),
      ];

      const capacity = packer.estimateCapacity(items, 50);

      expect(capacity.count).toBeGreaterThan(0);
      expect(capacity.tokens).toBeLessThanOrEqual(50);
    });

    it('should distribute budget across categories', () => {
      const categories = [
        { name: 'memories', items: [], weight: 0.5 },
        { name: 'patterns', items: [], weight: 0.3 },
        { name: 'files', items: [], weight: 0.2 },
      ];

      const distribution = packer.distributeBudget(categories, 1000);

      expect(distribution.get('memories')).toBe(500);
      expect(distribution.get('patterns')).toBe(300);
      expect(distribution.get('files')).toBe(200);
    });
  });
});
