/**
 * ID Generator Tests
 * 
 * Tests for the unique ID generation utilities.
 */

import { describe, it, expect } from 'vitest';
import { generateId, generateConsolidationId, generateValidationId, generateSessionId } from '../../utils/id-generator.js';

describe('ID Generator', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(1000);
    });

    it('should start with mem_ prefix', () => {
      const id = generateId();
      expect(id).toMatch(/^mem_/);
    });

    it('should have consistent format', () => {
      const id = generateId();
      // Format: mem_<timestamp>_<random>
      expect(id).toMatch(/^mem_[a-z0-9]+_[a-f0-9]+$/);
    });

    it('should be reasonably short', () => {
      const id = generateId();
      expect(id.length).toBeLessThan(40);
    });

    it('should be URL-safe', () => {
      const id = generateId();
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });

  describe('generateConsolidationId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateConsolidationId());
      }
      expect(ids.size).toBe(100);
    });

    it('should start with cons_ prefix', () => {
      const id = generateConsolidationId();
      expect(id).toMatch(/^cons_/);
    });

    it('should have consistent format', () => {
      const id = generateConsolidationId();
      expect(id).toMatch(/^cons_[a-z0-9]+_[a-f0-9]+$/);
    });
  });

  describe('generateValidationId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateValidationId());
      }
      expect(ids.size).toBe(100);
    });

    it('should start with val_ prefix', () => {
      const id = generateValidationId();
      expect(id).toMatch(/^val_/);
    });

    it('should have consistent format', () => {
      const id = generateValidationId();
      expect(id).toMatch(/^val_[a-z0-9]+_[a-f0-9]+$/);
    });
  });

  describe('generateSessionId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });

    it('should start with sess_ prefix', () => {
      const id = generateSessionId();
      expect(id).toMatch(/^sess_/);
    });

    it('should have consistent format', () => {
      const id = generateSessionId();
      expect(id).toMatch(/^sess_[a-z0-9]+_[a-f0-9]+$/);
    });
  });

  describe('ID ordering', () => {
    it('should generate IDs that sort chronologically', async () => {
      const id1 = generateId();
      await new Promise(resolve => setTimeout(resolve, 10));
      const id2 = generateId();

      // Extract timestamp parts
      const ts1 = id1.split('_')[1];
      const ts2 = id2.split('_')[1];

      // Later ID should have larger timestamp
      expect(ts2! >= ts1!).toBe(true);
    });
  });

  describe('collision resistance', () => {
    it('should not collide even when generated rapidly', () => {
      const ids: string[] = [];
      for (let i = 0; i < 10000; i++) {
        ids.push(generateId());
      }

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have sufficient entropy in random part', () => {
      const id = generateId();
      const randomPart = id.split('_')[2];

      // 6 bytes = 12 hex chars
      expect(randomPart!.length).toBe(12);
    });
  });

  describe('different ID types should not collide', () => {
    it('should have distinct prefixes', () => {
      const memId = generateId();
      const consId = generateConsolidationId();
      const valId = generateValidationId();
      const sessId = generateSessionId();

      expect(memId.startsWith('mem_')).toBe(true);
      expect(consId.startsWith('cons_')).toBe(true);
      expect(valId.startsWith('val_')).toBe(true);
      expect(sessId.startsWith('sess_')).toBe(true);

      // No overlap
      expect(memId).not.toBe(consId);
      expect(memId).not.toBe(valId);
      expect(memId).not.toBe(sessId);
    });
  });
});
