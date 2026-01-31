/**
 * Feedback Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenerationFeedbackLoop } from '../../generation/feedback/loop.js';
import { OutcomeProcessor } from '../../generation/feedback/outcome-processor.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { GeneratedCode, CodeProvenance } from '../../generation/types.js';

describe('OutcomeProcessor', () => {
  let mockStorage: IMemoryStorage;
  let processor: OutcomeProcessor;

  beforeEach(() => {
    mockStorage = {
      read: vi.fn().mockResolvedValue({
        id: 'memory-1',
        confidence: 0.7,
        accessCount: 5,
      }),
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as IMemoryStorage;

    processor = new OutcomeProcessor(mockStorage);
  });

  describe('process', () => {
    const createGeneration = (requestId: string): GeneratedCode => ({
      code: 'function test() {}',
      language: 'typescript',
      targetFile: 'test.ts',
      provenance: {
        requestId,
        influences: [
          { memoryId: 'memory-1', memoryType: 'pattern_rationale', influenceType: 'pattern_followed', description: 'Test', strength: 0.8 },
        ],
        warnings: [],
        appliedConstraints: [],
        avoidedAntiPatterns: [],
        confidence: 0.8,
        generatedAt: new Date().toISOString(),
      },
      generatedAt: new Date().toISOString(),
    });

    it('should process accepted outcome', async () => {
      const generation = createGeneration('test-123');

      await processor.process(generation, 'accepted');

      expect(mockStorage.update).toHaveBeenCalled();
      // Confidence should be boosted
      const updateCall = vi.mocked(mockStorage.update).mock.calls[0];
      expect(updateCall?.[1]?.confidence).toBeGreaterThan(0.7);
    });

    it('should process modified outcome', async () => {
      const generation = createGeneration('test-123');

      await processor.process(generation, 'modified', 'Minor changes needed');

      expect(mockStorage.update).toHaveBeenCalled();
    });

    it('should process rejected outcome', async () => {
      const generation = createGeneration('test-123');

      await processor.process(generation, 'rejected', 'Code was incorrect');

      expect(mockStorage.update).toHaveBeenCalled();
      // Confidence should be reduced
      const updateCall = vi.mocked(mockStorage.update).mock.calls[0];
      expect(updateCall?.[1]?.confidence).toBeLessThan(0.7);
    });
  });

  describe('getAdjustment', () => {
    it('should return positive adjustment for accepted', () => {
      expect(processor.getAdjustment('accepted')).toBeGreaterThan(0);
    });

    it('should return negative adjustment for modified', () => {
      expect(processor.getAdjustment('modified')).toBeLessThan(0);
    });

    it('should return larger negative adjustment for rejected', () => {
      const modifiedAdj = processor.getAdjustment('modified');
      const rejectedAdj = processor.getAdjustment('rejected');
      expect(rejectedAdj).toBeLessThan(modifiedAdj);
    });
  });
});

describe('GenerationFeedbackLoop', () => {
  let mockStorage: IMemoryStorage;
  let outcomeProcessor: OutcomeProcessor;
  let feedbackLoop: GenerationFeedbackLoop;

  beforeEach(() => {
    mockStorage = {
      read: vi.fn().mockResolvedValue({
        id: 'memory-1',
        confidence: 0.7,
        accessCount: 5,
      }),
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as IMemoryStorage;

    outcomeProcessor = new OutcomeProcessor(mockStorage);
    feedbackLoop = new GenerationFeedbackLoop(mockStorage, outcomeProcessor);
  });

  describe('trackOutcome', () => {
    const createGeneration = (): GeneratedCode => ({
      code: 'function test() {}',
      language: 'typescript',
      targetFile: 'test.ts',
      provenance: {
        requestId: 'test-123',
        influences: [
          { memoryId: 'memory-1', memoryType: 'pattern_rationale', influenceType: 'pattern_followed', description: 'Test', strength: 0.8 },
        ],
        warnings: [],
        appliedConstraints: [],
        avoidedAntiPatterns: [],
        confidence: 0.8,
        generatedAt: new Date().toISOString(),
      },
      generatedAt: new Date().toISOString(),
    });

    it('should track accepted outcome', async () => {
      const generation = createGeneration();

      await feedbackLoop.trackOutcome(generation, 'accepted');

      const stats = feedbackLoop.getStats();
      expect(stats.total).toBe(1);
      expect(stats.accepted).toBe(1);
    });

    it('should track modified outcome', async () => {
      const generation = createGeneration();

      await feedbackLoop.trackOutcome(generation, 'modified', 'Some changes');

      const stats = feedbackLoop.getStats();
      expect(stats.total).toBe(1);
      expect(stats.modified).toBe(1);
    });

    it('should track rejected outcome', async () => {
      const generation = createGeneration();

      await feedbackLoop.trackOutcome(generation, 'rejected', 'Not what I wanted');

      const stats = feedbackLoop.getStats();
      expect(stats.total).toBe(1);
      expect(stats.rejected).toBe(1);
    });

    it('should update statistics correctly', async () => {
      const generation = createGeneration();

      await feedbackLoop.trackOutcome(generation, 'accepted');
      await feedbackLoop.trackOutcome(generation, 'accepted');
      await feedbackLoop.trackOutcome(generation, 'modified');
      await feedbackLoop.trackOutcome(generation, 'rejected');

      const stats = feedbackLoop.getStats();
      expect(stats.total).toBe(4);
      expect(stats.accepted).toBe(2);
      expect(stats.modified).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.acceptanceRate).toBe(0.5);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = feedbackLoop.getStats();

      expect(stats.total).toBe(0);
      expect(stats.accepted).toBe(0);
      expect(stats.modified).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.acceptanceRate).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', async () => {
      const generation: GeneratedCode = {
        code: 'test',
        language: 'typescript',
        targetFile: 'test.ts',
        provenance: {
          requestId: 'test',
          influences: [],
          warnings: [],
          appliedConstraints: [],
          avoidedAntiPatterns: [],
          confidence: 0.5,
          generatedAt: new Date().toISOString(),
        },
        generatedAt: new Date().toISOString(),
      };

      await feedbackLoop.trackOutcome(generation, 'accepted');
      await feedbackLoop.trackOutcome(generation, 'rejected');

      feedbackLoop.resetStats();

      const stats = feedbackLoop.getStats();
      expect(stats.total).toBe(0);
      expect(stats.accepted).toBe(0);
      expect(stats.rejected).toBe(0);
    });
  });

  describe('getAcceptanceRate', () => {
    it('should return 0 when no feedback', () => {
      expect(feedbackLoop.getAcceptanceRate()).toBe(0);
    });

    it('should calculate acceptance rate correctly', async () => {
      const generation: GeneratedCode = {
        code: 'test',
        language: 'typescript',
        targetFile: 'test.ts',
        provenance: {
          requestId: 'test',
          influences: [],
          warnings: [],
          appliedConstraints: [],
          avoidedAntiPatterns: [],
          confidence: 0.5,
          generatedAt: new Date().toISOString(),
        },
        generatedAt: new Date().toISOString(),
      };

      await feedbackLoop.trackOutcome(generation, 'accepted');
      await feedbackLoop.trackOutcome(generation, 'accepted');
      await feedbackLoop.trackOutcome(generation, 'rejected');
      await feedbackLoop.trackOutcome(generation, 'rejected');

      expect(feedbackLoop.getAcceptanceRate()).toBe(0.5);
    });
  });

  describe('isHealthy', () => {
    it('should be healthy with no data', () => {
      expect(feedbackLoop.isHealthy()).toBe(true);
    });

    it('should be healthy with good acceptance rate', async () => {
      const generation: GeneratedCode = {
        code: 'test',
        language: 'typescript',
        targetFile: 'test.ts',
        provenance: {
          requestId: 'test',
          influences: [],
          warnings: [],
          appliedConstraints: [],
          avoidedAntiPatterns: [],
          confidence: 0.5,
          generatedAt: new Date().toISOString(),
        },
        generatedAt: new Date().toISOString(),
      };

      // Track 10+ outcomes with >50% acceptance
      for (let i = 0; i < 8; i++) {
        await feedbackLoop.trackOutcome(generation, 'accepted');
      }
      for (let i = 0; i < 4; i++) {
        await feedbackLoop.trackOutcome(generation, 'rejected');
      }

      expect(feedbackLoop.isHealthy()).toBe(true);
    });

    it('should be unhealthy with poor acceptance rate', async () => {
      const generation: GeneratedCode = {
        code: 'test',
        language: 'typescript',
        targetFile: 'test.ts',
        provenance: {
          requestId: 'test',
          influences: [],
          warnings: [],
          appliedConstraints: [],
          avoidedAntiPatterns: [],
          confidence: 0.5,
          generatedAt: new Date().toISOString(),
        },
        generatedAt: new Date().toISOString(),
      };

      // Track 10+ outcomes with <50% acceptance
      for (let i = 0; i < 3; i++) {
        await feedbackLoop.trackOutcome(generation, 'accepted');
      }
      for (let i = 0; i < 8; i++) {
        await feedbackLoop.trackOutcome(generation, 'rejected');
      }

      expect(feedbackLoop.isHealthy()).toBe(false);
    });
  });

  describe('processFeedback', () => {
    it('should process feedback directly', async () => {
      await feedbackLoop.processFeedback({
        requestId: 'test-123',
        outcome: 'accepted',
        providedAt: new Date().toISOString(),
      });

      const stats = feedbackLoop.getStats();
      expect(stats.total).toBe(1);
      expect(stats.accepted).toBe(1);
    });
  });
});
