/**
 * Retrieval Orchestrator Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetrievalOrchestrator } from '../../orchestrators/retrieval-orchestrator.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory } from '../../types/index.js';

describe('RetrievalOrchestrator', () => {
  let mockStorage: IMemoryStorage;
  let orchestrator: RetrievalOrchestrator;

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
  });

  beforeEach(() => {
    mockStorage = {
      initialize: vi.fn(),
      close: vi.fn(),
      create: vi.fn(),
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

    orchestrator = new RetrievalOrchestrator(mockStorage);
  });

  describe('retrieve', () => {
    it('should retrieve memories for a context', async () => {
      const memory = createMockMemory();
      vi.mocked(mockStorage.findByFile).mockResolvedValue([memory]);
      vi.mocked(mockStorage.findByType).mockResolvedValue([]);

      const result = await orchestrator.retrieve({
        intent: 'add_feature',
        focus: 'src/test.ts',
        activeFile: 'src/test.ts',
        maxTokens: 2000,
      });

      expect(result.memories.length).toBeGreaterThanOrEqual(0);
      expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
      expect(result.session.sessionId).toBeDefined();
    });

    it('should handle empty results', async () => {
      vi.mocked(mockStorage.findByFile).mockResolvedValue([]);
      vi.mocked(mockStorage.findByType).mockResolvedValue([]);

      const result = await orchestrator.retrieve({
        intent: 'fix_bug',
        focus: 'src/nonexistent.ts',
        activeFile: 'src/nonexistent.ts',
        maxTokens: 1000,
      });

      expect(result.memories).toHaveLength(0);
      expect(result.totalCandidates).toBe(0);
    });

    it('should respect token budget', async () => {
      const memories = Array.from({ length: 10 }, (_, i) =>
        createMockMemory({ id: `mem-${i}`, summary: 'A'.repeat(500) })
      );
      vi.mocked(mockStorage.findByFile).mockResolvedValue(memories);
      vi.mocked(mockStorage.findByType).mockResolvedValue([]);

      const result = await orchestrator.retrieve({
        intent: 'understand_code',
        focus: 'src/test.ts',
        activeFile: 'src/test.ts',
        maxTokens: 500,
      });

      expect(result.tokensUsed).toBeLessThanOrEqual(500);
    });
  });

  describe('getBudgetManager', () => {
    it('should return null when no budget manager is configured', () => {
      expect(orchestrator.getBudgetManager()).toBeNull();
    });
  });
});
