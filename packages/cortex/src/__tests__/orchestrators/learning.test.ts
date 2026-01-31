/**
 * Learning Orchestrator Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LearningOrchestrator } from '../../orchestrators/learning-orchestrator.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory } from '../../types/index.js';

describe('LearningOrchestrator', () => {
  let mockStorage: IMemoryStorage;
  let orchestrator: LearningOrchestrator;

  const createMockMemory = (overrides: Partial<Memory> = {}): Memory => ({
    id: 'mem-1',
    type: 'tribal',
    summary: 'Test memory',
    confidence: 0.8,
    importance: 'normal',
    createdAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
    accessCount: 5,
    tags: ['test'],
    ...overrides,
  } as Memory);

  beforeEach(() => {
    mockStorage = {
      initialize: vi.fn(),
      close: vi.fn(),
      create: vi.fn().mockResolvedValue('new-mem-id'),
      read: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      bulkCreate: vi.fn(),
      bulkUpdate: vi.fn(),
      bulkDelete: vi.fn(),
      findByType: vi.fn().mockResolvedValue([]),
      findByPattern: vi.fn().mockResolvedValue([]),
      findByConstraint: vi.fn().mockResolvedValue([]),
      findByFile: vi.fn().mockResolvedValue([]),
      findByFunction: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      similaritySearch: vi.fn().mockResolvedValue([]),
      upsertEmbedding: vi.fn(),
      asOf: vi.fn().mockReturnThis(),
      validAt: vi.fn().mockReturnThis(),
      addRelationship: vi.fn(),
      removeRelationship: vi.fn(),
      getRelated: vi.fn().mockResolvedValue([]),
      linkToPattern: vi.fn(),
      linkToConstraint: vi.fn(),
      linkToFile: vi.fn(),
      linkToFunction: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      countByType: vi.fn().mockResolvedValue({}),
      getSummaries: vi.fn().mockResolvedValue([]),
      vacuum: vi.fn(),
      checkpoint: vi.fn(),
    } as unknown as IMemoryStorage;

    orchestrator = new LearningOrchestrator(mockStorage);
  });

  describe('learnFromCorrection', () => {
    it('should learn from a correction and create memory', async () => {
      const result = await orchestrator.learnFromCorrection(
        'const x = 1',
        'Follow the style convention for variable declarations',
        'const x = 1'
      );

      expect(result.success).toBe(true);
      expect(result.createdMemories).toHaveLength(1);
      expect(result.category).toBe('style_preference');
      expect(result.principles).toHaveLength(1);
    });

    it('should categorize security corrections correctly', async () => {
      const result = await orchestrator.learnFromCorrection(
        'eval(userInput)',
        'Never use eval with user input - security vulnerability',
        'JSON.parse(userInput)'
      );

      expect(result.category).toBe('security_issue');
    });

    it('should categorize pattern violations correctly', async () => {
      const result = await orchestrator.learnFromCorrection(
        'function getData() {}',
        'Follow the pattern convention for data fetching',
        'async function fetchData() {}'
      );

      expect(result.category).toBe('pattern_violation');
    });

    it('should link to file when context is provided', async () => {
      await orchestrator.learnFromCorrection(
        'old code',
        'feedback',
        'new code',
        { activeFile: 'src/test.ts' }
      );

      expect(mockStorage.linkToFile).toHaveBeenCalledWith(
        'new-mem-id',
        'src/test.ts'
      );
    });
  });

  describe('processFeedback', () => {
    it('should increase confidence on confirmation', async () => {
      const memory = createMockMemory({ confidence: 0.7 });
      vi.mocked(mockStorage.read).mockResolvedValue(memory);

      const result = await orchestrator.processFeedback('mem-1', 'confirmed');

      expect(result.success).toBe(true);
      expect(result.newConfidence).toBeGreaterThan(result.previousConfidence);
      expect(mockStorage.update).toHaveBeenCalled();
    });

    it('should decrease confidence on rejection', async () => {
      const memory = createMockMemory({ confidence: 0.7 });
      vi.mocked(mockStorage.read).mockResolvedValue(memory);

      const result = await orchestrator.processFeedback('mem-1', 'rejected');

      expect(result.success).toBe(true);
      expect(result.newConfidence).toBeLessThan(result.previousConfidence);
    });

    it('should handle non-existent memory', async () => {
      vi.mocked(mockStorage.read).mockResolvedValue(null);

      const result = await orchestrator.processFeedback('nonexistent', 'confirmed');

      expect(result.success).toBe(false);
      expect(result.memoryUpdated).toBe(false);
    });
  });

  describe('getValidationCandidates', () => {
    it('should return low-confidence memories', async () => {
      const lowConfMemory = createMockMemory({ id: 'low-conf', confidence: 0.3 });
      const highConfMemory = createMockMemory({ id: 'high-conf', confidence: 0.9 });
      vi.mocked(mockStorage.search).mockResolvedValue([lowConfMemory, highConfMemory]);

      const candidates = await orchestrator.getValidationCandidates(10);

      expect(candidates.length).toBe(1);
      expect(candidates[0]?.memoryId).toBe('low-conf');
      expect(candidates[0]?.reason).toBe('low_confidence');
    });

    it('should respect limit parameter', async () => {
      const memories = Array.from({ length: 20 }, (_, i) =>
        createMockMemory({ id: `mem-${i}`, confidence: 0.3 })
      );
      vi.mocked(mockStorage.search).mockResolvedValue(memories);

      const candidates = await orchestrator.getValidationCandidates(5);

      expect(candidates.length).toBe(5);
    });
  });

  describe('applyDecay', () => {
    it('should return zeros when no decay integrator is configured', async () => {
      const result = await orchestrator.applyDecay();

      expect(result.updated).toBe(0);
      expect(result.decayed).toBe(0);
    });
  });
});
