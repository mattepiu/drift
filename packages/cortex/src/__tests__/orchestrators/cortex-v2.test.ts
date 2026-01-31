/**
 * CortexV2 Main Orchestrator Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CortexV2 } from '../../orchestrators/cortex-v2.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory } from '../../types/index.js';

describe('CortexV2', () => {
  let mockStorage: IMemoryStorage;
  let cortex: CortexV2;

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

    cortex = new CortexV2(mockStorage);
  });

  describe('getContext', () => {
    it('should retrieve context for an intent', async () => {
      const result = await cortex.getContext('add_feature', 'src/test.ts');

      expect(result).toBeDefined();
      expect(result.session.sessionId).toBeDefined();
      expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
    });

    it('should respect maxTokens option', async () => {
      const result = await cortex.getContext('add_feature', 'src/test.ts', {
        maxTokens: 500,
      });

      expect(result.tokensUsed).toBeLessThanOrEqual(500);
    });
  });

  describe('getWhy', () => {
    it('should return unavailable message when no causal components', async () => {
      const result = await cortex.getWhy('understand_code', 'src/test.ts');

      expect(result.narrative).toBe('Causal analysis not available');
      expect(result.causalChain).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });
  });

  describe('learn', () => {
    it('should learn from a correction', async () => {
      const result = await cortex.learn(
        'old code',
        'Use better naming',
        'new code'
      );

      expect(result.success).toBe(true);
      expect(result.createdMemories.length).toBeGreaterThan(0);
    });
  });

  describe('processFeedback', () => {
    it('should process feedback on a memory', async () => {
      const memory = createMockMemory();
      vi.mocked(mockStorage.read).mockResolvedValue(memory);

      const result = await cortex.processFeedback('mem-1', 'confirmed');

      expect(result.success).toBe(true);
      expect(result.memoryUpdated).toBe(true);
    });
  });

  describe('getValidationCandidates', () => {
    it('should return validation candidates', async () => {
      const lowConfMemory = createMockMemory({ confidence: 0.3 });
      vi.mocked(mockStorage.search).mockResolvedValue([lowConfMemory]);

      const candidates = await cortex.getValidationCandidates(5);

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0]?.reason).toBe('low_confidence');
    });
  });

  describe('buildGenerationContext', () => {
    it('should build generation context', async () => {
      const context = await cortex.buildGenerationContext(
        'add_feature',
        { filePath: 'src/test.ts', language: 'typescript', type: 'new_function' },
        'Add a user service'
      );

      expect(context).toBeDefined();
      expect(context.target.filePath).toBe('src/test.ts');
      expect(context.query).toBe('Add a user service');
    });
  });

  describe('predict', () => {
    it('should return empty array when no prediction cache', async () => {
      const predictions = await cortex.predict('src/test.ts');

      expect(predictions).toHaveLength(0);
    });
  });

  describe('getHealth', () => {
    it('should return health report', async () => {
      vi.mocked(mockStorage.search).mockResolvedValue([
        createMockMemory({ confidence: 0.8 }),
        createMockMemory({ id: 'mem-2', confidence: 0.3 }),
      ]);

      const health = await cortex.getHealth();

      expect(health.overallScore).toBeGreaterThanOrEqual(0);
      expect(health.overallScore).toBeLessThanOrEqual(100);
      expect(health.memoryStats.total).toBe(2);
      expect(health.memoryStats.lowConfidenceCount).toBe(1);
    });

    it('should identify issues with low average confidence', async () => {
      vi.mocked(mockStorage.search).mockResolvedValue([
        createMockMemory({ confidence: 0.3 }),
        createMockMemory({ id: 'mem-2', confidence: 0.2 }),
      ]);

      const health = await cortex.getHealth();

      expect(health.issues.length).toBeGreaterThan(0);
      expect(health.issues.some(i => i.message.includes('confidence'))).toBe(true);
    });
  });

  describe('consolidate', () => {
    it('should remove low confidence memories', async () => {
      vi.mocked(mockStorage.search).mockResolvedValue([
        createMockMemory({ confidence: 0.1 }),
        createMockMemory({ id: 'mem-2', confidence: 0.8 }),
      ]);

      const result = await cortex.consolidate({ minConfidence: 0.2 });

      expect(result.removed).toBe(1);
      expect(mockStorage.delete).toHaveBeenCalledTimes(1);
    });

    it('should remove old unused memories', async () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);

      vi.mocked(mockStorage.search).mockResolvedValue([
        createMockMemory({
          createdAt: oldDate.toISOString(),
          accessCount: 1,
        }),
      ]);

      const result = await cortex.consolidate({ maxAgeDays: 365 });

      expect(result.removed).toBe(1);
    });
  });

  describe('validate', () => {
    it('should validate memories', async () => {
      vi.mocked(mockStorage.search).mockResolvedValue([
        createMockMemory({ summary: 'Valid memory' }),
      ]);

      const result = await cortex.validate();

      expect(result.valid).toBe(true);
      expect(result.totalValidated).toBe(1);
    });

    it('should detect missing summary', async () => {
      vi.mocked(mockStorage.search).mockResolvedValue([
        createMockMemory({ summary: '' }),
      ]);

      const result = await cortex.validate();

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBe(1);
      expect(result.issues[0]?.issue).toBe('Missing summary');
    });

    it('should auto-fix issues when enabled', async () => {
      vi.mocked(mockStorage.search).mockResolvedValue([
        createMockMemory({ summary: '' }),
      ]);

      const result = await cortex.validate({ autoFix: true });

      expect(result.issues[0]?.fixed).toBe(true);
      expect(mockStorage.update).toHaveBeenCalled();
    });
  });

  describe('getStorage', () => {
    it('should return the underlying storage', () => {
      expect(cortex.getStorage()).toBe(mockStorage);
    });
  });

  describe('getRetrievalOrchestrator', () => {
    it('should return the retrieval orchestrator', () => {
      expect(cortex.getRetrievalOrchestrator()).toBeDefined();
    });
  });

  describe('getLearningOrchestrator', () => {
    it('should return the learning orchestrator', () => {
      expect(cortex.getLearningOrchestrator()).toBeDefined();
    });
  });

  describe('getGenerationOrchestrator', () => {
    it('should return the generation orchestrator', () => {
      expect(cortex.getGenerationOrchestrator()).toBeDefined();
    });
  });
});
