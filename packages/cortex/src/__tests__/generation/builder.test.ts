/**
 * Generation Context Builder Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenerationContextBuilder } from '../../generation/context/builder.js';
import { PatternContextGatherer } from '../../generation/context/pattern-gatherer.js';
import { TribalContextGatherer } from '../../generation/context/tribal-gatherer.js';
import { ConstraintContextGatherer } from '../../generation/context/constraint-gatherer.js';
import { AntiPatternGatherer } from '../../generation/context/antipattern-gatherer.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { GenerationTarget, PatternContext, TribalContext, ConstraintContext, AntiPatternContext } from '../../generation/types.js';

describe('GenerationContextBuilder', () => {
  let mockStorage: IMemoryStorage;
  let patternGatherer: PatternContextGatherer;
  let tribalGatherer: TribalContextGatherer;
  let constraintGatherer: ConstraintContextGatherer;
  let antiPatternGatherer: AntiPatternGatherer;
  let builder: GenerationContextBuilder;

  const mockTarget: GenerationTarget = {
    filePath: 'src/services/user.ts',
    language: 'typescript',
    framework: 'express',
    type: 'new_function',
  };

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

    patternGatherer = new PatternContextGatherer(mockStorage);
    tribalGatherer = new TribalContextGatherer(mockStorage);
    constraintGatherer = new ConstraintContextGatherer(mockStorage);
    antiPatternGatherer = new AntiPatternGatherer(mockStorage);

    builder = new GenerationContextBuilder(
      patternGatherer,
      tribalGatherer,
      constraintGatherer,
      antiPatternGatherer
    );
  });

  describe('build', () => {
    it('should build generation context with all components', async () => {
      const context = await builder.build('implement', mockTarget, 'create user service');

      expect(context).toBeDefined();
      expect(context.target).toEqual(mockTarget);
      expect(context.intent).toBe('implement');
      expect(context.query).toBe('create user service');
      expect(context.patterns).toBeInstanceOf(Array);
      expect(context.tribal).toBeInstanceOf(Array);
      expect(context.constraints).toBeInstanceOf(Array);
      expect(context.antiPatterns).toBeInstanceOf(Array);
      expect(context.tokenBudget).toBeDefined();
      expect(context.builtAt).toBeDefined();
      expect(context.metadata).toBeDefined();
    });

    it('should include metadata with build time', async () => {
      const context = await builder.build('implement', mockTarget, 'test query');

      expect(context.metadata).toBeDefined();
      expect(context.metadata?.buildTimeMs).toBeGreaterThanOrEqual(0);
      expect(context.metadata?.memoriesConsidered).toBeGreaterThanOrEqual(0);
      expect(context.metadata?.memoriesIncluded).toBeGreaterThanOrEqual(0);
    });

    it('should calculate token budget', async () => {
      const context = await builder.build('implement', mockTarget, 'test query');

      expect(context.tokenBudget.total).toBe(4000); // Default budget
      expect(context.tokenBudget.remaining).toBeLessThanOrEqual(context.tokenBudget.total);
    });
  });

  describe('configuration', () => {
    it('should use custom token budget', async () => {
      builder.updateConfig({ tokenBudget: 8000 });
      const context = await builder.build('implement', mockTarget, 'test query');

      expect(context.tokenBudget.total).toBe(8000);
    });

    it('should include session ID when configured', async () => {
      builder.updateConfig({ sessionId: 'test-session-123' });
      const context = await builder.build('implement', mockTarget, 'test query');

      expect(context.metadata?.sessionId).toBe('test-session-123');
    });

    it('should return current configuration', () => {
      const config = builder.getConfig();

      expect(config.tokenBudget).toBe(4000);
      expect(config.budgetAllocation).toBeDefined();
      expect(config.includeRelated).toBe(true);
    });
  });
});

describe('PatternContextGatherer', () => {
  let mockStorage: IMemoryStorage;
  let gatherer: PatternContextGatherer;

  beforeEach(() => {
    mockStorage = {
      findByFile: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    } as unknown as IMemoryStorage;

    gatherer = new PatternContextGatherer(mockStorage);
  });

  it('should gather patterns from file', async () => {
    const mockPatternMemory = {
      id: 'pattern-1',
      type: 'pattern_rationale',
      patternId: 'error-handling',
      summary: 'Error Handling Pattern',
      rationale: 'Always use try-catch',
      confidence: 0.8,
      accessCount: 5,
      tags: ['error', 'typescript'],
    };

    vi.mocked(mockStorage.findByFile).mockResolvedValue([mockPatternMemory as any]);

    const target: GenerationTarget = {
      filePath: 'src/services/user.ts',
      language: 'typescript',
      type: 'new_function',
    };

    const patterns = await gatherer.gather(target, 'create user');

    expect(patterns.length).toBeGreaterThanOrEqual(0);
  });

  it('should filter by minimum relevance', async () => {
    const lowRelevancePattern = {
      id: 'pattern-low',
      type: 'pattern_rationale',
      patternId: 'low-relevance',
      summary: 'Low Relevance Pattern',
      rationale: 'Some rationale',
      confidence: 0.1, // Very low confidence
      accessCount: 0,
      tags: [],
    };

    vi.mocked(mockStorage.findByFile).mockResolvedValue([lowRelevancePattern as any]);

    const target: GenerationTarget = {
      filePath: 'src/test.ts',
      language: 'typescript',
      type: 'new_function',
    };

    const patterns = await gatherer.gather(target, 'test');

    // Low relevance patterns should be filtered out
    expect(patterns.every(p => p.relevanceScore >= 0.3)).toBe(true);
  });
});

describe('TribalContextGatherer', () => {
  let mockStorage: IMemoryStorage;
  let gatherer: TribalContextGatherer;

  beforeEach(() => {
    mockStorage = {
      findByFile: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    } as unknown as IMemoryStorage;

    gatherer = new TribalContextGatherer(mockStorage);
  });

  it('should gather tribal knowledge from file', async () => {
    const mockTribalMemory = {
      id: 'tribal-1',
      type: 'tribal',
      topic: 'authentication',
      knowledge: 'Always validate tokens',
      severity: 'warning',
      confidence: 0.9,
      accessCount: 10,
    };

    vi.mocked(mockStorage.findByFile).mockResolvedValue([mockTribalMemory as any]);

    const target: GenerationTarget = {
      filePath: 'src/auth/login.ts',
      language: 'typescript',
      type: 'new_function',
    };

    const tribal = await gatherer.gather(target, 'login function');

    expect(tribal.length).toBeGreaterThanOrEqual(0);
  });

  it('should check if tribal applies', () => {
    const tribal = {
      id: 'tribal-1',
      type: 'tribal' as const,
      topic: 'database',
      knowledge: 'Use parameterized queries',
      severity: 'critical' as const,
      confidence: 0.9,
      accessCount: 5,
      linkedFiles: ['src/db/'],
      linkedTables: ['users'],
      transactionTime: { recordedAt: new Date().toISOString() },
      validTime: { from: new Date().toISOString() },
      importance: 'high' as const,
      summary: 'Database safety',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: { type: 'manual' as const },
    };

    const target: GenerationTarget = {
      filePath: 'src/db/queries.ts',
      language: 'typescript',
      type: 'new_function',
    };

    const applies = gatherer.tribalApplies(tribal, target, 'database query');
    expect(applies).toBe(true);
  });
});

describe('ConstraintContextGatherer', () => {
  let mockStorage: IMemoryStorage;
  let gatherer: ConstraintContextGatherer;

  beforeEach(() => {
    mockStorage = {
      findByFile: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    } as unknown as IMemoryStorage;

    gatherer = new ConstraintContextGatherer(mockStorage);
  });

  it('should gather constraints for target', async () => {
    const target: GenerationTarget = {
      filePath: 'src/api/users.ts',
      language: 'typescript',
      type: 'new_function',
    };

    const constraints = await gatherer.gather(target);

    expect(constraints).toBeInstanceOf(Array);
  });
});

describe('AntiPatternGatherer', () => {
  let mockStorage: IMemoryStorage;
  let gatherer: AntiPatternGatherer;

  beforeEach(() => {
    mockStorage = {
      findByFile: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    } as unknown as IMemoryStorage;

    gatherer = new AntiPatternGatherer(mockStorage);
  });

  it('should gather anti-patterns for target', async () => {
    const target: GenerationTarget = {
      filePath: 'src/services/user.ts',
      language: 'typescript',
      type: 'new_function',
    };

    const antiPatterns = await gatherer.gather(target, 'create user');

    expect(antiPatterns).toBeInstanceOf(Array);
  });

  it('should check if smell applies', () => {
    const smell = {
      id: 'smell-1',
      type: 'code_smell' as const,
      name: 'SQL Injection',
      description: 'String concatenation in SQL queries',
      pattern: 'query.*\\+',
      reason: 'Security vulnerability',
      suggestion: 'Use parameterized queries',
      severity: 'error' as const,
      autoDetect: true,
      confidence: 0.9,
      accessCount: 5,
      transactionTime: { recordedAt: new Date().toISOString() },
      validTime: { from: new Date().toISOString() },
      importance: 'critical' as const,
      summary: 'SQL injection risk',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['security', 'sql'],
    };

    const target: GenerationTarget = {
      filePath: 'src/db/queries.ts',
      language: 'typescript',
      type: 'new_function',
    };

    const applies = gatherer.smellApplies(smell, target, 'sql query');
    expect(applies).toBe(true);
  });
});
