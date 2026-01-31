/**
 * Token Estimation Tests
 * 
 * Tests for the token estimation utilities.
 */

import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateObjectTokens, fitsInBudget, truncateToFit } from '../../utils/tokens.js';

describe('Token Utilities', () => {
  describe('estimateTokens', () => {
    it('should estimate ~4 characters per token', () => {
      const text = 'This is a test string with exactly forty characters.';
      const tokens = estimateTokens(text);

      // ~52 chars / 4 = ~13 tokens
      expect(tokens).toBeCloseTo(13, 0);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should round up partial tokens', () => {
      const text = 'abc'; // 3 chars = 0.75 tokens, should round to 1
      expect(estimateTokens(text)).toBe(1);
    });

    it('should handle long text', () => {
      const text = 'a'.repeat(4000); // 4000 chars = 1000 tokens
      expect(estimateTokens(text)).toBe(1000);
    });

    it('should handle unicode characters', () => {
      const text = '你好世界'; // 4 Chinese characters
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle whitespace', () => {
      const text = '   \n\t   '; // 8 whitespace chars
      expect(estimateTokens(text)).toBe(2);
    });
  });

  describe('estimateObjectTokens', () => {
    it('should estimate tokens for simple objects', () => {
      const obj = { name: 'test', value: 123 };
      const tokens = estimateObjectTokens(obj);

      // JSON: {"name":"test","value":123} = 27 chars = ~7 tokens
      expect(tokens).toBeGreaterThan(5);
      expect(tokens).toBeLessThan(15);
    });

    it('should handle nested objects', () => {
      const obj = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      };
      const tokens = estimateObjectTokens(obj);
      expect(tokens).toBeGreaterThanOrEqual(10);
    });

    it('should handle arrays', () => {
      const obj = { items: [1, 2, 3, 4, 5] };
      const tokens = estimateObjectTokens(obj);
      expect(tokens).toBeGreaterThan(5);
    });

    it('should handle null and undefined', () => {
      expect(estimateObjectTokens(null)).toBeGreaterThan(0);
      // undefined becomes undefined in JSON.stringify, which is "undefined" string
    });

    it('should handle empty objects', () => {
      expect(estimateObjectTokens({})).toBe(1); // "{}" = 2 chars = 1 token
    });

    it('should handle empty arrays', () => {
      expect(estimateObjectTokens([])).toBe(1); // "[]" = 2 chars = 1 token
    });
  });

  describe('fitsInBudget', () => {
    it('should return true when text fits', () => {
      const text = 'Short text'; // ~10 chars = ~3 tokens
      expect(fitsInBudget(text, 10)).toBe(true);
    });

    it('should return false when text exceeds budget', () => {
      const text = 'This is a longer text that exceeds the budget';
      expect(fitsInBudget(text, 5)).toBe(false);
    });

    it('should return true for exact fit', () => {
      const text = 'abcd'; // 4 chars = 1 token
      expect(fitsInBudget(text, 1)).toBe(true);
    });

    it('should return true for empty text', () => {
      expect(fitsInBudget('', 0)).toBe(true);
    });

    it('should handle zero budget', () => {
      expect(fitsInBudget('any text', 0)).toBe(false);
    });
  });

  describe('truncateToFit', () => {
    it('should not truncate text that fits', () => {
      const text = 'Short text';
      const result = truncateToFit(text, 100);
      expect(result).toBe(text);
    });

    it('should truncate text that exceeds budget', () => {
      const text = 'This is a very long text that needs to be truncated';
      const result = truncateToFit(text, 5); // 5 tokens = 20 chars

      expect(result.length).toBeLessThanOrEqual(20);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should add ellipsis when truncating', () => {
      const text = 'a'.repeat(100);
      const result = truncateToFit(text, 5);

      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle exact fit without truncation', () => {
      const text = 'abcd'; // 4 chars = 1 token
      const result = truncateToFit(text, 1);
      expect(result).toBe(text);
    });

    it('should handle empty text', () => {
      expect(truncateToFit('', 10)).toBe('');
    });

    it('should handle very small budget', () => {
      const text = 'Hello world';
      const result = truncateToFit(text, 1); // 1 token = 4 chars, minus 3 for "..." = 1 char

      expect(result.length).toBeLessThanOrEqual(4);
    });

    it('should preserve as much content as possible', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const result = truncateToFit(text, 5); // 20 chars max

      // Should have meaningful content before ellipsis
      expect(result.length).toBeGreaterThan(3);
      expect(result).toContain('The');
    });
  });

  describe('integration scenarios', () => {
    it('should work together for budget management', () => {
      const memories = [
        { summary: 'Short summary', content: 'Detailed content here' },
        { summary: 'Another summary', content: 'More detailed content' },
      ];

      const budget = 20; // tokens
      let usedTokens = 0;
      const included: string[] = [];

      for (const memory of memories) {
        const summaryTokens = estimateTokens(memory.summary);
        if (usedTokens + summaryTokens <= budget) {
          included.push(memory.summary);
          usedTokens += summaryTokens;
        }
      }

      expect(included.length).toBeGreaterThan(0);
      expect(usedTokens).toBeLessThanOrEqual(budget);
    });

    it('should handle memory object token estimation', () => {
      const memory = {
        id: 'mem_123',
        type: 'tribal',
        topic: 'authentication',
        knowledge: 'Always validate JWT tokens before processing requests',
        confidence: 0.9,
        importance: 'high',
      };

      const tokens = estimateObjectTokens(memory);

      // Should be reasonable for a memory object
      expect(tokens).toBeGreaterThan(20);
      expect(tokens).toBeLessThan(100);
    });
  });
});
