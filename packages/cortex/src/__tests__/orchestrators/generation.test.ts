/**
 * Generation Orchestrator Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenerationOrchestrator } from '../../orchestrators/generation-orchestrator.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory } from '../../types/index.js';
import type { GenerationTarget, GeneratedCode, CodeProvenance } from '../../types/generation-context.js';

describe('GenerationOrchestrator', () => {
  let mockStorage: IMemoryStorage;
  let orchestrator: GenerationOrchestrator;

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

  const createMockTarget = (overrides: Partial<GenerationTarget> = {}): GenerationTarget => ({
    filePath: 'src/test.ts',
    language: 'typescript',
    type: 'new_function',
    ...overrides,
  });

  const createMockProvenance = (): CodeProvenance => ({
    requestId: 'req-1',
    influences: [
      {
        memoryId: 'mem-1',
        memoryType: 'tribal',
        influenceType: 'tribal_applied',
        description: 'Applied tribal knowledge',
        strength: 0.8,
      },
    ],
    warnings: [],
    appliedConstraints: [],
    avoidedAntiPatterns: [],
    confidence: 0.8,
    generatedAt: new Date().toISOString(),
  });

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

    orchestrator = new GenerationOrchestrator(mockStorage);
  });

  describe('buildContext', () => {
    it('should build generation context', async () => {
      const target = createMockTarget();
      const result = await orchestrator.buildContext(
        'add_feature',
        target,
        'Add a new user service'
      );

      expect(result.context).toBeDefined();
      expect(result.context.target).toEqual(target);
      expect(result.context.query).toBe('Add a new user service');
      expect(result.context.intent).toBe('implement');
      expect(result.buildTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should respect token budget', async () => {
      const target = createMockTarget();
      const result = await orchestrator.buildContext(
        'add_feature',
        target,
        'Add a new user service',
        { maxTokens: 1000 }
      );

      expect(result.context.tokenBudget.total).toBe(1000);
    });

    it('should include related memories from file', async () => {
      const memory = createMockMemory();
      vi.mocked(mockStorage.findByFile).mockResolvedValue([memory]);

      const target = createMockTarget();
      const result = await orchestrator.buildContext(
        'add_feature',
        target,
        'Add a new user service'
      );

      expect(result.context.relatedMemories.length).toBeGreaterThan(0);
    });

    it('should map intents correctly', async () => {
      const target = createMockTarget();

      const fixResult = await orchestrator.buildContext('fix_bug', target, 'Fix bug');
      expect(fixResult.context.intent).toBe('fix');

      const refactorResult = await orchestrator.buildContext('refactor', target, 'Refactor');
      expect(refactorResult.context.intent).toBe('refactor');

      const testResult = await orchestrator.buildContext('add_test', target, 'Add test');
      expect(testResult.context.intent).toBe('test');
    });
  });

  describe('validateGenerated', () => {
    it('should return passing result when no validator is configured', async () => {
      const context = (await orchestrator.buildContext(
        'add_feature',
        createMockTarget(),
        'test'
      )).context;

      const result = await orchestrator.validateGenerated('const x = 1;', context);

      expect(result.valid).toBe(true);
      expect(result.score).toBe(1.0);
    });
  });

  describe('trackOutcome', () => {
    it('should track accepted outcome', async () => {
      const memory = createMockMemory();
      vi.mocked(mockStorage.read).mockResolvedValue(memory);

      const generation: GeneratedCode = {
        code: 'const x = 1;',
        language: 'typescript',
        targetFile: 'src/test.ts',
        provenance: createMockProvenance(),
        generatedAt: new Date().toISOString(),
      };

      const result = await orchestrator.trackOutcome(generation, 'accepted');

      expect(result.success).toBe(true);
      expect(result.memoriesUpdated).toBeGreaterThanOrEqual(0);
    });

    it('should trigger learning on rejection with feedback', async () => {
      const memory = createMockMemory();
      vi.mocked(mockStorage.read).mockResolvedValue(memory);

      const generation: GeneratedCode = {
        code: 'const x = 1;',
        language: 'typescript',
        targetFile: 'src/test.ts',
        provenance: createMockProvenance(),
        generatedAt: new Date().toISOString(),
      };

      const result = await orchestrator.trackOutcome(
        generation,
        'rejected',
        'This approach is wrong'
      );

      expect(result.learningTriggered).toBe(true);
    });

    it('should update memory confidence based on outcome', async () => {
      const memory = createMockMemory({ confidence: 0.8 });
      vi.mocked(mockStorage.read).mockResolvedValue(memory);

      const generation: GeneratedCode = {
        code: 'const x = 1;',
        language: 'typescript',
        targetFile: 'src/test.ts',
        provenance: createMockProvenance(),
        generatedAt: new Date().toISOString(),
      };

      await orchestrator.trackOutcome(generation, 'accepted');

      expect(mockStorage.update).toHaveBeenCalled();
    });
  });

  describe('getFeedbackStats', () => {
    it('should return null when no feedback loop is configured', () => {
      const stats = orchestrator.getFeedbackStats();
      expect(stats).toBeNull();
    });
  });
});
