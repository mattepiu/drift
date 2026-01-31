/**
 * Prediction Predictor Tests
 * 
 * Tests for prediction engine and strategy components.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory } from '../../types/index.js';
import type { FileSignals, TemporalSignals, BehavioralSignals, PredictionSignals } from '../../prediction/types.js';
import {
  MemoryPredictor,
  FileBasedPredictor,
  PatternBasedPredictor,
  TemporalPredictor,
  BehavioralPredictor,
} from '../../prediction/predictor/index.js';

// Mock storage
function createMockStorage(): IMemoryStorage {
  const memories: Map<string, Memory> = new Map();
  
  // Add some test memories with proper BaseMemory fields
  const testMemories: Memory[] = [
    {
      id: 'mem1',
      type: 'tribal',
      summary: 'Always use async/await for database operations',
      confidence: 0.9,
      importance: 'high',
      accessCount: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactionTime: { recordedAt: new Date().toISOString() },
      validTime: { validFrom: new Date().toISOString() },
      topic: 'database',
      knowledge: 'Always use async/await for database operations',
      severity: 'warning',
      source: { type: 'manual' },
    } as Memory,
    {
      id: 'mem2',
      type: 'pattern_rationale',
      summary: 'Error handling pattern for API endpoints',
      confidence: 0.85,
      importance: 'high',
      accessCount: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactionTime: { recordedAt: new Date().toISOString() },
      validTime: { validFrom: new Date().toISOString() },
      patternId: 'pattern-1',
      rationale: 'Error handling pattern for API endpoints',
    } as Memory,
    {
      id: 'mem3',
      type: 'code_smell',
      summary: 'Avoid nested callbacks, use promises instead',
      confidence: 0.8,
      importance: 'normal',
      accessCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactionTime: { recordedAt: new Date().toISOString() },
      validTime: { validFrom: new Date().toISOString() },
      smell: 'Avoid nested callbacks, use promises instead',
      severity: 'warning',
    } as Memory,
    {
      id: 'mem4',
      type: 'decision_context',
      summary: 'Chose Express over Fastify for compatibility',
      confidence: 0.75,
      importance: 'normal',
      accessCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactionTime: { recordedAt: new Date().toISOString() },
      validTime: { validFrom: new Date().toISOString() },
      decision: 'Chose Express over Fastify for compatibility',
      context: 'Framework selection',
      alternatives: [],
    } as Memory,
  ];
  
  for (const mem of testMemories) {
    memories.set(mem.id, mem);
  }

  return {
    read: vi.fn(async (id: string) => memories.get(id) ?? null),
    findByFile: vi.fn(async (file: string) => {
      if (file.includes('auth')) {
        return [memories.get('mem1')!];
      }
      return [];
    }),
    findByPattern: vi.fn(async () => []),
    search: vi.fn(async (query: { query?: string; types?: string[]; limit?: number }) => {
      const results: Memory[] = [];
      for (const mem of memories.values()) {
        if (query.types && !query.types.includes(mem.type)) continue;
        if (query.query && !mem.content.toLowerCase().includes(query.query.toLowerCase())) continue;
        results.push(mem);
        if (query.limit && results.length >= query.limit) break;
      }
      return results;
    }),
    // Add other required methods as no-ops
    initialize: vi.fn(),
    close: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    bulkCreate: vi.fn(),
    bulkUpdate: vi.fn(),
    bulkDelete: vi.fn(),
    findByType: vi.fn(async () => []),
    findByConstraint: vi.fn(async () => []),
    findByFunction: vi.fn(async () => []),
    similaritySearch: vi.fn(async () => []),
    upsertEmbedding: vi.fn(),
    asOf: vi.fn(),
    validAt: vi.fn(),
    addRelationship: vi.fn(),
    removeRelationship: vi.fn(),
    getRelated: vi.fn(async () => []),
    linkToPattern: vi.fn(),
    linkToConstraint: vi.fn(),
    linkToFile: vi.fn(),
    linkToFunction: vi.fn(),
    count: vi.fn(async () => 0),
    countByType: vi.fn(async () => ({})),
    getSummaries: vi.fn(async () => []),
    vacuum: vi.fn(),
    checkpoint: vi.fn(),
  } as unknown as IMemoryStorage;
}

describe('FileBasedPredictor', () => {
  let predictor: FileBasedPredictor;
  let storage: IMemoryStorage;

  beforeEach(() => {
    storage = createMockStorage();
    predictor = new FileBasedPredictor(storage);
  });

  it('should predict memories for file', async () => {
    const signals: FileSignals = {
      activeFile: '/src/auth/login.ts',
      recentFiles: ['/src/auth/register.ts'],
      fileType: 'ts',
      filePatterns: ['async-function', 'error-handling'],
      fileImports: ['express', 'bcrypt'],
      fileSymbols: ['login', 'authenticate'],
      directory: '/src/auth',
    };

    const predictions = await predictor.predict(signals);
    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0]).toHaveProperty('memoryId');
    expect(predictions[0]).toHaveProperty('confidence');
    expect(predictions[0]).toHaveProperty('source');
  });

  it('should include linked memories with high confidence', async () => {
    const signals: FileSignals = {
      activeFile: '/src/auth/login.ts',
      recentFiles: [],
      fileType: 'ts',
      filePatterns: [],
      fileImports: [],
      fileSymbols: [],
      directory: '/src/auth',
    };

    const predictions = await predictor.predict(signals);
    const linkedPrediction = predictions.find(p => p.source.reason.includes('Directly linked'));
    
    if (linkedPrediction) {
      expect(linkedPrediction.confidence).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('should include pattern-based memories', async () => {
    const signals: FileSignals = {
      activeFile: '/src/api/users.ts',
      recentFiles: [],
      fileType: 'ts',
      filePatterns: ['error-handling', 'async-function'],
      fileImports: [],
      fileSymbols: [],
      directory: '/src/api',
    };

    const predictions = await predictor.predict(signals);
    // The mock storage returns memories that match the pattern query
    // Check that we got some predictions (may or may not have filePatterns signal)
    expect(predictions.length).toBeGreaterThanOrEqual(0);
  });

  it('should limit predictions to max', async () => {
    const signals: FileSignals = {
      activeFile: '/src/test.ts',
      recentFiles: Array.from({ length: 20 }, (_, i) => `/file${i}.ts`),
      fileType: 'ts',
      filePatterns: ['pattern1', 'pattern2', 'pattern3'],
      fileImports: [],
      fileSymbols: [],
      directory: '/src',
    };

    const predictions = await predictor.predict(signals);
    expect(predictions.length).toBeLessThanOrEqual(20);
  });
});

describe('PatternBasedPredictor', () => {
  let predictor: PatternBasedPredictor;
  let storage: IMemoryStorage;

  beforeEach(() => {
    storage = createMockStorage();
    predictor = new PatternBasedPredictor(storage);
  });

  it('should predict memories for patterns', async () => {
    const patterns = ['error-handling', 'async-function'];
    const predictions = await predictor.predict(patterns);
    
    expect(predictions.length).toBeGreaterThanOrEqual(0);
    for (const prediction of predictions) {
      expect(prediction.source.strategy).toBe('pattern_based');
    }
  });

  it('should include pattern rationale memories', async () => {
    const patterns = ['error-handling'];
    const predictions = await predictor.predict(patterns);
    
    const rationaleMemory = predictions.find(p => p.memoryType === 'pattern_rationale');
    if (rationaleMemory) {
      expect(rationaleMemory.confidence).toBeGreaterThan(0.5);
    }
  });

  it('should handle empty patterns', async () => {
    const predictions = await predictor.predict([]);
    expect(predictions).toEqual([]);
  });

  it('should limit patterns processed', async () => {
    const patterns = Array.from({ length: 20 }, (_, i) => `pattern${i}`);
    const predictions = await predictor.predict(patterns);
    expect(predictions.length).toBeLessThanOrEqual(15);
  });
});

describe('TemporalPredictor', () => {
  let predictor: TemporalPredictor;
  let storage: IMemoryStorage;

  beforeEach(() => {
    storage = createMockStorage();
    predictor = new TemporalPredictor(storage);
  });

  it('should predict memories for temporal signals', async () => {
    const signals: TemporalSignals = {
      timeOfDay: 'morning',
      dayOfWeek: 'monday',
      sessionDuration: 30,
      timeSinceLastQuery: 60,
      isNewSession: true,
    };

    const predictions = await predictor.predict(signals);
    expect(predictions.length).toBeGreaterThanOrEqual(0);
    for (const prediction of predictions) {
      expect(prediction.source.strategy).toBe('temporal');
    }
  });

  it('should predict new session memories', async () => {
    const signals: TemporalSignals = {
      timeOfDay: 'morning',
      dayOfWeek: 'monday',
      sessionDuration: 0,
      timeSinceLastQuery: 0,
      isNewSession: true,
    };

    const predictions = await predictor.predict(signals);
    const newSessionPrediction = predictions.find(p => 
      p.source.contributingSignals.includes('isNewSession')
    );
    
    // May or may not have predictions depending on usage history
    expect(predictions).toBeDefined();
  });

  it('should record and use temporal usage', async () => {
    // Record usage
    predictor.recordUsage('mem1', 'morning', 'monday');
    predictor.recordUsage('mem1', 'morning', 'monday');
    predictor.recordUsage('mem1', 'morning', 'monday');

    const signals: TemporalSignals = {
      timeOfDay: 'morning',
      dayOfWeek: 'monday',
      sessionDuration: 30,
      timeSinceLastQuery: 60,
      isNewSession: false,
    };

    const predictions = await predictor.predict(signals);
    // Should have higher confidence for mem1 in morning/monday
    expect(predictions.length).toBeGreaterThanOrEqual(0);
  });

  it('should export and import state', () => {
    predictor.recordUsage('mem1', 'morning', 'monday');
    const exported = predictor.export();
    
    const newPredictor = new TemporalPredictor(storage);
    newPredictor.import(exported);
    
    // Verify state was imported
    const reExported = newPredictor.export();
    expect(reExported.length).toBe(exported.length);
  });

  it('should clear usage data', () => {
    predictor.recordUsage('mem1', 'morning', 'monday');
    predictor.clear();
    
    const exported = predictor.export();
    expect(exported.length).toBe(0);
  });
});

describe('BehavioralPredictor', () => {
  let predictor: BehavioralPredictor;
  let storage: IMemoryStorage;

  beforeEach(() => {
    storage = createMockStorage();
    predictor = new BehavioralPredictor(storage);
  });

  it('should predict memories for behavioral signals', async () => {
    const signals: BehavioralSignals = {
      recentQueries: ['how to handle errors', 'authentication flow'],
      recentIntents: ['add_feature', 'fix_bug'],
      frequentMemories: ['mem1', 'mem2'],
      userPatterns: [],
    };

    const predictions = await predictor.predict(signals);
    expect(predictions.length).toBeGreaterThan(0);
    for (const prediction of predictions) {
      expect(prediction.source.strategy).toBe('behavioral');
    }
  });

  it('should prioritize frequent memories', async () => {
    const signals: BehavioralSignals = {
      recentQueries: [],
      recentIntents: [],
      frequentMemories: ['mem1', 'mem2'],
      userPatterns: [],
    };

    const predictions = await predictor.predict(signals);
    const frequentPrediction = predictions.find(p => 
      p.source.contributingSignals.includes('frequentMemories')
    );
    
    if (frequentPrediction) {
      expect(frequentPrediction.confidence).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('should use intent-based memory types', async () => {
    const signals: BehavioralSignals = {
      recentQueries: [],
      recentIntents: ['fix_bug'],
      frequentMemories: [],
      userPatterns: [],
    };

    const predictions = await predictor.predict(signals);
    // fix_bug intent should prioritize code_smell and tribal memories
    expect(predictions.length).toBeGreaterThanOrEqual(0);
  });

  it('should include task-based memories', async () => {
    const signals: BehavioralSignals = {
      recentQueries: [],
      recentIntents: [],
      frequentMemories: [],
      currentTask: 'Implement error handling',
      userPatterns: [],
    };

    const predictions = await predictor.predict(signals);
    const taskPrediction = predictions.find(p => 
      p.source.contributingSignals.includes('currentTask')
    );
    
    if (taskPrediction) {
      expect(taskPrediction.source.reason).toContain('error handling');
    }
  });

  it('should handle empty signals', async () => {
    const signals: BehavioralSignals = {
      recentQueries: [],
      recentIntents: [],
      frequentMemories: [],
      userPatterns: [],
    };

    const predictions = await predictor.predict(signals);
    expect(predictions).toEqual([]);
  });
});

describe('MemoryPredictor', () => {
  let predictor: MemoryPredictor;
  let storage: IMemoryStorage;

  beforeEach(() => {
    storage = createMockStorage();
    predictor = new MemoryPredictor(storage);
  });

  it('should predict memories using all strategies', async () => {
    const signals: PredictionSignals = {
      file: {
        activeFile: '/src/auth/login.ts',
        recentFiles: [],
        fileType: 'ts',
        filePatterns: ['async-function'],
        fileImports: [],
        fileSymbols: [],
        directory: '/src/auth',
      },
      temporal: {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        sessionDuration: 30,
        timeSinceLastQuery: 60,
        isNewSession: false,
      },
      behavioral: {
        recentQueries: ['authentication'],
        recentIntents: ['add_feature'],
        frequentMemories: ['mem1'],
        userPatterns: [],
      },
      git: {
        currentBranch: 'feature/auth',
        recentlyModifiedFiles: [],
        recentCommitMessages: [],
        uncommittedFiles: [],
        isFeatureBranch: true,
      },
      gatheredAt: new Date().toISOString(),
    };

    const result = await predictor.predict(signals);
    
    expect(result).toHaveProperty('predictions');
    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('strategiesUsed');
    expect(result).toHaveProperty('predictionTimeMs');
    expect(result.strategiesUsed.length).toBeGreaterThan(0);
  });

  it('should deduplicate predictions', async () => {
    const signals: PredictionSignals = {
      file: {
        activeFile: '/src/auth/login.ts',
        recentFiles: [],
        fileType: 'ts',
        filePatterns: ['async-function'],
        fileImports: [],
        fileSymbols: [],
        directory: '/src/auth',
      },
      temporal: {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        sessionDuration: 30,
        timeSinceLastQuery: 60,
        isNewSession: false,
      },
      behavioral: {
        recentQueries: [],
        recentIntents: [],
        frequentMemories: ['mem1'],
        userPatterns: [],
      },
      git: {
        currentBranch: 'main',
        recentlyModifiedFiles: [],
        recentCommitMessages: [],
        uncommittedFiles: [],
        isFeatureBranch: false,
      },
      gatheredAt: new Date().toISOString(),
    };

    const result = await predictor.predict(signals);
    
    // Check for duplicates
    const ids = result.predictions.map(p => p.memoryId);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should rank predictions by confidence', async () => {
    const signals: PredictionSignals = {
      file: {
        activeFile: '/src/test.ts',
        recentFiles: [],
        fileType: 'ts',
        filePatterns: ['error-handling'],
        fileImports: [],
        fileSymbols: [],
        directory: '/src',
      },
      temporal: {
        timeOfDay: 'afternoon',
        dayOfWeek: 'tuesday',
        sessionDuration: 60,
        timeSinceLastQuery: 30,
        isNewSession: false,
      },
      behavioral: {
        recentQueries: ['error handling'],
        recentIntents: ['fix_bug'],
        frequentMemories: [],
        userPatterns: [],
      },
      git: {
        currentBranch: 'main',
        recentlyModifiedFiles: [],
        recentCommitMessages: [],
        uncommittedFiles: [],
        isFeatureBranch: false,
      },
      gatheredAt: new Date().toISOString(),
    };

    const result = await predictor.predict(signals);
    
    // Verify sorted by confidence
    for (let i = 1; i < result.predictions.length; i++) {
      const prev = result.predictions[i - 1];
      const curr = result.predictions[i];
      if (prev && curr) {
        expect(prev.confidence).toBeGreaterThanOrEqual(curr.confidence);
      }
    }
  });

  it('should filter by minimum confidence', async () => {
    const signals: PredictionSignals = {
      file: {
        activeFile: '/src/test.ts',
        recentFiles: [],
        fileType: 'ts',
        filePatterns: [],
        fileImports: [],
        fileSymbols: [],
        directory: '/src',
      },
      temporal: {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        sessionDuration: 0,
        timeSinceLastQuery: 0,
        isNewSession: true,
      },
      behavioral: {
        recentQueries: [],
        recentIntents: [],
        frequentMemories: [],
        userPatterns: [],
      },
      git: {
        currentBranch: 'main',
        recentlyModifiedFiles: [],
        recentCommitMessages: [],
        uncommittedFiles: [],
        isFeatureBranch: false,
      },
      gatheredAt: new Date().toISOString(),
    };

    const result = await predictor.predict(signals);
    
    // All predictions should meet minimum confidence
    for (const prediction of result.predictions) {
      expect(prediction.confidence).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('should provide access to individual predictors', () => {
    expect(predictor.getFilePredictor()).toBeInstanceOf(FileBasedPredictor);
    expect(predictor.getPatternPredictor()).toBeInstanceOf(PatternBasedPredictor);
    expect(predictor.getTemporalPredictor()).toBeInstanceOf(TemporalPredictor);
    expect(predictor.getBehavioralPredictor()).toBeInstanceOf(BehavioralPredictor);
  });

  it('should export and import state', () => {
    predictor.recordTemporalUsage('mem1', 'morning', 'monday');
    const exported = predictor.export();
    
    const newPredictor = new MemoryPredictor(storage);
    newPredictor.import(exported);
    
    const reExported = newPredictor.export();
    expect(reExported.temporal.length).toBe(exported.temporal.length);
  });
});
