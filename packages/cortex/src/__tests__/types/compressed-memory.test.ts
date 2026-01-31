/**
 * Compressed Memory Types Tests
 * 
 * Tests for compression level type definitions.
 */

import { describe, it, expect } from 'vitest';
import type {
  CompressionLevel,
  CompressedMemory,
  CompressionResult,
  LevelConfig,
  CompressionStats,
} from '../../types/compressed-memory.js';

describe('Compressed Memory Types', () => {
  describe('CompressionLevel', () => {
    it('should accept valid compression levels', () => {
      const levels: CompressionLevel[] = [0, 1, 2, 3];

      levels.forEach(level => {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(3);
      });
    });

    it('should represent increasing detail levels', () => {
      // Level 0: IDs only (minimal)
      // Level 1: One-liners
      // Level 2: With examples
      // Level 3: Full content
      const levels: CompressionLevel[] = [0, 1, 2, 3];
      expect(levels[0]).toBeLessThan(levels[3]!);
    });
  });

  describe('CompressedMemory', () => {
    it('should have required properties', () => {
      const memory: CompressedMemory = {
        id: 'mem_1',
        type: 'tribal',
        level: 2,
        content: {
          level0: 'mem_1',
          level1: 'Authentication middleware pattern',
          level2: 'Authentication middleware pattern with JWT validation example',
          level3: 'Full content with all details...',
        },
        tokenCounts: {
          level0: 5,
          level1: 20,
          level2: 50,
          level3: 200,
        },
        originalId: 'mem_1',
        compressedAt: new Date().toISOString(),
      };

      expect(memory.id).toBeDefined();
      expect(memory.type).toBeDefined();
      expect(memory.level).toBeDefined();
      expect(memory.content).toBeDefined();
      expect(memory.tokenCounts).toBeDefined();
      expect(memory.originalId).toBeDefined();
      expect(memory.compressedAt).toBeDefined();
    });

    it('should have content for all levels', () => {
      const memory: CompressedMemory = {
        id: 'mem_1',
        type: 'tribal',
        level: 3,
        content: {
          level0: 'mem_1',
          level1: 'Short summary',
          level2: 'Medium summary with example',
          level3: 'Full detailed content',
        },
        tokenCounts: {
          level0: 5,
          level1: 10,
          level2: 25,
          level3: 100,
        },
        originalId: 'mem_1',
        compressedAt: new Date().toISOString(),
      };

      expect(memory.content.level0).toBeDefined();
      expect(memory.content.level1).toBeDefined();
      expect(memory.content.level2).toBeDefined();
      expect(memory.content.level3).toBeDefined();
    });

    it('should have increasing token counts per level', () => {
      const memory: CompressedMemory = {
        id: 'mem_1',
        type: 'tribal',
        level: 3,
        content: {
          level0: 'mem_1',
          level1: 'Short',
          level2: 'Medium length',
          level3: 'Full detailed content here',
        },
        tokenCounts: {
          level0: 5,
          level1: 10,
          level2: 25,
          level3: 100,
        },
        originalId: 'mem_1',
        compressedAt: new Date().toISOString(),
      };

      expect(memory.tokenCounts.level0).toBeLessThanOrEqual(memory.tokenCounts.level1);
      expect(memory.tokenCounts.level1).toBeLessThanOrEqual(memory.tokenCounts.level2);
      expect(memory.tokenCounts.level2).toBeLessThanOrEqual(memory.tokenCounts.level3);
    });
  });

  describe('CompressionResult', () => {
    it('should have required properties', () => {
      const result: CompressionResult = {
        compressed: {
          id: 'mem_1',
          type: 'tribal',
          level: 2,
          content: {
            level0: 'mem_1',
            level1: 'Summary',
            level2: 'Summary with example',
            level3: 'Full content',
          },
          tokenCounts: {
            level0: 5,
            level1: 10,
            level2: 25,
            level3: 100,
          },
          originalId: 'mem_1',
          compressedAt: new Date().toISOString(),
        },
        originalTokens: 100,
        compressedTokens: 25,
        compressionRatio: 0.25,
        processingTimeMs: 50,
      };

      expect(result.compressed).toBeDefined();
      expect(result.originalTokens).toBeDefined();
      expect(result.compressedTokens).toBeDefined();
      expect(result.compressionRatio).toBeDefined();
      expect(result.processingTimeMs).toBeDefined();
    });

    it('should have valid compression ratio', () => {
      const result: CompressionResult = {
        compressed: {} as CompressedMemory,
        originalTokens: 100,
        compressedTokens: 25,
        compressionRatio: 0.25,
        processingTimeMs: 50,
      };

      expect(result.compressionRatio).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeLessThanOrEqual(1);
      expect(result.compressionRatio).toBeCloseTo(result.compressedTokens / result.originalTokens);
    });
  });

  describe('LevelConfig', () => {
    it('should have required properties', () => {
      const config: LevelConfig = {
        level: 2,
        maxTokens: 100,
        includeExamples: true,
        includeMetadata: false,
        truncationStrategy: 'smart',
      };

      expect(config.level).toBeDefined();
      expect(config.maxTokens).toBeDefined();
      expect(config.includeExamples).toBeDefined();
      expect(config.includeMetadata).toBeDefined();
      expect(config.truncationStrategy).toBeDefined();
    });

    it('should accept valid truncation strategies', () => {
      const strategies: LevelConfig['truncationStrategy'][] = ['smart', 'simple', 'none'];

      strategies.forEach(strategy => {
        const config: LevelConfig = {
          level: 1,
          maxTokens: 50,
          includeExamples: false,
          includeMetadata: false,
          truncationStrategy: strategy,
        };
        expect(config.truncationStrategy).toBe(strategy);
      });
    });
  });

  describe('CompressionStats', () => {
    it('should have required properties', () => {
      const stats: CompressionStats = {
        totalMemories: 100,
        compressedMemories: 95,
        averageCompressionRatio: 0.3,
        totalOriginalTokens: 10000,
        totalCompressedTokens: 3000,
        byLevel: {
          0: { count: 20, avgTokens: 5 },
          1: { count: 30, avgTokens: 15 },
          2: { count: 30, avgTokens: 40 },
          3: { count: 15, avgTokens: 100 },
        },
      };

      expect(stats.totalMemories).toBeDefined();
      expect(stats.compressedMemories).toBeDefined();
      expect(stats.averageCompressionRatio).toBeDefined();
      expect(stats.totalOriginalTokens).toBeDefined();
      expect(stats.totalCompressedTokens).toBeDefined();
      expect(stats.byLevel).toBeDefined();
    });

    it('should have stats for all levels', () => {
      const stats: CompressionStats = {
        totalMemories: 100,
        compressedMemories: 100,
        averageCompressionRatio: 0.25,
        totalOriginalTokens: 10000,
        totalCompressedTokens: 2500,
        byLevel: {
          0: { count: 25, avgTokens: 5 },
          1: { count: 25, avgTokens: 15 },
          2: { count: 25, avgTokens: 35 },
          3: { count: 25, avgTokens: 100 },
        },
      };

      expect(stats.byLevel[0]).toBeDefined();
      expect(stats.byLevel[1]).toBeDefined();
      expect(stats.byLevel[2]).toBeDefined();
      expect(stats.byLevel[3]).toBeDefined();
    });
  });
});
