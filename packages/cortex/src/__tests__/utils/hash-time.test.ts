/**
 * Hash and Time Utility Tests
 */

import { describe, it, expect } from 'vitest';
import { hashContent, hashMemory, hashesMatch } from '../../utils/hash.js';
import { now, daysBetween, daysSince, isPast, addDays, subtractDays } from '../../utils/time.js';

describe('Hash Utilities', () => {
  describe('hashContent', () => {
    it('should return 16 character hash', () => {
      const hash = hashContent('test content');
      expect(hash.length).toBe(16);
    });

    it('should return consistent hash for same content', () => {
      const hash1 = hashContent('test content');
      const hash2 = hashContent('test content');
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', () => {
      const hash1 = hashContent('content a');
      const hash2 = hashContent('content b');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashContent('');
      expect(hash.length).toBe(16);
    });

    it('should handle unicode content', () => {
      const hash = hashContent('日本語 🎉 émojis');
      expect(hash.length).toBe(16);
    });

    it('should handle very long content', () => {
      const hash = hashContent('x'.repeat(1000000));
      expect(hash.length).toBe(16);
    });

    it('should be case sensitive', () => {
      const hash1 = hashContent('Test');
      const hash2 = hashContent('test');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashMemory', () => {
    it('should hash memory object', () => {
      const memory = { id: 'test', type: 'tribal', content: 'test' };
      const hash = hashMemory(memory);
      expect(hash.length).toBe(64); // Full SHA-256
    });

    it('should return consistent hash for same object', () => {
      const memory = { id: 'test', type: 'tribal' };
      const hash1 = hashMemory(memory);
      const hash2 = hashMemory(memory);
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different objects', () => {
      const hash1 = hashMemory({ id: 'a' });
      const hash2 = hashMemory({ id: 'b' });
      expect(hash1).not.toBe(hash2);
    });

    it('should handle nested objects', () => {
      const memory = { 
        id: 'test', 
        nested: { 
          deep: { 
            value: 'test' 
          } 
        } 
      };
      const hash = hashMemory(memory);
      expect(hash.length).toBe(64);
    });

    it('should handle arrays', () => {
      const memory = { id: 'test', tags: ['a', 'b', 'c'] };
      const hash = hashMemory(memory);
      expect(hash.length).toBe(64);
    });
  });

  describe('hashesMatch', () => {
    it('should return true for matching hashes', () => {
      expect(hashesMatch('abc123', 'abc123')).toBe(true);
    });

    it('should return false for non-matching hashes', () => {
      expect(hashesMatch('abc123', 'def456')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(hashesMatch('ABC', 'abc')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(hashesMatch('', '')).toBe(true);
      expect(hashesMatch('', 'a')).toBe(false);
    });
  });
});

describe('Time Utilities', () => {
  describe('now', () => {
    it('should return ISO string', () => {
      const timestamp = now();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return current time', () => {
      const before = Date.now();
      const timestamp = now();
      const after = Date.now();
      
      const parsed = new Date(timestamp).getTime();
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });
  });

  describe('daysBetween', () => {
    it('should calculate days between two dates', () => {
      const a = '2024-01-01T00:00:00.000Z';
      const b = '2024-01-10T00:00:00.000Z';
      expect(daysBetween(a, b)).toBe(9);
    });

    it('should handle Date objects', () => {
      const a = new Date('2024-01-01');
      const b = new Date('2024-01-10');
      expect(daysBetween(a, b)).toBe(9);
    });

    it('should return absolute difference', () => {
      const a = '2024-01-10T00:00:00.000Z';
      const b = '2024-01-01T00:00:00.000Z';
      expect(daysBetween(a, b)).toBe(9);
    });

    it('should return 0 for same date', () => {
      const date = '2024-01-01T00:00:00.000Z';
      expect(daysBetween(date, date)).toBe(0);
    });

    it('should handle mixed string and Date', () => {
      const a = '2024-01-01T00:00:00.000Z';
      const b = new Date('2024-01-10');
      expect(daysBetween(a, b)).toBe(9);
    });
  });

  describe('daysSince', () => {
    it('should calculate days since a past date', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      
      const days = daysSince(pastDate.toISOString());
      expect(days).toBe(5);
    });

    it('should return 0 for today', () => {
      const today = new Date().toISOString();
      expect(daysSince(today)).toBe(0);
    });

    it('should handle Date objects', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      
      expect(daysSince(pastDate)).toBe(10);
    });
  });

  describe('isPast', () => {
    it('should return true for past dates', () => {
      const past = '2020-01-01T00:00:00.000Z';
      expect(isPast(past)).toBe(true);
    });

    it('should return false for future dates', () => {
      const future = '2099-01-01T00:00:00.000Z';
      expect(isPast(future)).toBe(false);
    });

    it('should handle Date objects', () => {
      const past = new Date('2020-01-01');
      expect(isPast(past)).toBe(true);
    });
  });

  describe('addDays', () => {
    it('should add days to a date', () => {
      const result = addDays('2024-01-01T00:00:00.000Z', 5);
      expect(result).toContain('2024-01-06');
    });

    it('should handle month boundaries', () => {
      const result = addDays('2024-01-30T00:00:00.000Z', 5);
      expect(result).toContain('2024-02-04');
    });

    it('should handle year boundaries', () => {
      const result = addDays('2024-12-30T00:00:00.000Z', 5);
      expect(result).toContain('2025-01-04');
    });

    it('should handle Date objects', () => {
      const result = addDays(new Date('2024-01-01'), 5);
      expect(result).toContain('2024-01-06');
    });

    it('should handle negative days', () => {
      const result = addDays('2024-01-10T00:00:00.000Z', -5);
      expect(result).toContain('2024-01-05');
    });
  });

  describe('subtractDays', () => {
    it('should subtract days from a date', () => {
      const result = subtractDays('2024-01-10T00:00:00.000Z', 5);
      expect(result).toContain('2024-01-05');
    });

    it('should handle month boundaries', () => {
      const result = subtractDays('2024-02-05T00:00:00.000Z', 10);
      expect(result).toContain('2024-01-26');
    });

    it('should handle Date objects', () => {
      const result = subtractDays(new Date('2024-01-10'), 5);
      expect(result).toContain('2024-01-05');
    });
  });
});
